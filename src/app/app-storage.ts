// This is a local development sandbox, not production authentication.
// Next replaces this literal environment check in client production builds.
export const developerToolsAvailable = () => process.env.NODE_ENV === 'development';
export const DEVELOPER_MODE_KEY = 'little-garden.developer-mode.v1';
export const TEST_DATA_KEY = 'little-garden.sandbox.test.v1';
export const PREVIEW_DATA_KEY = 'little-garden.sandbox.preview.v1';
export type DataScope = 'real' | 'test' | 'preview';
let pendingOperations = 0;
// Never restore authorization from browser storage (including the legacy mode key).
let testModeEnabled = false;
let unlockAttempt = 0;
export function requireDeveloperTools() {
  if (!developerToolsAvailable()) throw new Error('개발 환경에서만 사용할 수 있는 테스트 기능이에요.');
}
export function dataScope(): DataScope {
  if (!developerToolsAvailable()) return 'real';
  return testModeEnabled ? 'test' : 'preview';
}
export function requireTestMode() {
  requireDeveloperTools();
  if (dataScope() !== 'test') throw new Error('관리자 테스트 모드를 먼저 켜 주세요.');
}
export function beginStorageOperation() {
  pendingOperations++;
  let finished = false;
  return () => { if (!finished) { finished = true; pendingOperations--; } };
}
function assertIdle() {
  if (pendingOperations) throw new Error('사진이나 기록을 처리하고 있어요. 저장이 끝난 뒤 다시 시도해 주세요.');
}
export function setDeveloperMode(enabled: boolean, password?: string, signal?: AbortSignal) {
  requireDeveloperTools(); assertIdle();
  const attempt = ++unlockAttempt;
  if (!enabled) { testModeEnabled = false; return; }
  if (typeof password !== 'string' || !/^[0-9]{4}$/.test(password)) throw new Error('비밀번호가 올바르지 않아요.');
  return (async () => {
    let response: Response;
    try {
      response = await fetch('/api/developer/unlock', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password }), cache: 'no-store', credentials: 'omit', signal,
      });
    } catch { throw new Error('비밀번호를 확인하지 못했어요. 서버 연결을 확인해 주세요.'); }
    if (signal?.aborted || attempt !== unlockAttempt) throw new Error('잠금 해제가 취소됐어요.');
    if (response.status === 401) throw new Error('비밀번호가 올바르지 않아요.');
    if (!response.ok) throw new Error('관리자 잠금을 해제할 수 없어요. 서버 설정을 확인해 주세요.');
    const result = await response.json();
    if (result?.ok !== true || signal?.aborted || attempt !== unlockAttempt) throw new Error('잠금 해제가 취소됐어요.');
    requireDeveloperTools(); assertIdle();
    testModeEnabled = true;
  })();
}
type Sandbox = { version: 1; values: Record<string, string> };
function readSandbox(key: string): Sandbox {
  const raw = localStorage.getItem(key);
  if (raw === null) return { version: 1, values: {} };
  try {
    const parsed = JSON.parse(raw);
    if (parsed?.version !== 1 || !parsed.values || typeof parsed.values !== 'object' || Array.isArray(parsed.values) || !Object.values(parsed.values).every(value => typeof value === 'string')) throw new Error();
    return parsed;
  } catch { throw new Error('격리된 테스트 저장소를 읽지 못했어요. 실제 데이터로 전환하지 않았어요. 개발자 테스트에서 초기화할 수 있어요.'); }
}
export const appStorage = {
  getItem(key: string): string | null {
    const scope = dataScope();
    if (scope === 'real') return localStorage.getItem(key);
    const values = readSandbox(scope === 'test' ? TEST_DATA_KEY : PREVIEW_DATA_KEY).values;
    return Object.hasOwn(values, key) ? values[key] : null;
  },
  setItem(key: string, value: string) {
    const scope = dataScope();
    if (scope === 'real') { localStorage.setItem(key, value); return; }
    const target = scope === 'test' ? TEST_DATA_KEY : PREVIEW_DATA_KEY;
    const sandbox = readSandbox(target);
    localStorage.setItem(target, JSON.stringify({ ...sandbox, values: { ...sandbox.values, [key]: value } }));
  },
};
export function photoDatabaseName() {
  const scope = dataScope();
  return 'little-garden.private-photos.v1' + (scope === 'real' ? '' : '.' + scope);
}
export function resetTestData() {
  requireTestMode(); assertIdle();
  // One write clears only this sandbox. No enumeration, clear(), or real photo DB access.
  localStorage.setItem(TEST_DATA_KEY, JSON.stringify({ version: 1, values: {} }));
}
