import { z } from 'zod';
import { ACCOUNT_PROJECT } from '../account-garden/model';
import { validDate } from '../account-records/model';

const answer = z.enum(['', 'very_low', 'low', 'normal', 'good']);
const wide = z.enum(['', 'very_low', 'low', 'normal', 'good', 'very_good']);
export const answersSchema = z.tuple([answer, wide, answer, wide]);
export type DraftAnswers = z.infer<typeof answersSchema>;
export const revisionSchema = z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER - 1);
export const draftInputSchema = z.object({
  date: z.string().refine(validDate), answers: answersSchema, revision: revisionSchema,
}).strict();
export const draftResultSchema = z.object({
  changed: z.boolean(), revision: revisionSchema, date: z.string().refine(validDate),
}).strict();
export const startResponseSchema = z.object({
  project: z.literal(ACCOUNT_PROJECT), userId: z.uuid(), date: z.string().refine(validDate),
}).strict();
export const draftResponseSchema = startResponseSchema.extend(draftResultSchema.shape);
/** Only acknowledged answers determine progress. Four answers are still a draft. */
export function nextQuestion(answers: DraftAnswers) {
  const empty = answers.findIndex(answer => answer === '');
  return empty < 0 ? 4 : empty;
}
