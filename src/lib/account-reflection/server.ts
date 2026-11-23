import { z } from 'zod';
import { authenticateAccount, reply } from '../account/auth';
import { ACCOUNT_PROJECT } from '../account-garden/model';
import { seoulToday, validDate } from '../account-records/model';
import { draftInputSchema, draftResultSchema } from './model';
import { isAccountSnapshotEnabled, adaptAccountSnapshot } from '../account-records/snapshot';
import { isDayStartEnabled, isReflectionDraftEnabled, isApprovedDraftTester } from './gates';

const notReady = () => reply(503, { error: 'reflection-not-ready', message: '계정별 돌아보기 저장을 준비하고 있어요.' });
type Options = { startEnabled?: () => boolean; draftEnabled?: () => boolean; allowedUser?: (userId: string) => boolean; now?: () => Date; snapshotReady?: () => boolean };
/** Dependency injection is for offline tests; production routes use the locked defaults. */
export function createReflectionHandlers({ startEnabled = isDayStartEnabled, draftEnabled = isReflectionDraftEnabled, allowedUser = isApprovedDraftTester, now = () => new Date(), snapshotReady = isAccountSnapshotEnabled }: Options = {}) {
  async function handle(request: Request, action: 'start' | 'draft') {
    if (request.method !== 'POST') return reply(405, { error: 'method-not-allowed' });
    if (new URL(request.url).search) return reply(400, { error: 'unexpected-input' });
    try {
      const auth = await authenticateAccount(request);
      if (auth instanceof Response) return auth;
      if (!(action === 'start' ? startEnabled() : draftEnabled()) || !snapshotReady()) return notReady();
      if (!allowedUser(auth.userId)) return reply(403, { error: 'reflection-forbidden' }); // Verified Auth identity only; no RPC before this check.
      if (!request.headers.get('content-type')?.split(';')[0].trim().match(/^application\/json$/i)) return reply(415, { error: 'json-required' });
      const text = await request.text();
      if (text.length > 2048) return reply(413, { error: 'input-too-large' });
      let input: unknown;
      try { input = JSON.parse(text); } catch { return reply(400, { error: 'invalid-input' }); }
      const { client, userId } = auth;
      const before = seoulToday(now());
      if (action === 'start') {
        if (!z.object({}).strict().safeParse(input).success) return reply(400, { error: 'invalid-input' });
        const result = await client.rpc('onestep_start_day');
        if (result.error) return rpcError(result.error);
        // DB transaction date is authoritative, including a midnight crossed in flight.
        if (typeof result.data !== 'string' || !validDate(result.data) || ![before, seoulToday(now())].includes(result.data)) {
          return reply(502, { error: 'invalid-start-result' });
        }
        return reply(200, { project: ACCOUNT_PROJECT, userId, date: result.data });
      }
      const parsed = draftInputSchema.safeParse(input);
      if (!parsed.success) return reply(400, { error: 'invalid-input' });
      if (parsed.data.date !== before) return reply(409, { error: 'day-changed' });
      const { date, answers, revision } = parsed.data;
      // Detect a proven stale draft before entering the write RPC. This read uses the
      // verified caller's JWT/RLS; the RPC still performs its atomic revision check.
      const snapshot = await client.rpc('onestep_get_day', { p_date: date });
      if (snapshot.error) return rpcError(snapshot.error);
      const current = adaptAccountSnapshot(snapshot.data, userId, date, [before, seoulToday(now())]);
      if (current.today !== date) return reply(409, { error: 'day-changed' });
      if (!current.record) return reply(409, { error: 'day-not-started' });
      if (current.record.stage !== 'checkin') return reply(409, { error: 'reflection-already-committed' });
      const sameAnswers = current.record.answers.every((answer, i) => answer === answers[i]);
      // Same-content retries retain the RPC's old-revision idempotency semantics.
      if (!sameAnswers && current.record.revision !== revision) return reply(409, { error: 'revision-conflict' });
      const result = await client.rpc('onestep_save_reflection_draft', { p_date: date, p_answers: answers, p_revision: revision });
      if (result.error) return rpcError(result.error, true);
      const saved = draftResultSchema.safeParse(result.data);
      if (!saved.success || saved.data.date !== date || saved.data.revision < revision ||
          (saved.data.changed && saved.data.revision !== revision + 1)) return reply(502, { error: 'invalid-draft-result' });
      return reply(200, { project: ACCOUNT_PROJECT, userId, ...saved.data });
    } catch { return reply(503, { error: 'reflection-unavailable' }); }
  }
  return { start: (request: Request) => handle(request, 'start'), draft: (request: Request) => handle(request, 'draft') };
}
function rpcError(error: { code?: string; message?: string }, draftWrite = false) {
  if (['PGRST202', '42883'].includes(error.code ?? '')) return notReady();
  if (!error.code) return reply(503, { error: 'reflection-unavailable' });
  // PT409 is an application conflict, not a retryable PostgreSQL serialization failure.
  if (error.code === 'PT409') {
    if (draftWrite && error.message === 'Revision conflict') return reply(409, { error: 'revision-conflict' });
    if (draftWrite && error.message === 'Reflection already committed') return reply(409, { error: 'reflection-already-committed' });
    return reply(502, { error: 'reflection-query-failed' });
  }
  if (['40001', '40P01'].includes(error.code)) return reply(503, { error: 'reflection-unavailable' });
  if (error.code === '22023') return reply(409, { error: 'day-or-input-conflict' });
  if (error.code === 'P0002') return reply(409, { error: 'day-not-started' });
  if (['42501', 'PGRST301', 'PGRST303'].includes(error.code ?? '')) return reply(403, { error: 'reflection-forbidden' });
  return reply(502, { error: 'reflection-query-failed' });
}
export const reflectionHandlers = createReflectionHandlers();
