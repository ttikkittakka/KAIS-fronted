'use client';

import { Fragment, useEffect, useRef, useState, useSyncExternalStore, type FormEvent, type ReactNode } from 'react';
import { getAuthClient } from '../../lib/supabase/auth-client';
import { createAuthStore, INITIAL_AUTH, type AuthAction } from '../../lib/supabase/auth-store';
import { developerToolsAvailable, setAccountScope, setDeveloperMode } from '../app-storage';
import { SAFETY_CONTACTS } from '../safety';
import { koreanMobile } from '../install-phone';
import { saveInstallIntent, sendInstallIntent } from '../install-intent';
import { CompanionArt } from './Companions';
import AccountGarden from './AccountGarden';
import GardenLoading from './GardenLoading';

function clearAuthRedirect() {
  const url = new URL(window.location.href);
  for (const key of ['auth', 'code', 'error', 'error_code', 'error_description']) url.searchParams.delete(key);
  window.history.replaceState(window.history.state, '', url);
}

export default function AuthBoundary({ children, serverAccount = false }: { children: ReactNode; serverAccount?: boolean }) {
  const developer = serverAccount ? process.env.NODE_ENV === 'development' : developerToolsAvailable();
  const [store] = useState(createAuthStore);
  const state = useSyncExternalStore(store.subscribe, store.getSnapshot, () => INITIAL_AUTH);
  const [mode, setMode] = useState<'login' | 'signup' | 'reset'>('login');
  const [developerEpoch, setDeveloperEpoch] = useState<number | null>(null);
  const [pinOpen, setPinOpen] = useState(false);
  const [pinBusy, setPinBusy] = useState(false);
  const [pinError, setPinError] = useState('');
  const [smsConsent, setSmsConsent] = useState(false);
  const [smsError, setSmsError] = useState('');
  const [smsStatus, setSmsStatus] = useState('');
  const pinLock = useRef(false);
  const panel = useRef<HTMLDivElement>(null);
  // Unsaved drafts and caches live in memory; after a sign-out or a switch to another person a reload drops them.
  const signedInAs = useRef<string | null>(null);
  const currentAccount = state.phase === 'signed-in' ? state.user?.id ?? null : null;
  const accountEmail = currentAccount ? state.user?.email : undefined;
  useEffect(() => {
    if (!accountEmail) return;
    const controller = new AbortController();
    void sendInstallIntent(accountEmail, controller.signal).then(message => {
      if (message && !controller.signal.aborted) setSmsStatus(message);
    }, () => {
      if (!controller.signal.aborted) setSmsStatus('문자 안내를 확인하지 못했어요. 설치 페이지에서 바로 열 수 있어요.');
    });
    return () => controller.abort();
  }, [accountEmail]);
  useEffect(() => {
    if (signedInAs.current && signedInAs.current !== currentAccount) window.location.reload();
    signedInAs.current = currentAccount;
  }, [currentAccount]);

  useEffect(() => {
    const requested = new URL(window.location.href).searchParams.get('auth') === 'recovery';
    return store.start(getAuthClient(), requested);
  }, [store]);
  // The garden's settings screen asks for a logout through a window event, so it needs no auth props.
  useEffect(() => {
    const logout = () => { void store.submit('logout').then(ok => { if (ok) { setMode('login'); clearAuthRedirect(); } else window.dispatchEvent(new Event('little-garden:logout-failed')); }); };
    window.addEventListener('little-garden:logout', logout);
    return () => window.removeEventListener('little-garden:logout', logout);
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
    setSmsError('');
    if (action === 'signup') {
      const phone = values.has('smsConsent') ? koreanMobile(String(values.get('installPhone') ?? '')) : null;
      if (values.has('smsConsent') && !phone) { setSmsError('010으로 시작하는 휴대폰 번호를 입력해 주세요.'); return; }
      try { saveInstallIntent(email, phone); }
      catch { if (phone) { setSmsError('설치 문자 요청을 보관하지 못했어요. 체크를 끄고 가입할 수 있어요.'); return; } }
    }
    // Credentials only live in the input/request; the application never persists them.
    const input = form.elements.namedItem('password');
    if (input instanceof HTMLInputElement) input.value = '';
    void store.submit(action, email, password, window.location.origin).then(ok => {
      if (ok && action !== 'reset') clearAuthRedirect();
      if (!ok && action === 'signup') { try { saveInstallIntent(email, null); } catch {} }
    });
  };

  const logout = () => {
    void store.submit('logout').then(ok => {
      if (ok) { setMode('login'); clearAuthRedirect(); }
    });
  };

  const unlockDeveloper = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!developer || pinLock.current || !['signed-out', 'signed-in'].includes(state.phase) || state.busy || state.error) return;
    pinLock.current = true;
    setPinBusy(true); setPinError('');
    const epoch = state.epoch;
    const form = event.currentTarget;
    const pin = String(new FormData(form).get('pin') ?? '');
    form.reset();
    try {
      await setDeveloperMode(true, pin);
      const current = store.getSnapshot();
      if (current.phase === state.phase && current.user?.id === state.user?.id && !current.busy && !current.error && current.epoch === epoch) {
        setDeveloperEpoch(epoch); setPinOpen(false);
      } else {
        // 인증 상태가 바뀐 동안 도착한 PIN 응답으로 로컬 모드를 열지 않아요.
        await setDeveloperMode(false);
      }
    } catch { setPinError('개발용 PIN을 확인하지 못했어요. PIN과 개발 서버 설정을 확인해 주세요.'); }
    finally { pinLock.current = false; setPinBusy(false); }
  };

  const account = state.phase === 'signed-in' ? state.user : null;
  setAccountScope(account?.id ?? null);
  // Distinct mounts keep device data and account server data in their own scopes.
  if (developer && ['signed-out', 'signed-in'].includes(state.phase) && !state.busy && !state.error && developerEpoch === state.epoch) {
    return <div className="auth-local-mode"><aside className="auth-dev-banner">개발용 로컬 정원 · Supabase 계정과 연결되지 않아요. <button onClick={() => window.location.reload()}>테스트 나가기</button></aside>{children}</div>;
  }

  const loading = state.phase === 'loading';
  const signedIn = state.phase === 'signed-in';
  const recovery = state.phase === 'recovery';
  const available = state.phase === 'signed-out' || recovery;
  const developerEntry = developer && pinOpen ? <form onSubmit={unlockDeveloper} className="auth-form">
    <p className="auth-help">현재 앱의 로컬 개발자 모드를 열어요. 계정 기록은 가져오지 않으며, 추가한 햇살은 이 브라우저의 테스트 저장소에만 보관돼요.</p>
    <label>개발용 PIN<input name="pin" type="password" inputMode="numeric" autoComplete="off" pattern="[0-9]{4}" minLength={4} maxLength={4} required disabled={pinBusy || state.busy}/></label>
    {pinError && <p className="auth-message auth-error" role="alert">{pinError}</p>}
    <button className="primary-button" disabled={pinBusy || state.busy}>{pinBusy ? '확인 중…' : '개발자 모드 열기'}</button>
  </form> : undefined;
  const installNotice = smsStatus && <div className="install-toast" role="status"><span>{smsStatus}</span><a href="/install">설치 안내</a><button type="button" aria-label="안내 닫기" onClick={() => setSmsStatus('')}>×</button></div>;
  if (account && !serverAccount) return <Fragment key={account.id}>{installNotice}{children}</Fragment>;
  if (account && !state.busy && !state.error) {
    const garden = <AccountGarden key={account.id} userId={account.id} onLogout={logout} onDeveloper={developer ? () => { if (!pinLock.current) { setPinError(''); setPinOpen(!pinOpen); } } : undefined} developerEntry={developerEntry}/>;
    return installNotice ? <>{installNotice}{garden}</> : garden;
  }
  if (loading) return <main className="app-shell" ref={panel}><div className="phone-frame"><GardenLoading/></div></main>;
  return <main className="app-shell" ref={panel}>
    <div className="phone-frame">
    <div className="screen auth-screen">
    <section className={`auth-content${signedIn ? ' auth-content--connected' : ''}`} aria-labelledby="auth-title" aria-busy={loading || state.busy}>
      <header className="auth-brand">
        <CompanionArt id="bonsai" className="auth-plant" interactive={false}/>
        <p className="auth-eyebrow">오늘도, 나의 속도로</p>
        <h1 id="auth-title">나의 작은 정원</h1>
        {!signedIn && <p className="auth-intro">나만의 정원에서 오늘의 나를 돌봐요.</p>}
      </header>
      <div className="auth-body">
      {state.message && (!account || state.error) && <p className={state.error ? 'auth-message auth-error' : 'auth-message'} role={state.error ? 'alert' : 'status'}>{state.message}</p>}
      {account && <div className="auth-account" key={state.user?.id}>
        <span className="auth-connected-label">계정 연결 완료</span>
        <h2>반가워요!</h2>
        <p>이제 나만의 작은 정원을 만나볼까요?</p>
        <p className="auth-email">{state.user?.email}</p>
        <button className="auth-secondary" disabled={state.busy} onClick={logout}>{state.busy ? '로그아웃 중…' : '다른 계정으로 로그인'}</button>
      </div>}
      {available && <>
        {(mode !== 'login' || recovery) && <h2>{recovery ? '새 비밀번호 설정' : mode === 'signup' ? '작은 정원 시작하기' : '비밀번호 재설정'}</h2>}
        {mode === 'reset' && !recovery && <p className="auth-help">이메일로 재설정 링크를 보내드려요.</p>}
        <form key={`${state.phase}-${mode}-${state.user?.id ?? ''}`} onSubmit={submit} className="auth-form">
          {!recovery && <label>이메일<input name="email" type="email" autoComplete="email" inputMode="email" autoCapitalize="none" spellCheck={false} required maxLength={254} disabled={state.busy || pinBusy} placeholder="garden@example.com" /></label>}
          {(mode !== 'reset' || recovery) && <label>{recovery ? '새 비밀번호' : '비밀번호'}<input name="password" type="password" autoComplete={mode === 'signup' || recovery ? 'new-password' : 'current-password'} required minLength={mode === 'signup' || recovery ? 8 : 1} maxLength={128} disabled={state.busy || pinBusy} aria-describedby={mode === 'signup' || recovery ? 'auth-password-help' : undefined}/></label>}
          {(mode === 'signup' || recovery) && <p className="auth-help" id="auth-password-help">비밀번호는 8자 이상으로 입력해 주세요.</p>}
          {mode === 'signup' && !recovery && <div className="signup-install">
            <label className="quiet-check"><input type="checkbox" name="smsConsent" disabled={state.busy} checked={smsConsent} onChange={event => setSmsConsent(event.target.checked)}/><span>설치 링크를 문자로 받는 데 동의해요. (선택)</span></label>
            {smsConsent && <><label>내 휴대폰 번호<input name="installPhone" type="tel" autoComplete="tel" maxLength={18} placeholder="010-0000-0000" disabled={state.busy} required/></label><p className="auth-help">같은 브라우저에서 이메일 인증을 마치면 입력한 번호로 설치 안내를 한 번 보내요.</p></>}
            {smsError && <p role="alert" className="auth-error">{smsError}</p>}
          </div>}
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
      <a href="/demo" className="quiet-link auth-demo-link">로그인 없이 체험하기</a>
      <p className="auth-footnote">기존 기기 기록은 그대로 보관돼요.<br />로그인한 계정에 자동으로 연결되지 않아요.</p>
      {/* The safety center lives behind login, so the first screen links 109 directly. */}
      <p className="auth-footnote">지금 많이 힘들다면 <a href={'tel:' + SAFETY_CONTACTS[0].number}>{SAFETY_CONTACTS[0].number} {SAFETY_CONTACTS[0].name}</a> (24시간)</p>
      {developerToolsAvailable() && state.phase === 'signed-out' && <div className="auth-developer">
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
