// This is a local development sandbox, not production authentication.
// Next replaces these literal environment checks in client builds: `npm run build` is the user version,
// `NEXT_PUBLIC_DEVELOPER_TOOLS=on npm run build` a developer version whose settings accept the developer code.
export const developerToolsAvailable = () => process.env.NODE_ENV === 'development' || process.env.NEXT_PUBLIC_DEVELOPER_TOOLS === 'on';
export const DEVELOPER_MODE_KEY = 'little-garden.developer-mode.v1';
export const TEST_DATA_KEY = 'little-garden.sandbox.test.v1';
export const PREVIEW_DATA_KEY = 'little-garden.sandbox.preview.v1';
// 'account' = a signed-in user's own garden on this device (the user version). 'real' is the legacy
// unscoped device garden, kept untouched and never shown to an account.
export type DataScope = 'real' | 'account' | 'test' | 'preview' | 'demo';
const demoValues = new Map<string, string>();
export const isDemo = () => typeof window !== 'undefined' && window.location.pathname === '/demo';
let pendingOperations = 0;
// Never restore authorization from browser storage (including the legacy mode key).
let testModeEnabled = false;
let unlockAttempt = 0;
let accountId: string | null = null;
const accountPrefix = () => 'little-garden.account.' + accountId + '.';
// Each account gets its own developer sandbox; signed-out testing keeps the original keys.
const sandboxKey = (scope: 'test' | 'preview') => (scope === 'test' ? TEST_DATA_KEY : PREVIEW_DATA_KEY) + (accountId ? '.' + accountId : '');
export function requireDeveloperTools() {
  if (!developerToolsAvailable()) throw new Error('개발 환경에서만 사용할 수 있는 테스트 기능이에요.');
}
export function dataScope(): DataScope {
  if (isDemo()) return 'demo';
  if (testModeEnabled && developerToolsAvailable()) return 'test';
  if (accountId) return 'account';
  return developerToolsAvailable() ? 'preview' : 'real';
}
/** Signed-in Supabase user id (null on sign-out). Set before the garden mounts; a change remounts it. */
export function setAccountScope(id: string | null) {
  if (id !== null && !/^[0-9a-f-]{36}$/i.test(id)) throw new Error('계정 정보를 확인하지 못했어요.');
  if (id === accountId) return;
  accountId = id;
  testModeEnabled = false; // another person must never land in the previous person's developer sandbox
  unlockAttempt++; // and a code check started before the switch can no longer finish into it
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
  if (typeof password !== 'string' || !/^[0-9]{4}$/.test(password)) throw new Error('개발자 코드가 올바르지 않아요.');
  return (async () => {
    let response: Response;
    try {
      response = await fetch('/api/developer/unlock', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password }), cache: 'no-store', credentials: 'omit', signal,
      });
    } catch { throw new Error('비밀번호를 확인하지 못했어요. 서버 연결을 확인해 주세요.'); }
    if (signal?.aborted || attempt !== unlockAttempt) throw new Error('잠금 해제가 취소됐어요.');
    if (response.status === 401) throw new Error('개발자 코드가 올바르지 않아요.');
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
    if (scope === 'demo') return demoValues.get(key) ?? null;
    if (scope === 'real') return localStorage.getItem(key);
    if (scope === 'account') return localStorage.getItem(accountPrefix() + key);
    const values = readSandbox(sandboxKey(scope)).values;
    return Object.hasOwn(values, key) ? values[key] : null;
  },
  setItem(key: string, value: string) {
    const scope = dataScope();
    if (scope === 'demo') { demoValues.set(key, value); return; }
    if (scope === 'real') { localStorage.setItem(key, value); return; }
    if (scope === 'account') { localStorage.setItem(accountPrefix() + key, value); return; }
    const target = sandboxKey(scope);
    const sandbox = readSandbox(target);
    localStorage.setItem(target, JSON.stringify({ ...sandbox, values: { ...sandbox.values, [key]: value } }));
  },
};
export function photoDatabaseName() {
  const scope = dataScope();
  return 'little-garden.private-photos.v1' + (scope === 'real' ? '' : scope === 'account' ? '.account.' + accountId : '.' + scope + (accountId ? '.' + accountId : ''));
}
export function resetTestData() {
  requireTestMode(); assertIdle();
  // One write clears only this sandbox. No enumeration, clear(), or real photo DB access.
  localStorage.setItem(sandboxKey('test'), JSON.stringify({ version: 1, values: {} }));
}
// Age, non-medical notice (설계안 v2 §5.1) and the privacy policy (v2). Bump the version when the wording changes.
export const CONSENT_KEY = 'little-garden.consent.v1';
const CONSENT_VERSION = 2;
export function hasConsent() {
  try { return JSON.parse(appStorage.getItem(CONSENT_KEY) ?? 'null')?.version === CONSENT_VERSION; } catch { return false; }
}
export function saveConsent() {
  appStorage.setItem(CONSENT_KEY, JSON.stringify({ version: CONSENT_VERSION, acceptedAt: new Date().toISOString() }));
}
/** Deletes this scope's garden data and photos. Keeps the login session and other scopes' sandboxes. */
export async function deleteAllLocalData() {
  assertIdle();
  if (isDemo()) { demoValues.clear(); return; }
  // Whose data this is gets fixed before the first await: an account switch meanwhile must not redirect the delete.
  const scope = dataScope(), prefix = accountPrefix(), database = photoDatabaseName(), sandbox = scope === 'test' || scope === 'preview' ? sandboxKey(scope) : '';
  // Photos first: if this fails, records still point at them and the user can retry.
  await new Promise<void>((resolve, reject) => {
    const request = indexedDB.deleteDatabase(database);
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
    request.onblocked = () => reject(new Error('다른 창에서 정원을 열고 있어요. 다른 창을 닫고 다시 시도해 주세요.'));
  });
  if (scope === 'account') {
    for (const key of Array.from({ length: localStorage.length }, (_, i) => localStorage.key(i) ?? '')) if (key.startsWith(prefix)) localStorage.removeItem(key);
    return;
  }
  if (sandbox) { localStorage.setItem(sandbox, JSON.stringify({ version: 1, values: {} })); return; }
  const keys = Array.from({ length: localStorage.length }, (_, i) => localStorage.key(i) ?? '');
  for (const key of keys) {
    if (key.startsWith('little-garden.') && !/^little-garden\.(supabase-auth|sandbox|developer-|account\.)/.test(key)) localStorage.removeItem(key);
  }
}
