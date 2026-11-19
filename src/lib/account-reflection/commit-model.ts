import { z } from 'zod';
import { recordsSchema } from '../account-records/model';
import { draftInputSchema } from './model';

// Browser supplies only optimistic concurrency context; answers come from the DB.
export const commitInputSchema = draftInputSchema.pick({ date: true, revision: true }).strict();
export const committedDaySchema = recordsSchema.superRefine((value, ctx) => {
  const rewards = value.rewards.filter(r => r.reason === 'reflection');
  if (!value.record || value.record.stage === 'checkin' || value.cares.length !== 3 ||
      rewards.length !== 1 || rewards[0].delta !== 10 || rewards[0].event_key !== `${value.date}:reflection`) {
    ctx.addIssue({ code: 'custom', message: 'Commit not visible in ledger' });
  }
});
export const commitResponseSchema = z.object({ day: committedDaySchema, recovered: z.boolean() }).strict();
