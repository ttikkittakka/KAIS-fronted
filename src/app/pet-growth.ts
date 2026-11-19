import { bond, type CompanionState } from './companions';
import { localDay, type DailyCheckin } from './daily-checkin';
import { normalizeAnswers } from './questions';
import { developerUnlimited } from './developer-state';
import type { Unlock } from './chat';

// 마음 성숙도 grows with the days the user looked at themselves (all four check-in answers), one per day.
// Missed days never take anything away, the same rule as the bond (companions.ts).
export const MIND_STEPS = [0, 3, 7, 15] as const;
export const MIND_NAMES = ['새싹 마음', '자라는 마음', '단단한 마음', '깊은 마음'] as const;

export function mindGrowth(records: DailyCheckin[], today = localDay()) {
  const days = new Set(records.filter(r => r.date <= today && normalizeAnswers(r.answers).every(Boolean)).map(r => r.date)).size;
  const level = MIND_STEPS.filter(step => days >= step).length;
  return { level, days, next: MIND_STEPS[level] as number | undefined };
}

/** 레벨 = 친밀도 + 마음 성숙도 - 1 (1..6). The developer version's unlimited mode opens everything. */
export function petGrowth(state: CompanionState, records: DailyCheckin[]) {
  const adoption = state.adopted.find(a => a.id === state.active)!;
  const friend = bond(records, adoption.adoptedOn);
  const mind = mindGrowth(records);
  return { bond: friend, mind, level: friend.level + mind.level - 1, unlockAll: developerUnlimited() };
}
export type Growth = ReturnType<typeof petGrowth>;

export const unlocked = (growth: Growth, unlock: Unlock) => !unlock || growth.unlockAll
  || (unlock.meter === 'bond' ? growth.bond.level : unlock.meter === 'mind' ? growth.mind.level : growth.level) >= unlock.level;
