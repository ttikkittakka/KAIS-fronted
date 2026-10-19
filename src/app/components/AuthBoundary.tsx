'use client';

import { useEffect, useRef, useState, useSyncExternalStore, type FormEvent, type ReactNode } from 'react';
import { getAuthClient } from '../../lib/supabase/auth-client';
import { createAuthStore, INITIAL_AUTH, type AuthAction } from '../../lib/supabase/auth-store';
import { setDeveloperMode } from '../app-storage';

function clearAuthRedirect() {
  const url = new URL(window.location.href);
  for (const key of ['auth', 'code', 'error', 'error_code', 'error_description']) url.searchParams.delete(key);
  window.history.replaceState(window.history.state, '', url);
}

export default function AuthBoundary({ children }: { children: ReactNode }) {
  const [store] = useState(createAuthStore);
  const state = useSyncExternalStore(store.subscribe, store.getSnapshot, () => INITIAL_AUTH);
  const [mode, setMode] = useState<'login' | 'signup' | 'reset'>('login');
  const [developerEpoch, setDeveloperEpoch] = useState<number | null>(null);
  const [pinOpen, setPinOpen] = useState(false);
  const [pinBusy, setPinBusy] = useState(false);
  const [pinError, setPinError] = useState('');
  const pinLock = useRef(false);
  const panel = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const requested = new URL(window.location.href).searchParams.get('auth') === 'recovery';
    return store.start(getAuthClient(), requested);
  }, [store]);

  useEffect(() => {
    const viewport = window.visualViewport;
    let frame = 0;
    const reposition = () => {
      panel.current?.style.setProperty('--app-viewport-top', `${viewport?.offsetTop ?? 0}px`);
    };
    const resize = () => {
      reposition();
      panel.current?.style.setProperty('--app-viewport-height', `${viewport?.height ?? window.innerHeight}px`);
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        const focused = document.activeElement;
        if (focused instanceof HTMLInputElement && panel.current?.contains(focused)) focused.scrollIntoView({ block: 'nearest' });
      });
    };
    resize();
    viewport?.addEventListener('resize', resize);
    viewport?.addEventListener('scroll', reposition);
    document.addEventListener('focusin', resize);
    return () => {
      cancelAnimationFrame(frame);
      viewport?.removeEventListener('resize', resize);
      viewport?.removeEventListener('scroll', reposition);
      document.removeEventListener('focusin', resize);
    };
  }, [developerEpoch, state.phase, state.busy, state.epoch]);

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (pinLock.current) return;
    const form = event.currentTarget;
    const values = new FormData(form);
    const action: AuthAction = state.phase === 'recovery' ? 'update' : mode;
    const password = String(values.get('password') ?? '');
    const email = String(values.get('email') ?? '');
    // Credentials only live in the input/request; the application never persists them.
    const input = form.elements.namedItem('password');
    if (input instanceof HTMLInputElement) input.value = '';
    void store.submit(action, email, password, window.location.origin).then(ok => {
      if (ok && action !== 'reset') clearAuthRedirect();
    });
  };

  const logout = () => {
    void store.submit('logout').then(ok => {
      if (ok) { setMode('login'); clearAuthRedirect(); }
    });
  };

  const unlockDeveloper = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (pinLock.current || state.phase !== 'signed-out' || state.busy) return;
    pinLock.current = true;
    setPinBusy(true); setPinError('');
    const epoch = state.epoch;
    const form = event.currentTarget;
    const pin = String(new FormData(form).get('pin') ?? '');
    form.reset();
    try {
      await setDeveloperMode(true, pin);
      const current = store.getSnapshot();
      if (current.phase === 'signed-out' && !current.busy && current.epoch === epoch) setDeveloperEpoch(epoch);
    } catch { setPinError('개발용 PIN을 확인하지 못했어요. PIN과 개발 서버 설정을 확인해 주세요.'); }
    finally { pinLock.current = false; setPinBusy(false); }
  };

  // No production or authenticated account can mount the legacy record readers.
  if (process.env.NODE_ENV === 'development' && state.phase === 'signed-out' && !state.busy && developerEpoch === state.epoch) {
    return <><aside className="auth-dev-banner">개발용 로컬 정원 · Supabase 계정과 연결되지 않아요. <button onClick={() => window.location.reload()}>테스트 나가기</button></aside>{children}</>;
  }

  const loading = state.phase === 'loading';
  const account = state.phase === 'signed-in';
  const recovery = state.phase === 'recovery';
  const available = state.phase === 'signed-out' || recovery;
  return <main className="app-shell" ref={panel}>
    <div className="phone-frame">
    <div className="screen auth-screen">
    <section className={`auth-content${account ? ' auth-content--connected' : ''}`} aria-labelledby="auth-title" aria-busy={loading || state.busy}>
      <header className="auth-brand">
        <div className="auth-plant" role="img" aria-label="OneStep의 작은 새싹 캐릭터" />
        <p className="auth-eyebrow">오늘도, 나의 속도로</p>
        <h1 id="auth-title">나의 작은 정원</h1>
        {!account && <p className="auth-intro">나만의 정원에서 오늘의 나를 돌봐요.</p>}
      </header>
      <div className="auth-body">
      {loading && <p role="status">로그인 상태를 안전하게 확인하고 있어요.</p>}
      {state.message && (!account || state.error) && <p className={state.error ? 'auth-message auth-error' : 'auth-message'} role={state.error ? 'alert' : 'status'}>{state.message}</p>}
      {account && <div className="auth-account" key={state.user?.id}>
        <span className="auth-connected-label">계정 연결 완료</span>
        <h2>반가워요!</h2>
        <p>이제 나만의 작은 정원을 만나볼까요?</p>
        <p className="auth-email">{state.user?.email}</p>
        <p className="auth-preparing">계정별 정원을 준비하고 있어요.<br />준비가 끝나면 여기서 정원에 들어갈 수 있어요.</p>
        <button className="auth-secondary" disabled={state.busy} onClick={logout}>{state.busy ? '로그아웃 중…' : '다른 계정으로 로그인'}</button>
      </div>}
      {available && <>
        {(mode !== 'login' || recovery) && <h2>{recovery ? '새 비밀번호 설정' : mode === 'signup' ? '작은 정원 시작하기' : '비밀번호 재설정'}</h2>}
        {mode === 'reset' && !recovery && <p className="auth-help">이메일로 재설정 링크를 보내드려요.</p>}
        <form key={`${state.phase}-${mode}-${state.user?.id ?? ''}`} onSubmit={submit} className="auth-form">
          {!recovery && <label>이메일<input name="email" type="email" autoComplete="email" inputMode="email" autoCapitalize="none" spellCheck={false} required maxLength={254} disabled={state.busy || pinBusy} placeholder="garden@example.com" /></label>}
          {(mode !== 'reset' || recovery) && <label>{recovery ? '새 비밀번호' : '비밀번호'}<input name="password" type="password" autoComplete={mode === 'signup' || recovery ? 'new-password' : 'current-password'} required minLength={mode === 'signup' || recovery ? 8 : 1} maxLength={128} disabled={state.busy || pinBusy} aria-describedby={mode === 'signup' || recovery ? 'auth-password-help' : undefined}/></label>}
          {(mode === 'signup' || recovery) && <p className="auth-help" id="auth-password-help">비밀번호는 8자 이상으로 입력해 주세요.</p>}
          <button className="primary-button" type="submit" disabled={state.busy || pinBusy}>{state.busy ? '잠시만 기다려 주세요…' : recovery ? '새 비밀번호 저장' : mode === 'signup' ? '회원가입' : mode === 'reset' ? '재설정 이메일 보내기' : '로그인'}</button>
        </form>
        <div className="auth-links">
          {recovery ? <button disabled={state.busy} onClick={logout}>취소하고 로그아웃</button> : <>
            <button disabled={state.busy || pinBusy} onClick={() => setMode(mode === 'signup' ? 'login' : 'signup')}>{mode === 'signup' ? '로그인으로 돌아가기' : '회원가입'}</button>
            <button disabled={state.busy || pinBusy} onClick={() => setMode(mode === 'reset' ? 'login' : 'reset')}>{mode === 'reset' ? '로그인으로 돌아가기' : '비밀번호를 잊으셨나요?'}</button>
          </>}
        </div>
      </>}
      </div>
      <footer className="auth-footer">
      <p className="auth-footnote">기존 기기 기록은 그대로 보관돼요.<br />로그인한 계정에 자동으로 연결되지 않아요.</p>
      {process.env.NODE_ENV === 'development' && state.phase === 'signed-out' && <div className="auth-developer">
        <button disabled={state.busy || pinBusy} onClick={() => setPinOpen(!pinOpen)}>개발용 정원 테스트</button>
        {pinOpen && <form onSubmit={unlockDeveloper} className="auth-form">
          <p className="auth-help">개발용 PIN은 Supabase 로그인 비밀번호와 달라요. 기존 테스트 정원만 열어요.</p>
          <label>개발용 PIN<input name="pin" type="password" inputMode="numeric" autoComplete="off" pattern="[0-9]{4}" minLength={4} maxLength={4} required disabled={pinBusy || state.busy}/></label>
          {pinError && <p className="auth-message auth-error" role="alert">{pinError}</p>}
          <button className="primary-button" disabled={pinBusy || state.busy}>{pinBusy ? '확인 중…' : '테스트 정원 열기'}</button>
        </form>}
      </div>}
      </footer>
    </section>
    </div>
    </div>
  </main>;
}
