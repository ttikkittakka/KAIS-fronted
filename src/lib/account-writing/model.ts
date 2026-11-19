import { z } from 'zod';
import { ACCOUNT_PROJECT } from '../account-garden/model';
import { validDate, type AccountRecords } from '../account-records/model';
import { revisionSchema } from '../account-reflection/model';
import { noteSchema, commentSchema } from './text';

export const writingPatchSchema = z.object({ note: noteSchema.optional(), comment: commentSchema.optional() }).strict();
export type WritingText = { note: string; comment: string };
export const writingInputSchema = writingPatchSchema.extend({ date: z.string().refine(validDate), revision: revisionSchema })
  .refine(value => value.note !== undefined || value.comment !== undefined);
export const writingSchema = z.object({ project: z.literal(ACCOUNT_PROJECT), userId: z.uuid(), date: z.string().refine(validDate),
  revision: z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER), note: noteSchema, comment: commentSchema }).strict();
export type Writing = z.infer<typeof writingSchema>;
export function writingFromRecords(day: AccountRecords): Writing {
  if (!day.record) throw new Error('record-not-found');
  return writingSchema.parse({ project: day.project, userId: day.userId, date: day.date, revision: day.record.revision,
    note: day.record.note, comment: day.record.photo_comment });
}
export const sameText = (a: WritingText, b: WritingText) => a.note === b.note && a.comment === b.comment;
