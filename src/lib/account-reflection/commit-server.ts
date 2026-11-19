import 'server-only';
import { authenticateAccount, reply } from '../account/auth';
import { readAccountSnapshot } from '../account-records/snapshot';
import { recordsSchema, seoulToday } from '../account-records/model';
import { commitInputSchema, committedDaySchema } from './commit-model';
import { draftResultSchema, type DraftAnswers } from './model';
import { recommendAccountReflection } from './recommendation-server';
import { classifyDbError } from '../account/db-diagnostics';

export type CommitCommand = { userId: string; expiresAt: number; date: string; revision: number; answers: DraftAnswers; cares: string[]; title: string };
export type CommitExecutor = (command: CommitCommand, signal: AbortSignal) => Promise<unknown>;
type Options = { validateDraft?: (day: Awaited<ReturnType<typeof readAccountSnapshot>>) => boolean; prepareOnly?: boolean; enabled?: () => boolean; allowedUser?: (userId: string) => boolean; now?: () => Date; execute?: CommitExecutor; read?: typeof readAccountSnapshot };
const PRODUCTION_COMMIT_ENABLED = false;
/** No pool/credential fallback. Production remains sealed until deployment approval. */
export function createCommitHandler({ validateDraft = () => true, prepareOnly = false, enabled = () => PRODUCTION_COMMIT_ENABLED, allowedUser = () => false, now = () => new Date(), execute, read = readAccountSnapshot }: Options = {}) {
  return async (request: Request) => {
    let phase = 'authentication';
    if (request.method !== 'POST') return reply(405, { error: 'method-not-allowed' });
    if (new URL(request.url).search) return reply(400, { error: 'unexpected-input' });
    try {
      const auth = await authenticateAccount(request);
      if (auth instanceof Response) return auth;
      if (!enabled() || (!prepareOnly && !execute)) return reply(503, { error: 'reflection-commit-not-ready' });
      if (!allowedUser(auth.userId)) return reply(403, { error: 'reflection-commit-forbidden' });
      if (request.headers.get('content-type')?.split(';')[0].trim().toLowerCase() !== 'application/json') return reply(415, { error: 'json-required' });
      const text = await request.text();
      if (text.length > 512) return reply(413, { error: 'input-too-large' });
      let input: unknown;
      try { input = JSON.parse(text); } catch { return reply(400, { error: 'invalid-input' }); }
      const parsed = commitInputSchema.safeParse(input);
      if (!parsed.success) return reply(400, { error: 'invalid-input' });
      const { date, revision } = parsed.data;
      phase = 'snapshot-preflight';
      const { client, userId } = auth;
      const today = seoulToday(now());
      if (date !== today) return reply(409, { error: 'day-changed' });
      const validateOwner = (value: Awaited<ReturnType<typeof read>>, expected: string) => {
        if (value.userId !== userId || value.date !== expected) throw new Error('invalid-owner');
        return recordsSchema.parse(value);
      };
      const day = validateOwner(await read(client, userId, date, today), date);
      if (day.today !== date) return reply(409, { error: 'day-changed' });
      if (!day.record) return reply(409, { error: 'day-not-started' });
      if (day.record.stage !== 'checkin') {
        recommendAccountReflection(day, []); // Validates saved catalog IDs; does not reroll.
        return reply(200, { day: committedDaySchema.parse(day), recovered: true });
      }
      if (day.record.revision !== revision) return reply(409, { error: 'revision-conflict' });
      if (day.record.answers.includes('')) return reply(409, { error: 'incomplete-reflection' });
      if (!validateDraft(day)) return reply(409, { error: 'trial-precondition-changed' });
      const previous = [];
      phase = 'history-recommendation';
      for (const age of [1, 2, 3]) {
        const previousDate = new Date(Date.parse(date) - age * 86400000).toISOString().slice(0, 10);
        const prior = validateOwner(await read(client, userId, previousDate, today), previousDate);
        if (prior.today !== date) return reply(409, { error: 'day-changed' });
        previous.push(prior);
      }
      const recommendation = recommendAccountReflection(day, previous);
      phase = 'snapshot-recheck';
      const fresh = validateOwner(await read(client, userId, date, today), date);
      if (fresh.today !== date) return reply(409, { error: 'day-changed' });
      if (!fresh.record || fresh.record.stage !== 'checkin' || fresh.record.revision !== revision ||
          fresh.record.answers.some((v, i) => v !== day.record!.answers[i])) return reply(409, { error: 'revision-conflict' });
      if (!validateDraft(fresh)) return reply(409, { error: 'trial-precondition-changed' });
      if (request.signal.aborted) throw new Error('aborted');
      if (seoulToday(now()) !== date) return reply(409, { error: 'day-changed' });
      if (auth.expiresAt <= Date.now()) return reply(401, { error: 'authentication-expired' });
      if (prepareOnly) return reply(200, { prepared: true, executionEnabled: false, date, revision,
        cares: recommendation.ids, title: recommendation.title, expectedSunshineDelta: 10, sunshineBalance: fresh.sunshineBalance });
      phase = 'executor';
      const result = draftResultSchema.parse(await execute!({ userId, expiresAt: auth.expiresAt, date, revision, answers: [...day.record.answers],
        cares: recommendation.ids, title: recommendation.title }, request.signal));
      if (result.date !== date || result.revision < revision || (result.changed && result.revision <= revision)) throw new Error('invalid-commit-ack');
      // Never infer a balance or reward from the ack. Read persisted recommendations and ledger.
      phase = 'snapshot-after-commit';
      const saved = committedDaySchema.parse(validateOwner(await read(client, userId, date, seoulToday(now())), date));
      recommendAccountReflection(saved, []);
      if (saved.record!.revision < result.revision || saved.record!.answers.some((v, i) => v !== day.record!.answers[i])) throw new Error('commit-not-visible');
      if (saved.cares.length !== 3 || [...saved.cares].sort((a, b) => a.position - b.position).some((care, i) =>
        care.care_id !== recommendation.ids[i] || care.catalog_version !== 2) ||
        saved.record!.recommendation_title !== recommendation.title ||
        saved.sunshineBalance !== fresh.sunshineBalance + 10) throw new Error('commit-verification-failed');
      return reply(200, { day: saved, recovered: !result.changed });
    } catch (error) {
      const diagnostic = (error as { diagnostic?: { stage?: unknown; transactionBegan?: unknown } } | null)?.diagnostic;
      const stages = ['pool-configuration','pool-construction','connect','begin','role','timeouts','claims','rpc','acknowledgement','commit','query','close'];
      // Server log only: fixed labels/codes, no user data, raw error or connection config.
      console.error(JSON.stringify({ event: 'account-commit-failure', phase,
        stage: stages.includes(String(diagnostic?.stage)) ? diagnostic!.stage : 'unclassified',
        transactionBegan: typeof diagnostic?.transactionBegan === 'boolean' ? diagnostic.transactionBegan : null, chain: classifyDbError(error) }));
      const code = typeof error === 'object' && error !== null && 'code' in error ? String(error.code) : '';
      if (['42883', 'PGRST202'].includes(code)) return reply(503, { error: 'reflection-commit-not-ready' });
      if (['PT409', '22023', 'P0002'].includes(code)) return reply(409, { error: 'commit-conflict-reload' });
      // COMMIT may have succeeded: client must read the original date before any retry.
      return reply(503, { error: 'commit-uncertain-reload' });
    }
  };
}
export const handleCommitRequest = createCommitHandler();
