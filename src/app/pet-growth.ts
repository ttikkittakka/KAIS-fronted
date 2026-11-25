import { bond, type CompanionState } from './companions';
import { isDemo } from './app-storage';
import { localDay, type DailyCheckin } from './daily-checkin';
import { validRecordDate } from './record-store';
import { isCareId } from './cares';
import { isRecoveryId } from './mission-policy';
import { readMissionLog } from './missions';
import { normalizeAnswers } from './questions';
import { developerUnlimited } from './developer-state';
import type { Unlock } from './chat';

// 마음 성숙도 grows with the days the user looked at themselves (all four check-in answers), one per day.
// Missed days never take anything away, the same rule as the bond (companions.ts).
export const MIND_STEPS = [0, 3, 7, 15] as const;

export const TREE_STAGES = [
  { level: 1, days: 0, name: '어린나무' },
  { level: 2, days: 3, name: '새 가지' },
  { level: 3, days: 7, name: '풍성한 나무' },
  { level: 4, days: 14, name: '성목' },
] as const;
export type TreeLevel = typeof TREE_STAGES[number]['level'];

export function treeGrowth(
  records: readonly DailyCheckin[],
  adoptedOn: string,
  today = localDay(),
  legacyMissions: Record<string, readonly string[]> = {},
) {
  if (isDemo()) {
    const stage = TREE_STAGES.at(-1)!;
    return { stage, days: stage.days, next: undefined };
  }
  const eligibleDate = (date: string) => date >= adoptedOn && date <= today && validRecordDate(date);
  const days = new Set(Object.entries(legacyMissions).filter(([date, done]) => eligibleDate(date) && done.length > 0).map(([date]) => date));
  for (const record of records) {
    if (!eligibleDate(record.date)) continue;
    const mood = normalizeAnswers(record.answers)[3];
    if (mood === 'normal' || mood === 'good' || mood === 'very_good' ||
      record.completedCareIds.some(isCareId) || record.completedMissionIds?.some(isRecoveryId) ||
      record.note.trim() || record.photoId || record.photoComment?.trim()) days.add(record.date);
  }
  const level = TREE_STAGES.filter(step => days.size >= step.days).length;
  return { stage: TREE_STAGES[level - 1], days: days.size, next: TREE_STAGES[level]?.days };
}

export function mindGrowth(records: DailyCheckin[], today = localDay()) {
  if (isDemo()) return { level: MIND_STEPS.length, days: MIND_STEPS.at(-1)!, next: undefined };
  const days = new Set(records.filter(r => r.date <= today && normalizeAnswers(r.answers).every(Boolean)).map(r => r.date)).size;
  const level = MIND_STEPS.filter(step => days >= step).length;
  return { level, days, next: MIND_STEPS[level] as number | undefined };
}

/** 레벨 = 친밀도 + 마음 성숙도 - 1 (1..6). The developer version's unlimited mode opens everything. */
export function petGrowth(state: CompanionState, records: DailyCheckin[]) {
  const adoption = state.adopted.find(a => a.id === state.active)!;
  const friend = bond(records, adoption.adoptedOn);
  const mind = mindGrowth(records);
  const tree = treeGrowth(records, adoption.adoptedOn, localDay(), readMissionLog().done);
  return { bond: friend, mind, tree, level: friend.level + mind.level - 1, unlockAll: developerUnlimited() };
}
export type Growth = ReturnType<typeof petGrowth>;

export const unlocked = (growth: Growth, unlock: Unlock) => !unlock || growth.unlockAll
  || (unlock.meter === 'bond' ? growth.bond.level : unlock.meter === 'mind' ? growth.mind.level : growth.level) >= unlock.level;
