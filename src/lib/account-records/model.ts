import { z } from 'zod';
import { ACCOUNT_PROJECT } from '../account-garden/model';
import { noteSchema, commentSchema } from '../account-writing/text';

export const HISTORY_DAYS = 365;
export function seoulToday(now = new Date()) {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Seoul', year: 'numeric', month: '2-digit', day: '2-digit' }).format(now);
}
export function validDate(value: string) {
  return /^\d{4}-\d{2}-\d{2}$/.test(value) && Number.isFinite(Date.parse(value)) && new Date(value).toISOString().slice(0, 10) === value;
}
/** One day per request, inclusive of today and the preceding 365 days. */
export function allowedDate(date: string, today: string) {
  const age = (Date.parse(today) - Date.parse(date)) / 86400000;
  return validDate(date) && age >= 0 && age <= HISTORY_DAYS;
}
const integer = z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER);
const date = z.string().refine(validDate);
const owner = { user_id: z.uuid(), record_date: date };
const answer = z.enum(['', 'very_low', 'low', 'normal', 'good']);
const wideAnswer = z.enum(['', 'very_low', 'low', 'normal', 'good', 'very_good']);
export const recordsSchema = z.object({
  project: z.literal(ACCOUNT_PROJECT), userId: z.uuid(), today: date, date,
  sunshineBalance: integer,
  record: z.object({ ...owner, answers: z.tuple([answer, wideAnswer, answer, wideAnswer]),
    stage: z.enum(['checkin', 'photo', 'growth', 'care']), plant_state: z.enum(['low', 'normal']),
    note: noteSchema, photo_comment: commentSchema,
    recommendation_title: z.string().min(1).max(200).nullable(), revision: integer,
  }).nullable(),
  cares: z.array(z.object({ ...owner, position: z.number().int().min(1).max(3), care_id: z.string().min(1),
    catalog_version: z.number().int().positive(), completed_at: z.iso.datetime({ offset: true }).nullable(),
  })).max(3),
  rewards: z.array(z.object({ ...owner, event_key: z.string(), reason: z.enum(['reflection', 'participation', 'firstCare']),
    delta: z.number().int(), policy_version: z.literal(1),
  })).max(3),
}).superRefine((value, ctx) => {
  const fail = () => ctx.addIssue({ code: 'custom', message: 'Inconsistent account day' });
  if (!allowedDate(value.date, value.today)) fail();
  for (const row of [value.record, ...value.cares, ...value.rewards]) {
    if (row && (row.user_id !== value.userId || row.record_date !== value.date)) fail();
  }
  if (!value.record && (value.cares.length || value.rewards.length)) fail();
  if (new Set(value.cares.map(c => c.position)).size !== value.cares.length || new Set(value.cares.map(c => c.care_id)).size !== value.cares.length) fail();
  if (new Set(value.rewards.map(r => r.reason)).size !== value.rewards.length) fail();
  const record = value.record;
  if (record && record.stage !== 'checkin' && (record.answers.includes('') || value.cares.length !== 3 || !record.recommendation_title?.trim())) fail();
  if (record?.stage === 'checkin' && (value.cares.length || value.rewards.length)) fail();
  if (value.cares.some(c => c.completed_at !== null) && record?.stage !== 'care') fail();
  for (const reward of value.rewards) {
    if (reward.delta !== (reward.reason === 'participation' ? 5 : 10) || reward.event_key !== `${value.date}:${reward.reason}`) fail();
    if (!record || record.stage === 'checkin' || (reward.reason !== 'reflection' && record.stage !== 'care')) fail();
    if (reward.reason === 'firstCare' && !value.cares.some(c => c.completed_at)) fail();
  }
});
export type AccountRecords = z.infer<typeof recordsSchema>;
