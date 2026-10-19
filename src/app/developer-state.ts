import { appStorage, dataScope, requireTestMode } from './app-storage';
import { localDay } from './daily-checkin';
import { newLocalId } from './record-store';
import type { SunshineEntry } from './sunshine';
export const TEST_CONTROL_KEY = 'little-garden.developer-controls.v1';
export type TestTransaction = SunshineEntry<'developer-grant'> & { source: 'developer-test' };
export type TestControls = { version: 1; transactions: TestTransaction[]; simulatedDays: 0 | 50 | 100 | null; failPurchases: boolean };
export function readTestControls(): TestControls {
  requireTestMode();
  const raw = appStorage.getItem(TEST_CONTROL_KEY);
  if (raw === null) return { version: 1, transactions: [], simulatedDays: null, failPurchases: false };
  try {
    const value = JSON.parse(raw) as TestControls;
    if (value?.version !== 1 || !Array.isArray(value.transactions) || ![null,0,50,100].includes(value.simulatedDays) || typeof value.failPurchases !== 'boolean') throw new Error();
    const seen = new Set<string>();
    for (const entry of value.transactions) {
      if (!entry || entry.reason !== 'developer-grant' || entry.source !== 'developer-test' || typeof entry.id !== 'string' || seen.has(entry.id) || ![100,1000].includes(entry.delta) || typeof entry.date !== 'string' || typeof entry.createdAt !== 'string' || !Number.isFinite(Date.parse(entry.createdAt))) throw new Error();
      seen.add(entry.id);
    }
    if (!Number.isSafeInteger(value.transactions.reduce((sum, entry) => sum + entry.delta, 0))) throw new Error();
    return value;
  } catch { throw new Error('테스트 지급 내역이 손상됐어요. 테스트 데이터를 초기화해 주세요.'); }
}
function saveControls(value: TestControls) { requireTestMode(); appStorage.setItem(TEST_CONTROL_KEY, JSON.stringify(value)); return value; }
export function grantTestSunshine(amount: 100 | 1000) {
  requireTestMode();
  if (amount !== 100 && amount !== 1000) throw new Error('지원하지 않는 테스트 지급량이에요.');
  const controls = readTestControls();
  return saveControls({ ...controls, transactions: [...controls.transactions, { id: newLocalId(), date: localDay(), reason: 'developer-grant', source: 'developer-test', delta: amount, createdAt: new Date().toISOString() }] });
}
export function simulateActivityDays(days: 0 | 50 | 100 | null) {
  requireTestMode();
  if (![null,0,50,100].includes(days)) throw new Error('지원하지 않는 활동일이에요.');
  return saveControls({ ...readTestControls(), simulatedDays: days });
}
export function setPurchaseFailure(enabled: boolean) {
  requireTestMode();
  if (typeof enabled !== 'boolean') throw new Error('테스트 설정을 확인해 주세요.');
  return saveControls({ ...readTestControls(), failPurchases: enabled });
}
export function testSunshineBalance() {
  return dataScope() === 'test' ? readTestControls().transactions.reduce((sum, entry) => sum + entry.delta, 0) : 0;
}
export function simulatedActivityDays() { return dataScope() === 'test' ? readTestControls().simulatedDays : null; }
export function checkTestPurchaseFailure() {
  if (dataScope() === 'test' && readTestControls().failPurchases) throw new Error('테스트용 구매 저장 실패예요. 햇살과 보관함은 변경되지 않았어요. 설정에서 실패 시뮬레이션을 끄고 다시 시도해 주세요.');
}
