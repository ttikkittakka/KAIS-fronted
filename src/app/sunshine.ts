import type { DailyCheckin } from './daily-checkin';

export const SUNSHINE_REWARDS = { reflection: 10, participation: 5, firstCare: 10 } as const;
export type SunshineReason = keyof typeof SUNSHINE_REWARDS;
// Signed deltas allow a future purchase transaction; this version only creates earnings.
export type SunshineTransaction = { id: string; date: string; reason: SunshineReason; delta: number; createdAt: string };
export type SunshineLedger = { policyVersion: 1; startedAt: string; transactions: SunshineTransaction[] };
export function sunshineBalance(records: DailyCheckin[]) {
  return records.reduce((balance, record) => balance + (record.sunshine?.transactions.reduce((sum, item) => sum + item.delta, 0) ?? 0), 0);
}
export function validSunshine(value: unknown, date: string): value is SunshineLedger | undefined {
  if (value === undefined) return true;
  if (!value || typeof value !== 'object') return false;
  const ledger = value as SunshineLedger;
  if (ledger.policyVersion !== 1 || typeof ledger.startedAt !== 'string' || !Number.isFinite(Date.parse(ledger.startedAt)) || !Array.isArray(ledger.transactions) || ledger.transactions.length > 3) return false;
  const ids = new Set<string>();
  return ledger.transactions.every(item => {
    if (!item || !Object.hasOwn(SUNSHINE_REWARDS, item.reason) || item.date !== date || item.id !== date + ':' + item.reason || ids.has(item.id) || item.delta !== SUNSHINE_REWARDS[item.reason] || typeof item.createdAt !== 'string' || !Number.isFinite(Date.parse(item.createdAt)) || Date.parse(item.createdAt) < Date.parse(ledger.startedAt)) return false;
    ids.add(item.id); return true;
  });
}
export function nextSunshine(previous: DailyCheckin | undefined, next: DailyCheckin, reason: SunshineReason | undefined, today: string, now: string): SunshineLedger | undefined {
  // Existing unversioned records, including today's, stay ineligible. No read/edit migration pays rewards.
  const ledger = previous ? previous.sunshine : next.date === today ? { policyVersion: 1 as const, startedAt: now, transactions: [] } : undefined;
  if (!ledger || !reason || next.date !== today) return ledger;
  const id = next.date + ':' + reason;
  if (ledger.transactions.some(item => item.id === id)) return ledger;
  const answered = next.answers.length === 4 && next.answers.every(Boolean);
  const eligible = reason === 'reflection'
    ? answered && !(previous?.answers.length === 4 && previous.answers.every(Boolean))
    : reason === 'participation'
      ? answered && previous?.stage === 'growth' && next.stage === 'care'
      : answered && previous?.stage === 'care' && previous.completedCareIds.length === 0 && next.completedCareIds.some(id => previous.careRecommendations?.find(entry => entry.date === today)?.ids.some(careId => careId === id));
  if (!eligible) return ledger;
  return { ...ledger, transactions: [...ledger.transactions, { id, date: next.date, reason, delta: SUNSHINE_REWARDS[reason], createdAt: now }] };
}
