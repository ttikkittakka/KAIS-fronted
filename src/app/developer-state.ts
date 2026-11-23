import { appStorage, dataScope, requireTestMode } from './app-storage';
import { localDay } from './daily-checkin';
import { RECORDS_KEY, localOwner, newLocalId } from './record-store';
import { MISSIONS_KEY } from './missions';
import { VOICE_KEY } from './voice';
import type { SunshineEntry } from './sunshine';
export const TEST_CONTROL_KEY = 'little-garden.developer-controls.v1';
export type TestTransaction = SunshineEntry<'developer-grant'> & { source: 'developer-test' };
// unlimited (absent = on): the developer code exists to check everything, so sunshine never runs out and every lock opens.
export type TestControls = { version: 1; transactions: TestTransaction[]; simulatedDays: 0 | 50 | 100 | null; failPurchases: boolean; bond?: { visitDays: number; careDays: number }; unlimited?: boolean };
export const UNLIMITED_SUNSHINE = 1_000_000;
const validBondRule = (rule: unknown): rule is NonNullable<TestControls['bond']> => !!rule && typeof rule === 'object' && [(rule as { visitDays: unknown }).visitDays, (rule as { careDays: unknown }).careDays].every(n => Number.isSafeInteger(n) && (n as number) >= 0 && (n as number) <= 365);
export function readTestControls(): TestControls {
  requireTestMode();
  const raw = appStorage.getItem(TEST_CONTROL_KEY);
  if (raw === null) return { version: 1, transactions: [], simulatedDays: null, failPurchases: false };
  try {
    const value = JSON.parse(raw) as TestControls;
    if (value?.version !== 1 || !Array.isArray(value.transactions) || ![null,0,50,100].includes(value.simulatedDays) || typeof value.failPurchases !== 'boolean' || (value.bond !== undefined && !validBondRule(value.bond)) || (value.unlimited !== undefined && typeof value.unlimited !== 'boolean')) throw new Error();
    const seen = new Set<string>();
    for (const entry of value.transactions) {
      if (!entry || entry.reason !== 'developer-grant' || entry.source !== 'developer-test' || typeof entry.id !== 'string' || seen.has(entry.id) || !Number.isSafeInteger(entry.delta) || entry.delta <= 0 || entry.delta > UNLIMITED_SUNSHINE || typeof entry.date !== 'string' || typeof entry.createdAt !== 'string' || !Number.isFinite(Date.parse(entry.createdAt))) throw new Error();
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
/** Admin tuning of the companion bond (null restores the default). Test scope only. */
export function setBondRule(rule: TestControls['bond'] | null) {
  requireTestMode();
  if (rule !== null && !validBondRule(rule)) throw new Error('교감 기준은 0~365 사이의 정수로 입력해 주세요.');
  const controls = readTestControls();
  delete controls.bond;
  return saveControls(rule ? { ...controls, bond: rule } : controls);
}
/** cover: sunshine spent beyond the real balance while unlimited; granted on switching off so the balance never goes below 0. */
export function setUnlimited(enabled: boolean, cover = 0) {
  requireTestMode();
  if (typeof enabled !== 'boolean' || !Number.isSafeInteger(cover) || cover < 0 || cover > UNLIMITED_SUNSHINE) throw new Error('테스트 설정을 확인해 주세요.');
  const controls = readTestControls();
  const grant = !enabled && cover > 0 ? [{ id: newLocalId(), date: localDay(), reason: 'developer-grant' as const, source: 'developer-test' as const, delta: cover, createdAt: new Date().toISOString() }] : [];
  return saveControls({ ...controls, unlimited: enabled, transactions: [...controls.transactions, ...grant] });
}
export function bondRuleOverride() { return dataScope() === 'test' ? readTestControls().bond ?? null : null; }
/** Developer version with unlimited mode on. Damaged controls read as off; the developer screen reports them. */
export function developerUnlimited() {
  try { return dataScope() === 'test' && readTestControls().unlimited !== false; } catch { return false; }
}
export function testSunshineBalance() {
  if (dataScope() !== 'test') return 0;
  const controls = readTestControls();
  return controls.transactions.reduce((sum, entry) => sum + entry.delta, 0) + (controls.unlimited !== false ? UNLIMITED_SUNSHINE : 0);
}
export function simulatedActivityDays() { return dataScope() === 'test' ? readTestControls().simulatedDays : null; }
export function checkTestPurchaseFailure() {
  if (dataScope() === 'test' && readTestControls().failPurchases) throw new Error('테스트용 구매 저장 실패예요. 햇살과 보관함은 변경되지 않았어요. 설정에서 실패 시뮬레이션을 끄고 다시 시도해 주세요.');
}

// Example data for checking the records-tab charts. Test scope only; marked so it can be removed exactly.
const SAMPLE_MARK = '1999-12-31T00:00:00.000Z';
const LEVELS = ['very_low', 'low', 'normal', 'good', 'very_good'] as const;
const SAMPLE_CARES = ['water', 'rest', 'snack', 'easy-drink', 'comfortable-lean'];
const SAMPLE_WORDS = [['좋아', '산책', '고마워'], ['피곤해', '점심', '친구'], ['괜찮아', '하늘', '재밌었어'], ['힘들어', '걱정돼', '친구'], ['좋아', '친구', '노래']];
const SAMPLE_THOUGHTS = ['점심 메뉴', '창밖 새소리', '내일 할 일', '친구 얼굴'];
type Json = Record<string, unknown>;
const readJson = (key: string, fallback: Json) => { try { return (JSON.parse(appStorage.getItem(key) ?? 'null') as Json | null) ?? fallback; } catch { return fallback; } };

export function seedSampleData(days = 30) {
  requireTestMode();
  const owner = localOwner();
  const records = JSON.parse(appStorage.getItem(RECORDS_KEY) ?? '[]') as { date: string }[];
  const missions = readJson(MISSIONS_KEY, { version: 1, done: {}, values: {} }) as { version: 1; done: Json; values: Json };
  const voice = readJson(VOICE_KEY, { version: 1, days: {} }) as { version: 1; days: Json };
  const today = new Date(localDay() + 'T00:00:00');
  let added = 0;
  for (let back = days; back >= 1; back--) {
    if (back % 6 === 0) continue; // leave some days empty, like real use
    const d = new Date(today); d.setDate(today.getDate() - back);
    const date = localDay(d);
    if (records.some(r => r.date === date)) continue;
    const k = days - back;
    const wave = (n: number) => Math.max(1, Math.min(5, Math.round(2.4 + k / 14 + Math.sin(k / 2.3 + n))));
    const mood = wave(0), energy = wave(1.3);
    records.push({ version: 1, userId: owner, date, answers: [LEVELS[Math.min(3, wave(2.1)) - 1], LEVELS[energy - 1], LEVELS[Math.min(3, wave(0.7)) - 1], LEVELS[mood - 1]],
      note: '', plantState: mood <= 2 || energy <= 2 ? 'low' : 'normal', completedCareIds: k % 3 === 0 ? [] : [SAMPLE_CARES[k % SAMPLE_CARES.length]], stage: 'care', createdAt: SAMPLE_MARK } as never);
    missions.values = { ...missions.values, [date]: { heart: 64 + (k * 7) % 22, breath: 12 + (k * 5) % 7, ...(k % 4 === 0 ? { thought: SAMPLE_THOUGHTS[k % SAMPLE_THOUGHTS.length] } : {}) } };
    voice.days = { ...voice.days, [date]: Object.fromEntries(SAMPLE_WORDS[k % SAMPLE_WORDS.length].map((w, i) => [w, 1 + ((k + i) % 3)])) };
    added++;
  }
  appStorage.setItem(RECORDS_KEY, JSON.stringify(records));
  appStorage.setItem(MISSIONS_KEY, JSON.stringify(missions));
  appStorage.setItem(VOICE_KEY, JSON.stringify(voice));
  return added;
}
export function clearSampleData() {
  requireTestMode();
  const records = JSON.parse(appStorage.getItem(RECORDS_KEY) ?? '[]') as { date: string; createdAt?: string }[];
  const sampleDates = new Set(records.filter(r => r.createdAt === SAMPLE_MARK).map(r => r.date));
  const drop = (entries: Json = {}) => Object.fromEntries(Object.entries(entries).filter(([date]) => !sampleDates.has(date)));
  const missions = readJson(MISSIONS_KEY, { version: 1, done: {}, values: {} }) as { values?: Json };
  const voice = readJson(VOICE_KEY, { version: 1, days: {} }) as { days?: Json };
  appStorage.setItem(RECORDS_KEY, JSON.stringify(records.filter(r => r.createdAt !== SAMPLE_MARK)));
  appStorage.setItem(MISSIONS_KEY, JSON.stringify({ ...missions, values: drop(missions.values) }));
  appStorage.setItem(VOICE_KEY, JSON.stringify({ ...voice, days: drop(voice.days) }));
  return sampleDates.size;
}
