import 'server-only';
import { ensureCareHistory, parseCareHistory, type DailyCareRecommendation } from '../../app/daily-cares';
import { recordsSchema, type AccountRecords } from '../account-records/model';

/** Server entry point; the original deterministic algorithm is shared without modification. */
export function recommendAccountReflection(day: AccountRecords, previous: AccountRecords[]) {
  if (typeof window !== 'undefined') throw new Error('server-only');
  recordsSchema.parse(day);
  if (!day.record || day.record.answers.includes('')) throw new Error('incomplete-reflection');
  const history: DailyCareRecommendation[] = [];
  for (const raw of [day, ...previous]) {
    const value = recordsSchema.parse(raw);
    if (value.userId !== day.userId || value.date > day.date) throw new Error('invalid-history-owner');
    if (!value.record || value.record.stage === 'checkin') continue;
    const entry = { date: value.date, ids: [...value.cares].sort((a, b) => a.position - b.position).map(c => c.care_id),
      title: value.record.recommendation_title, ...(value.cares[0]?.catalog_version === 2 ? { catalogVersion: 2 } : {}) };
    if (value.cares.some(c => c.catalog_version !== value.cares[0].catalog_version || ![1, 2].includes(c.catalog_version))) throw new Error('invalid-history-catalog');
    const parsed = parseCareHistory([entry]);
    if (parsed.length !== 1) throw new Error('invalid-history-catalog');
    history.push(parsed[0]);
  }
  return ensureCareHistory(day.date, day.record.answers, history).find(entry => entry.date === day.date)!;
}
