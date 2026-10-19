'use client';

import { useEffect, useRef, useState } from 'react';
import { developerToolsAvailable, resetTestData } from '../app-storage';
import { grantTestSunshine, readTestControls, setPurchaseFailure, simulateActivityDays, type TestControls } from '../developer-state';
import type { shopSnapshot } from '../shop-store';
export function SettingsScreen({ onDeveloper }: { onDeveloper: () => void }) {
  return <div className="settings-content"><section className="settings-card"><h2>나의 정원 설정</h2><p>기록과 사진은 이 브라우저에 보관돼요.</p></section>
    {developerToolsAvailable() && <button type="button" className="settings-menu" onClick={onDeveloper}><strong>개발자 테스트</strong><span>격리된 테스트 모드 ON / OFF <span aria-hidden="true">→</span></span></button>}
  </div>;
}
export function DeveloperSettings({ enabled, snapshot, dataError, onToggle, onRefresh, onOpen, canReset }: {
  enabled: boolean; snapshot: ReturnType<typeof shopSnapshot> | null; dataError: string;
  onToggle: (enabled: boolean, password?: string, signal?: AbortSignal) => Promise<void>; onRefresh: () => void; onOpen: (view: 'shop' | 'decorate' | 'home' | 'rewards') => void; canReset: () => void;
}) {
  const [error, setError] = useState('');
  const [confirmReset, setConfirmReset] = useState(false);
  const [message, setMessage] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const request = useRef<AbortController | null>(null);
  useEffect(() => () => request.current?.abort(), []);
  const toggle = async (next: boolean) => {
    if (request.current) return;
    const controller = new AbortController();
    request.current = controller;
    setBusy(true); setError(''); setMessage('');
    try {
      await onToggle(next, next ? password : undefined, controller.signal);
      if (!controller.signal.aborted) { setConfirmReset(false); setPassword(''); }
    } catch (cause) {
      if (!controller.signal.aborted) setError(cause instanceof Error ? cause.message : '모드를 바꾸지 못했어요.');
    } finally {
      request.current = null;
      if (!controller.signal.aborted) { setBusy(false); setPassword(''); }
    }
  };
  if (!developerToolsAvailable()) return <p className="settings-content">개발 환경에서만 사용할 수 있어요.</p>;
  let controls: TestControls | null = null;
  let readError = '';
  if (enabled) { try { controls = readTestControls(); } catch (cause) { readError = cause instanceof Error ? cause.message : '테스트 데이터를 읽지 못했어요.'; } }
  const run = (operation: () => void, success: string) => {
    try { operation(); onRefresh(); setError(''); setMessage(success); }
    catch (cause) { setError(cause instanceof Error ? cause.message : '테스트 상태를 저장하지 못했어요.'); setMessage(''); }
  };
  return <div className="settings-content developer-settings">
    <section className="settings-card"><h2>관리자 테스트 모드</h2><p>개발용 도구예요. 운영 관리자 인증 기능이 아니에요.</p>
      <button type="button" role="switch" aria-checked={enabled} disabled={busy || !enabled} className="developer-switch" onClick={() => void toggle(false)}><span>테스트 모드</span><strong>{enabled ? 'ON' : 'OFF · 잠김'}</strong></button>
      {!enabled && <form className="developer-unlock" onSubmit={event => { event.preventDefault(); void toggle(true); }}>
        <label htmlFor="admin-test-password">관리자 비밀번호 (숫자 4자리)</label>
        <input id="admin-test-password" type="password" inputMode="numeric" pattern="[0-9]{4}" maxLength={4} autoComplete="off" value={password} disabled={busy} aria-invalid={Boolean(error)} aria-describedby={error ? 'admin-test-error' : undefined} onChange={event => { setPassword(event.target.value.replace(/[^0-9]/g, '').slice(0, 4)); setError(''); }} />
        <button type="submit" className="primary-button" disabled={busy || password.length !== 4}>{busy ? '확인 중…' : '잠금 해제하고 테스트 모드 켜기'}</button>
      </form>}
      <p>{enabled ? '테스트 전용 정원과 지급 내역을 사용하고 있어요.' : '일반 사용자 미리보기를 사용하고 있어요. 테스트 데이터는 보관 중이에요.'}</p>
      <p className="shop-storage-note">ON과 OFF는 각각 별도 저장소예요. 실제 사용자 기록·사진·구매 내역은 읽거나 수정하지 않아요.</p>
    </section>
    {(error || readError || dataError) && <p id="admin-test-error" className="shop-error" role="alert">{error || readError || dataError}</p>}
    {message && <p className="developer-message" role="status">{message}</p>}
    {enabled ? <>
      <section className="settings-card"><h2>햇살 테스트</h2><p className="developer-balance">현재 잔액 ☀️ {snapshot?.balance ?? '—'}</p><div className="developer-actions"><button type="button" onClick={() => run(() => { grantTestSunshine(100); }, '테스트 햇살 100개를 지급했어요.')}>+100 햇살</button><button type="button" onClick={() => run(() => { grantTestSunshine(1000); }, '테스트 햇살 1,000개를 지급했어요.')}>+1,000 햇살</button></div>
        <details><summary>테스트 지급 내역 ({controls?.transactions.length ?? 0})</summary><ul className="developer-transactions">{controls?.transactions.slice().reverse().map(entry => <li key={entry.id}><span>{entry.date} · 테스트 지급</span><strong>+{entry.delta}</strong></li>)}</ul></details>
      </section>
      <section className="settings-card"><h2>상점 · 정원 테스트</h2><p>실제 상점의 구매·배치 기능을 테스트 저장소로 사용해요. 잔액보다 비싼 상품을 선택하면 잔액 부족 안내를 확인할 수 있어요.</p><div className="developer-actions"><button type="button" onClick={() => onOpen('shop')}>상점 열기</button><button type="button" onClick={() => onOpen('decorate')}>정원 꾸미기</button><button type="button" onClick={() => onOpen('home')}>정원 보기</button></div>
        <label className="developer-check"><input type="checkbox" checked={controls?.failPurchases ?? false} onChange={event => run(() => { setPurchaseFailure(event.target.checked); }, '구매 실패 시뮬레이션 설정을 저장했어요.')}/>구매 저장 실패 시뮬레이션</label><p>켜면 구매가 실패하며 햇살과 보관함은 바뀌지 않아요.</p>
      </section>
      <section className="settings-card"><h2>활동일 테스트</h2><p>시뮬레이션: {controls?.simulatedDays ?? '사용 안 함'} · 보상 계산 활동일: {snapshot?.activeDays ?? '—'}일</p><div className="developer-actions"><button type="button" onClick={() => run(() => { simulateActivityDays(50); }, '테스트 활동일을 50일로 설정했어요.')}>50일 시뮬레이션</button><button type="button" onClick={() => run(() => { simulateActivityDays(100); }, '테스트 활동일을 100일로 설정했어요.')}>100일 시뮬레이션</button><button type="button" onClick={() => run(() => { simulateActivityDays(null); }, '활동일 시뮬레이션을 해제했어요.')}>시뮬레이션 해제</button><button type="button" onClick={() => onOpen('rewards')}>성장 보상 보기</button></div><p>실제 기록을 만들지 않아요. 테스트 보상은 기존 지급 로직으로 받아요. 이미 받은 보상은 시뮬레이션을 해제해도 유지돼요.</p>
      </section>
      <section className="settings-card"><h2>테스트 초기화</h2><p>테스트 햇살·구매·배치·활동일·보상·테스트 기록을 초기화해요. OFF 미리보기와 실제 사용자 데이터는 유지돼요.</p><button type="button" className="shop-secondary" onClick={() => setConfirmReset(true)}>테스트 데이터 초기화</button>
        {confirmReset && <div className="developer-confirm" role="alertdialog" aria-modal="false" aria-labelledby="test-reset-title"><h3 id="test-reset-title">테스트 데이터를 초기화할까요?</h3><p>테스트 상태만 비워져요. 실제 기록·사진·일기는 삭제하지 않아요.</p><div className="developer-actions"><button type="button" onClick={() => setConfirmReset(false)}>취소</button><button type="button" onClick={() => run(() => { canReset(); resetTestData(); setConfirmReset(false); }, '테스트 데이터를 초기화했어요.')}>초기화 확인</button></div></div>}
      </section>
    </> : <button type="button" className="primary-button" onClick={() => onOpen('home')}>일반 사용자 화면 보기</button>}
  </div>;
}
