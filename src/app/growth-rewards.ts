import { localDay, type DailyCheckin } from './daily-checkin';
import { normalizeAnswers } from './questions';
import { isCareId } from './cares';

export const GROWTH_MILESTONES = [
  { id: 'days-50', days: 50, itemIds: ['anniversary-friend'], title: '정원에 새로운 친구가 찾아왔어요!', description: '쉬어 간 날도 괜찮아요. 나를 돌본 50일을 기억하며, 별빛 친구 누리가 곁에 머물러요.' },
  { id: 'days-100', days: 100, itemIds: ['anniversary-sky', 'anniversary-flower'], title: '함께한 시간만큼 정원에도 새로운 모습이 생겼어요.', description: '차곡차곡 쌓인 100일에 고마움을 담았어요. 새 배경과 기념 꽃으로 정원을 꾸며 보세요. 더 많은 돌봄을 하지 않아도 괜찮아요.' },
] as const;
export type GrowthRewardId = typeof GROWTH_MILESTONES[number]['id'];
export type GrowthGrant = { id: GrowthRewardId; grantedAt: string; activeDays: number; seenAt?: string };
export const growthMilestone = (id: string) => GROWTH_MILESTONES.find(milestone => milestone.id === id);
export function activeDayCount(records: DailyCheckin[], today = localDay()): number {
  const days = new Set<string>();
  for (const record of records) {
    const date = record.date;
    if (!/^[0-9]{4}-[0-9]{2}-[0-9]{2}$/.test(date) || date > today) continue;
    const parsed = new Date(date + 'T00:00:00Z');
    if (!Number.isFinite(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== date) continue;
    if (normalizeAnswers(record.answers).every(Boolean) || record.completedCareIds?.some(isCareId)) days.add(date);
  }
  // Preserve the saved local calendar date; never regroup historical records by UTC timestamps.
  return days.size;
}
export function validGrowthGrants(value: unknown): value is GrowthGrant[] {
  if (!Array.isArray(value) || value.length > GROWTH_MILESTONES.length) return false;
  const seen = new Set<string>();
  return value.every(grant => {
    if (!grant || typeof grant !== 'object') return false;
    const milestone = growthMilestone(grant.id);
    if (!milestone || seen.has(grant.id) || !Number.isSafeInteger(grant.activeDays) || grant.activeDays < milestone.days || typeof grant.grantedAt !== 'string' || !Number.isFinite(Date.parse(grant.grantedAt))) return false;
    if (grant.seenAt !== undefined && (typeof grant.seenAt !== 'string' || !Number.isFinite(Date.parse(grant.seenAt)))) return false;
    seen.add(grant.id); return true;
  });
}
export function missingGrowthGrants(activeDays: number, existing: GrowthGrant[], now = new Date().toISOString()): GrowthGrant[] {
  return GROWTH_MILESTONES.filter(milestone => activeDays >= milestone.days && !existing.some(grant => grant.id === milestone.id))
    .map(milestone => ({ id: milestone.id, activeDays, grantedAt: now }));
}
// Optional extension registry. These entries never join the three daily recommendations,
// grant sunshine, or add daily completion requirements.
export const OPTIONAL_CARE_MODULES = [
  { id: 'quiet-moment', title: '잠깐 머물기', prompt: '지금 눈에 들어오는 작은 색 하나를 가만히 바라봐요. 아무것도 기록하지 않아도 괜찮아요.' },
] as const;
export const extraCareUnlocked = (grants: GrowthGrant[]) => grants.some(grant => grant.id === 'days-100');
