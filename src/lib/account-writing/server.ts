import 'server-only';
import { authenticateAccount, reply } from '../account/auth';
import { allowedDate, recordsSchema, seoulToday } from '../account-records/model';
import { readAccountSnapshot } from '../account-records/snapshot';
import { sameText, writingFromRecords, writingInputSchema } from './model';
import { isApprovedDraftTester } from '../account-reflection/gates';
import { withPhotoDayLock } from '../account-photos/lock';

const PRODUCTION_WRITING_ENABLED = false;
type Options = { enabled?: () => boolean; allowedUser?: (id: string) => boolean; now?: () => Date; read?: typeof readAccountSnapshot };
export function createWritingHandler({ enabled = () => PRODUCTION_WRITING_ENABLED, allowedUser = () => true, now = () => new Date(), read = readAccountSnapshot }: Options = {}) {
  return async (request: Request) => {
    if (request.method !== 'PUT') return reply(405, { error: 'method-not-allowed' });
    if (new URL(request.url).search) return reply(400, { error: 'unexpected-input' });
    try {
      const auth = await authenticateAccount(request);
      if (auth instanceof Response) return auth;
      if (!enabled()) return reply(503, { error: 'writing-not-ready' });
      if (!allowedUser(auth.userId)) return reply(403, { error: 'writing-forbidden' });
      if (request.headers.get('content-type')?.split(';')[0].trim().toLowerCase() !== 'application/json') return reply(415, { error: 'json-required' });
      const raw = await request.text();
      if (raw.length > 8192) return reply(413, { error: 'input-too-large' });
      let input: unknown;
      try { input = JSON.parse(raw); } catch { return reply(400, { error: 'invalid-input' }); }
      const parsed = writingInputSchema.safeParse(input);
      if (!parsed.success) return reply(400, { error: 'invalid-input' });
      const { date, revision, note, comment } = parsed.data;
      if (!allowedDate(date, seoulToday(now()))) return reply(400, { error: 'invalid-date' });
      if (date !== seoulToday(now())) return reply(409, { error: 'day-changed' });
      const { client, userId } = auth;
      const readWriting = async () => {
        const day = recordsSchema.parse(await read(client, userId, date, seoulToday(now())));
        if (day.userId !== userId || day.date !== date) throw new Error('owner-mismatch');
        return writingFromRecords(day);
      };
      const before = await readWriting();
      if (before.revision !== revision) return reply(409, { error: 'writing-revision-conflict' });
      // Omission preserves the latest server field; explicit '' clears, null is rejected.
      const next = { note: note ?? before.note, comment: comment ?? before.comment };
      if (sameText(before, next)) return reply(200, before);
      if (auth.expiresAt <= Date.now()) return reply(401, { error: 'authentication-expired' });
      if (date !== seoulToday(now())) return reply(409, { error: 'day-changed' });
      request.signal.throwIfAborted();
      const result = await withPhotoDayLock(userId, date, () => Promise.resolve(client.rpc('onestep_save_writing', { p_date: date, p_note: next.note, p_comment: next.comment, p_revision: revision })));
      if (result.error) {
        if (result.error.code === '40001') return reply(409, { error: 'writing-revision-conflict' });
        if (['42883', 'PGRST202'].includes(result.error.code)) return reply(503, { error: 'writing-not-ready' });
        if (['22001', '22004', '22023'].includes(result.error.code)) return reply(400, { error: 'invalid-writing' });
        if (['42501', 'PGRST301', 'PGRST303'].includes(result.error.code)) return reply(403, { error: 'writing-forbidden' });
        return reply(503, { error: 'writing-uncertain-reload' });
      }
      if (!Number.isSafeInteger(result.data) || result.data !== revision + 1) throw new Error('invalid-ack');
      const saved = await readWriting();
      if (saved.revision < result.data || !sameText(saved, next)) return reply(409, { error: 'writing-changed-reload' });
      return reply(200, saved);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'EEXIST') return reply(409, { error: 'writing-revision-conflict' });
      if (error instanceof Error && error.message === 'record-not-found') return reply(409, { error: 'record-not-found' });
      return reply(503, { error: 'writing-uncertain-reload' });
    }
  };
}
export const handleWritingRequest = createWritingHandler({ enabled: () => process.env.NODE_ENV === 'development', allowedUser: isApprovedDraftTester });
