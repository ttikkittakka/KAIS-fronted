import { appStorage } from './app-storage';
import { localDay, type DailyCheckin } from './daily-checkin';
import { isCareId } from './cares';
import { activeDayCount } from './growth-rewards';
import { bondRuleOverride, developerUnlimited } from './developer-state';

// Companions stay babies; what deepens is the bond between the user and the friend.
export const COMPANIONS = [
  { id: 'plant', name: '새싹이', kind: '새싹' },
  { id: 'cat', name: '나비', kind: '아기 고양이' },
  { id: 'dog', name: '보리', kind: '아기 강아지' },
  { id: 'pegasus', name: '비비', kind: '아기 페가수스' },
] as const;
export type CompanionId = typeof COMPANIONS[number]['id'];
export const companion = (id: CompanionId) => COMPANIONS.find(c => c.id === id)!;
const isCompanionId = (id: unknown): id is CompanionId => COMPANIONS.some(c => c.id === id);

export type BondLevel = 1 | 2 | 3;
export const BOND_LEVELS = ['처음 만난 사이', '친해지는 사이', '단짝'] as const;
export const bondName = (level: BondLevel) => BOND_LEVELS[level - 1];

// Level 2 comes within the first week (most mental-health app users leave by day 15, Baumel 2019)
// and needs no care at all. Level 3 counts days with a care, at most one per day, never consecutive
// days (a missed day does not slow habit formation, Lally 2010), so doing more than one care never pays.
export const DEFAULT_BOND = { visitDays: 3, careDays: 10 };
export type BondRule = typeof DEFAULT_BOND;
export function bondRule(): BondRule {
  try { return bondRuleOverride() ?? DEFAULT_BOND; } catch { return DEFAULT_BOND; }
}

export function bond(records: DailyCheckin[], adoptedOn: string, rule = bondRule(), today = localDay()) {
  const since = records.filter(record => record.date >= adoptedOn);
  const visitDays = activeDayCount(since, today);
  const careDays = new Set(since.filter(record => record.date <= today && (record.completedCareIds.some(isCareId) || record.completedMissionIds?.length)).map(record => record.date)).size;
  const level: BondLevel = visitDays < rule.visitDays ? 1 : careDays < rule.careDays ? 2 : 3;
  return { level, visitDays, careDays };
}

export const COMPANIONS_KEY = 'little-garden.companions.v1';
export type Adoption = { id: CompanionId; adoptedOn: string; seenLevel: BondLevel };
export type CompanionState = { version: 1; active: CompanionId; adopted: Adoption[] };

export function readCompanions(): CompanionState | null {
  try {
    const state = JSON.parse(appStorage.getItem(COMPANIONS_KEY) ?? 'null') as CompanionState | null;
    if (state?.version !== 1 || !Array.isArray(state.adopted) || !state.adopted.some(a => a.id === state.active)) return null;
    const valid = state.adopted.every(a => isCompanionId(a?.id) && /^\d{4}-\d{2}-\d{2}$/.test(a.adoptedOn) && [1, 2, 3].includes(a.seenLevel));
    return valid && new Set(state.adopted.map(a => a.id)).size === state.adopted.length ? state : null;
  } catch { return null; }
}
const save = (state: CompanionState) => { appStorage.setItem(COMPANIONS_KEY, JSON.stringify(state)); return state; };

/** One bond deepens at a time: a new friend joins only when every adopted friend is a 단짝. */
export function canAdopt(state: CompanionState | null, records: DailyCheckin[]) {
  return !state || developerUnlimited() || state.adopted.every(a => bond(records, a.adoptedOn).level === 3);
}
export function adoptCompanion(id: CompanionId, records: DailyCheckin[]) {
  const state = readCompanions();
  if (!isCompanionId(id) || state?.adopted.some(a => a.id === id)) throw new Error('이미 함께하는 친구예요.');
  if (!canAdopt(state, records)) throw new Error('지금 친구와 단짝이 되면 새 친구를 데려올 수 있어요.');
  return save({ version: 1, active: id, adopted: [...(state?.adopted ?? []), { id, adoptedOn: localDay(), seenLevel: 1 }] });
}
export function chooseCompanion(id: CompanionId) {
  const state = readCompanions();
  if (!state?.adopted.some(a => a.id === id)) throw new Error('아직 함께하지 않는 친구예요.');
  return save({ ...state, active: id });
}
export function markLevelSeen(id: CompanionId, level: BondLevel) {
  const state = readCompanions();
  if (!state) return null;
  return save({ ...state, adopted: state.adopted.map(a => a.id === id ? { ...a, seenLevel: Math.max(a.seenLevel, level) as BondLevel } : a) });
}
