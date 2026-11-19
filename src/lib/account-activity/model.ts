import { z } from 'zod';
import { commitInputSchema, committedDaySchema } from '../account-reflection/commit-model';
import type { AccountRecords } from '../account-records/model';

export const activityInputSchema = commitInputSchema.extend({
  action: z.enum(['photo_done', 'growth_done', 'care_done']), careId: z.string().min(1).max(100).optional(),
}).strict().refine(v => v.action === 'care_done' ? v.careId !== undefined : v.careId === undefined);
export type ActivityInput = z.infer<typeof activityInputSchema>;
export const activityDaySchema = committedDaySchema.superRefine((day, ctx) => {
  const participation = day.rewards.some(r => r.reason === 'participation');
  const firstCare = day.rewards.some(r => r.reason === 'firstCare');
  if ((day.record?.stage === 'care') !== participation || day.cares.some(c => c.completed_at !== null) !== firstCare ||
      day.rewards.reduce((sum, r) => sum + r.delta, 0) > 25) ctx.addIssue({ code: 'custom', message: 'Inconsistent activity ledger' });
});
/** Mirrors v2: already-completed requests are no-ops even with stale revisions. */
export function activityStatus(day: AccountRecords, input: ActivityInput): 'done' | 'available' | 'invalid' {
  const stage = day.record?.stage;
  if (!stage || stage === 'checkin') return 'invalid';
  if (input.action === 'photo_done') return stage === 'photo' ? 'available' : 'done';
  if (input.action === 'growth_done') return stage === 'care' ? 'done' : stage === 'growth' ? 'available' : 'invalid';
  const care = day.cares.find(c => c.care_id === input.careId);
  return stage !== 'care' || !care ? 'invalid' : care.completed_at ? 'done' : 'available';
}
export const activityEffectSchema = z.object({
  id: z.string(), action: z.enum(['photo_done', 'growth_done', 'care_done']), careId: z.string().nullable(),
  reward: z.union([z.literal(0), z.literal(5), z.literal(10)]),
  celebrate: z.boolean(), thirdCompletion: z.boolean(),
}).strict();
export type ActivityEffect = z.infer<typeof activityEffectSchema>;
export const activityResponseSchema = z.object({ day: activityDaySchema, changed: z.boolean(), effect: activityEffectSchema.nullable() }).strict();

/** Only an exact post-commit revision can attribute new rewards/completion to this request. */
export function activityEffect(before: AccountRecords, after: AccountRecords, input: ActivityInput, changed: boolean, revision: number): ActivityEffect | null {
  if (!changed || before.record?.revision !== input.revision || after.record?.revision !== revision || activityStatus(after, input) !== 'done') return null;
  const reason = input.action === 'growth_done' ? 'participation' : input.action === 'care_done' ? 'firstCare' : null;
  const reward = reason && !before.rewards.some(r => r.reason === reason) ? after.rewards.find(r => r.reason === reason)?.delta ?? 0 : 0;
  return activityEffectSchema.parse({ id: `${after.userId}:${after.date}:${revision}:${input.action}:${input.careId ?? ''}`,
    action: input.action, careId: input.careId ?? null, reward,
    celebrate: input.action === 'care_done',
    thirdCompletion: input.action === 'care_done' && before.cares.filter(c => c.completed_at).length === 2 && after.cares.every(c => c.completed_at),
  });
}
