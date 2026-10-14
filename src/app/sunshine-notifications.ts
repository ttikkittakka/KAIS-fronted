import type { DailyCheckin } from './daily-checkin';
export type SunshineNotice = { id: string; amount: number };
export const SUNSHINE_NOTICE_MS = 2950;
// Compare committed snapshots, never infer an award from activity or a page visit.
export function newSunshineNotices(before: DailyCheckin[], after: DailyCheckin[]): SunshineNotice[] {
  const key = (record: DailyCheckin, id: string) => (record.userId ?? '') + ':' + id;
  const previous = new Set(before.flatMap(record => record.sunshine?.transactions.map(item => key(record, item.id)) ?? []));
  return after.flatMap(record => record.sunshine?.transactions
    .filter(item => item.delta > 0 && !previous.has(key(record, item.id)))
    .map(item => ({ id: key(record, item.id), amount: item.delta })) ?? []);
}
export function enqueueSunshineNotices(queue: SunshineNotice[], incoming: SunshineNotice[], seen: Set<string>) {
  const fresh = incoming.filter(item => {
    if (seen.has(item.id)) return false;
    seen.add(item.id); return true;
  });
  return [...queue, ...fresh];
}
