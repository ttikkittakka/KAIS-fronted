'use client';

import { useEffect, useRef, useState } from 'react';
import { dataScope, deleteAllLocalData, developerToolsAvailable, resetTestData } from '../app-storage';
import { clearSampleData, grantTestSunshine, readTestControls, seedSampleData, setBondRule, setPurchaseFailure, setUnlimited, simulateActivityDays, UNLIMITED_SUNSHINE, type TestControls } from '../developer-state';
import { DEFAULT_BOND } from '../companions';
import { ownedItemIds, type shopSnapshot } from '../shop-store';
import { localDay, type DailyCheckin } from '../daily-checkin';
import { readMissionLog } from '../missions';
import { gardenPreferences, setGardenPreferences } from '../preferences';
import { guardianStatus, revokeGuardianShare } from '../guardian-share';
import { MISSION_PACES } from '../mission-policy';
export function SettingsScreen({ onDeveloper, records, snapshot, canDelete }: { onDeveloper: () => void; records: DailyCheckin[]; snapshot: ReturnType<typeof shopSnapshot> | null; canDelete: () => void }) {
  const [confirm, setConfirm] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [preferences, setPreferences] = useState(gardenPreferences);
  const updatePreferences = (patch: Parameters<typeof setGardenPreferences>[0]) => {
    try { setPreferences(setGardenPreferences(patch)); setError(''); }
    catch { setError('설정을 저장하지 못했어요.'); }
  };
  // Local-only data is lost with the browser data, so the user needs a copy they own. Photos stay on the device.
  const exportRecords = () => {
    const file = new Blob([JSON.stringify({ app: 'little-garden', version: 1, exportedAt: new Date().toISOString(), records, missions: readMissionLog().values }, null, 2)], { type: 'application/json' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(file);
    link.download = `나의정원-기록-${localDay()}.json`;
    link.click();
    setTimeout(() => URL.revokeObjectURL(link.href), 1000);
  };
  const remove = async () => {
    setBusy(true); setError('');
    try {
      canDelete();
      if (await guardianStatus()) await revokeGuardianShare();
      await deleteAllLocalData();
      // A fresh load drops in-memory drafts and caches and starts from the welcome screen.
      window.location.replace(window.location.pathname);
    } catch (cause) { setError(cause instanceof Error ? cause.message : '데이터를 지우지 못했어요. 다시 시도해 주세요.'); setBusy(false); }
  };
  const scope = dataScope();
  useEffect(() => {
    const failed = () => setError('로그아웃하지 못했어요. 연결을 확인하고 다시 시도해 주세요.');
    window.addEventListener('little-garden:logout-failed', failed);
    return () => window.removeEventListener('little-garden:logout-failed', failed);
  }, []);
  return <div className="settings-content"><section className="settings-card"><h2>나의 정원 설정</h2>
      <p>{scope === 'account' ? '로그인한 계정의 정원이에요. 기록과 사진은 이 기기 브라우저에 계정별로 보관돼요.' : scope === 'test' ? '개발자 버전 · 테스트 정원을 보고 있어요.' : '기록과 사진은 이 브라우저에 보관돼요.'}</p>
      {scope === 'account' && <button type="button" className="shop-secondary" onClick={() => window.dispatchEvent(new Event('little-garden:logout'))}>로그아웃</button>}</section>
    <a className="settings-menu" href="#companions"><strong>함께하는 친구들</strong><span>대표 친구 바꾸기 · 새 친구 데려오기 <span aria-hidden="true">→</span></span></a>
    <a className="settings-menu" href="#guardian"><strong>보호자 공유</strong><span>공유 링크 · 상태 갱신 · 공유 중단 <span aria-hidden="true">→</span></span></a>
    <a className="settings-menu" href="#connections"><strong>연락처와 안부 제안</strong><span>연락 기록 보기 · 알림 설정 <span aria-hidden="true">→</span></span></a>
    <a className="settings-menu" href="#support"><strong>지원 제도 신청 도우미</strong><span>찾기 · 신청서 작성 · 내 신청 현황 <span aria-hidden="true">→</span></span></a>
    <a className="settings-menu" href="#safety"><strong>도움 받을 수 있는 곳</strong><span>109 · 112 · 119 연락처 <span aria-hidden="true">→</span></span></a>
    <a className="settings-menu" href="#privacy"><strong>개인정보 처리방침</strong><span>모으는 정보 · 보관 기간 · 내 권리 <span aria-hidden="true">→</span></span></a>
    <section className="settings-card"><h2>미션 설정</h2>
      <label>선호하는 장소<select value={preferences.pace} onChange={event => updatePreferences({ pace: MISSION_PACES.find(pace => pace === event.target.value) ?? 'any' })}>
        <option value="any">어디든 편해요</option><option value="inside">실내가 좋아요</option><option value="outside">바깥이 좋아요</option>
      </select></label>
      {scope === 'account' && <><label className="quiet-check"><input type="checkbox" checked={preferences.ai} onChange={event => updatePreferences({ ai: event.target.checked })}/><span>AI 맞춤 추천 허용 (선택)</span></label>
        <p className="privacy-note">동의하면 응답 범주와 마음 단어 범주 또는 기능을 켠 연락 횟수만 모델이 사용해요. 일기 원문과 연락처는 기기에 남아요.</p></>}
    </section>
    <section className="settings-card"><h2>내 데이터</h2><p>일기 원문과 사진은 이 기기의 브라우저에 보관돼요. 보호자와 공유한 상태는 설정에서 닫을 수 있어요.</p>
      <dl className="data-summary">
        <div><dt>기록</dt><dd>{records.length}일</dd></div>
        <div><dt>사진</dt><dd>{records.filter(record => record.photoId).length}장</dd></div>
        <div><dt>햇살</dt><dd>{snapshot?.balance ?? '—'}</dd></div>
        <div><dt>모은 아이템</dt><dd>{snapshot ? ownedItemIds(snapshot.state).length + '개' : '—'}</dd></div>
      </dl>
      <button type="button" className="shop-secondary" disabled={!records.length} onClick={exportRecords}>내 기록 파일로 내보내기</button>
      <p className="privacy-note">질문 응답·한마디·코멘트·완료한 돌봄·1분 미션 기록을 JSON 파일로 저장해요. 사진은 포함되지 않아요.</p>
      {developerToolsAvailable() && <p>개발 모드에서는 지금 보고 있는 테스트 저장소만 지워요.</p>}
      {confirm ? <div className="developer-confirm" role="alertdialog" aria-modal="false" aria-labelledby="data-delete-title"><h3 id="data-delete-title">정원 데이터를 모두 지울까요?</h3><p>기록·사진·한마디·햇살·구매·꾸미기가 모두 사라지고 되돌릴 수 없어요. 로그인 계정은 그대로예요.</p>
        <div className="developer-actions"><button type="button" disabled={busy} onClick={() => setConfirm(false)}>취소</button><button type="button" className="danger-button" disabled={busy} onClick={() => void remove()}>{busy ? '지우고 있어요…' : '모두 지우기'}</button></div></div>
        : <button type="button" className="shop-secondary" onClick={() => setConfirm(true)}>내 데이터 모두 지우기</button>}
      {error && <p role="alert" className="shop-error">{error}</p>}
    </section>
    {developerToolsAvailable() && scope !== 'demo' && <button type="button" className="settings-menu" onClick={onDeveloper}><strong>개발자 코드 입력</strong><span>{scope === 'test' ? '개발자 버전 사용 중 · 끄면 유저 버전' : '코드를 넣으면 햇살 무제한 · 모두 열림'} <span aria-hidden="true">→</span></span></button>}
  </div>;
}
export function DeveloperSettings({ enabled, snapshot, dataError, onToggle, onRefresh, onOpen, canReset }: {
  enabled: boolean; snapshot: ReturnType<typeof shopSnapshot> | null; dataError: string;
  onToggle: (enabled: boolean, password?: string, signal?: AbortSignal) => Promise<void>; onRefresh: () => void; onOpen: (view: 'shop' | 'decorate' | 'home' | 'rewards' | 'garden') => void; canReset: () => void;
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
    <section className="settings-card"><h2>개발자 버전</h2><p>개발자 코드를 넣으면 따로 보관되는 테스트 정원으로 바뀌고, 햇살 무제한으로 모든 아이템을 사고 모든 상호작용을 열어 확인할 수 있어요. 끄면 원래 유저 버전으로 돌아가요. 운영 관리자 인증 기능은 아니에요.</p>
      <button type="button" role="switch" aria-checked={enabled} disabled={busy || !enabled} className="developer-switch" onClick={() => void toggle(false)}><span>개발자 버전</span><strong>{enabled ? 'ON' : 'OFF · 유저 버전'}</strong></button>
      {!enabled && <form className="developer-unlock" onSubmit={event => { event.preventDefault(); void toggle(true); }}>
        <label htmlFor="admin-test-password">개발자 코드 (숫자 4자리)</label>
        <input id="admin-test-password" type="password" inputMode="numeric" pattern="[0-9]{4}" maxLength={4} autoComplete="off" value={password} disabled={busy} aria-invalid={Boolean(error)} aria-describedby={error ? 'admin-test-error' : undefined} onChange={event => { setPassword(event.target.value.replace(/[^0-9]/g, '').slice(0, 4)); setError(''); }} />
        <button type="submit" className="primary-button" disabled={busy || password.length !== 4}>{busy ? '확인 중…' : '코드 확인하고 개발자 버전 켜기'}</button>
      </form>}
      <p>{enabled ? '테스트 전용 정원과 지급 내역을 사용하고 있어요.' : '일반 사용자 미리보기를 사용하고 있어요. 테스트 데이터는 보관 중이에요.'}</p>
      <p className="shop-storage-note">ON과 OFF는 각각 별도 저장소예요. 실제 사용자 기록·사진·구매 내역은 읽거나 수정하지 않아요.</p>
    </section>
    {(error || readError || dataError) && <p id="admin-test-error" className="shop-error" role="alert">{error || readError || dataError}</p>}
    {message && <p className="developer-message" role="status">{message}</p>}
    {enabled ? <>
      <section className="settings-card"><h2>무제한 모드</h2>
        <label className="developer-check"><input type="checkbox" checked={controls?.unlimited !== false} onChange={event => run(() => { setUnlimited(event.target.checked, Math.max(0, UNLIMITED_SUNSHINE - (snapshot?.balance ?? UNLIMITED_SUNSHINE))); }, event.target.checked ? '무제한 모드를 켰어요. 햇살 걱정 없이 모두 사고 열어 볼 수 있어요.' : '무제한 모드를 껐어요. 실제 잔액과 단계로 확인해요.')}/>햇살 무제한 · 모든 상호작용 열림 · 친구 바로 데려오기</label>
        <p>끄면 실제 사용자처럼 잔액 부족 안내와 잠긴 상호작용을 확인할 수 있어요. 무제한으로 쓴 햇살은 테스트 지급으로 채워서 잔액이 0 아래로 내려가지 않아요.</p>
      </section>
      <section className="settings-card"><h2>햇살 테스트</h2><p className="developer-balance">현재 잔액 ☀️ {snapshot?.balance ?? '—'}</p><div className="developer-actions"><button type="button" onClick={() => run(() => { grantTestSunshine(100); }, '테스트 햇살 100개를 지급했어요.')}>+100 햇살</button><button type="button" onClick={() => run(() => { grantTestSunshine(1000); }, '테스트 햇살 1,000개를 지급했어요.')}>+1,000 햇살</button></div>
        <details><summary>테스트 지급 내역 ({controls?.transactions.length ?? 0})</summary><ul className="developer-transactions">{controls?.transactions.slice().reverse().map(entry => <li key={entry.id}><span>{entry.date} · 테스트 지급</span><strong>+{entry.delta}</strong></li>)}</ul></details>
      </section>
      <section className="settings-card"><h2>상점 · 정원 테스트</h2><p>실제 상점의 구매·배치 기능을 테스트 저장소로 사용해요. 잔액보다 비싼 상품을 선택하면 잔액 부족 안내를 확인할 수 있어요.</p><div className="developer-actions"><button type="button" onClick={() => onOpen('shop')}>상점 열기</button><button type="button" onClick={() => onOpen('decorate')}>정원 꾸미기</button><button type="button" onClick={() => onOpen('home')}>정원 보기</button></div>
        <label className="developer-check"><input type="checkbox" checked={controls?.failPurchases ?? false} onChange={event => run(() => { setPurchaseFailure(event.target.checked); }, '구매 실패 시뮬레이션 설정을 저장했어요.')}/>구매 저장 실패 시뮬레이션</label><p>켜면 구매가 실패하며 햇살과 보관함은 바뀌지 않아요.</p>
      </section>
      <section className="settings-card"><h2>예시 기록 (그래프 확인용)</h2><p>지난 30일 중 25일치 예시 기록과 1분 미션·말한 단어 기록을 테스트 저장소에만 넣어요. 오늘과 이미 기록한 날은 건드리지 않고, 지우기는 예시로 넣은 것만 지워요.</p>
        <div className="developer-actions"><button type="button" onClick={() => run(() => { seedSampleData(); }, '예시 기록을 넣었어요. 기록 탭에서 그래프를 확인해 보세요.')}>30일 예시 기록 넣기</button><button type="button" onClick={() => run(() => { clearSampleData(); }, '예시 기록을 지웠어요.')}>예시 기록 지우기</button><button type="button" onClick={() => onOpen('garden')}>기록 탭 보기</button></div>
      </section>
      <section className="settings-card"><h2>활동일 테스트</h2><p>시뮬레이션: {controls?.simulatedDays ?? '사용 안 함'} · 보상 계산 활동일: {snapshot?.activeDays ?? '—'}일</p><div className="developer-actions"><button type="button" onClick={() => run(() => { simulateActivityDays(50); }, '테스트 활동일을 50일로 설정했어요.')}>50일 시뮬레이션</button><button type="button" onClick={() => run(() => { simulateActivityDays(100); }, '테스트 활동일을 100일로 설정했어요.')}>100일 시뮬레이션</button><button type="button" onClick={() => run(() => { simulateActivityDays(null); }, '활동일 시뮬레이션을 해제했어요.')}>시뮬레이션 해제</button><button type="button" onClick={() => onOpen('rewards')}>성장 보상 보기</button></div><p>실제 기록을 만들지 않아요. 테스트 보상은 기존 지급 로직으로 받아요. 이미 받은 보상은 시뮬레이션을 해제해도 유지돼요.</p>
      </section>
      <section className="settings-card"><h2>친구 교감 기준</h2><p>지금: 들른 날 {controls?.bond?.visitDays ?? DEFAULT_BOND.visitDays}일이면 친해지는 사이, 그 뒤 돌봄한 날 {controls?.bond?.careDays ?? DEFAULT_BOND.careDays}일이면 단짝이에요{controls?.bond ? ' (조절됨)' : ' (기본값)'}. 0으로 두면 그 단계를 바로 미리 볼 수 있어요.</p>
        <form key={JSON.stringify(controls?.bond ?? null)} className="developer-bond" onSubmit={event => { event.preventDefault(); const data = new FormData(event.currentTarget); run(() => { setBondRule({ visitDays: Number(data.get('visitDays')), careDays: Number(data.get('careDays')) }); }, '교감 기준을 저장했어요.'); }}>
          <label>친해지는 사이까지 들른 날<input name="visitDays" type="number" inputMode="numeric" min={0} max={365} required defaultValue={controls?.bond?.visitDays ?? DEFAULT_BOND.visitDays}/></label>
          <label>단짝까지 돌봄한 날<input name="careDays" type="number" inputMode="numeric" min={0} max={365} required defaultValue={controls?.bond?.careDays ?? DEFAULT_BOND.careDays}/></label>
          <div className="developer-actions"><button type="submit">저장</button><button type="button" onClick={() => run(() => { setBondRule(null); }, '기본 교감 기준으로 되돌렸어요.')}>기본값으로</button></div>
        </form>
      </section>
      <section className="settings-card"><h2>테스트 초기화</h2><p>테스트 햇살·구매·배치·활동일·보상·테스트 기록을 초기화해요. OFF 미리보기와 실제 사용자 데이터는 유지돼요.</p><button type="button" className="shop-secondary" onClick={() => setConfirmReset(true)}>테스트 데이터 초기화</button>
        {confirmReset && <div className="developer-confirm" role="alertdialog" aria-modal="false" aria-labelledby="test-reset-title"><h3 id="test-reset-title">테스트 데이터를 초기화할까요?</h3><p>테스트 상태만 비워져요. 실제 기록·사진·일기는 삭제하지 않아요.</p><div className="developer-actions"><button type="button" onClick={() => setConfirmReset(false)}>취소</button><button type="button" onClick={() => run(() => { canReset(); resetTestData(); setConfirmReset(false); }, '테스트 데이터를 초기화했어요.')}>초기화 확인</button></div></div>}
      </section>
    </> : <button type="button" className="primary-button" onClick={() => onOpen('home')}>일반 사용자 화면 보기</button>}
  </div>;
}
