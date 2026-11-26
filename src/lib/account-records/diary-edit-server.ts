import 'server-only';
import { z } from 'zod';
import { validDiaryAnswers } from '../../app/diary-edit';
import { smallJson } from '../request';
import { authenticateAccount, reply } from '../account/auth';
import { commentSchema, noteSchema } from '../account-writing/text';
import { allowedDate, recordsSchema, seoulToday } from './model';
import { readAccountRecords } from './server';

const input = z.object({
  date: z.string(),
  answers: z.array(z.string()).refine(validDiaryAnswers),
  note: noteSchema,
  photoComment: commentSchema,
  revision: z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER),
}).strict();

export function createDiaryEditHandler({ auth = authenticateAccount, read = readAccountRecords, now = () => new Date() } = {}) {
  return async (request: Request) => {
    if (request.method !== 'PATCH') return reply(405, { error: 'method-not-allowed' });
    const parsed = input.safeParse(await smallJson(request, 8192));
    const today = seoulToday(now());
    if (!parsed.success || new URL(request.url).search || !allowedDate(parsed.data.date, today))
      return reply(400, { error: 'invalid-diary-edit' });
    const { date, answers, note, photoComment, revision } = parsed.data;
    try {
      const account = await auth(request);
      if (account instanceof Response) return account;
      if (account.expiresAt <= Date.now()) return reply(401, { error: 'authentication-expired' });
      const { client, userId } = account;
      request.signal.throwIfAborted();
      const result = await client.rpc('onestep_edit_completed_diary', {
        p_date: date, p_answers: answers, p_note: note, p_comment: photoComment, p_revision: revision,
      });
      if (result.error) {
        if (result.error.code === '40001') return reply(409, { error: 'diary-revision-conflict' });
        if (result.error.code === '22023') return reply(400, { error: 'invalid-diary-edit' });
        if (result.error.code === '42501') return reply(403, { error: 'diary-edit-forbidden' });
        return reply(503, { error: 'diary-edit-unavailable' });
      }
      const saved = recordsSchema.parse(await read(client, userId, date, today));
      const row = saved.record;
      if (saved.userId !== userId || saved.date !== date || row?.stage !== 'care' || !Number.isSafeInteger(result.data) ||
        row.revision !== result.data || row.revision < revision || row.note !== note || row.photo_comment !== photoComment ||
        !row.answers.every((answer, index) => answer === answers[index])) return reply(409, { error: 'diary-changed-reload' });
      return reply(200, saved);
    } catch { return reply(503, { error: 'diary-edit-unavailable' }); }
  };
}

export const handleDiaryEditRequest = createDiaryEditHandler();
