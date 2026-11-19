import 'server-only';
import { authenticateAccount, reply } from '../account/auth';
import { readAccountSnapshot } from '../account-records/snapshot';
import { recordsSchema, seoulToday, type AccountRecords } from '../account-records/model';
import { draftResultSchema } from '../account-reflection/model';
import { activityDaySchema, activityEffect, activityInputSchema, activityStatus, type ActivityInput } from './model';
import { isApprovedDraftTester } from '../account-reflection/gates';

export type ActivityCommand = ActivityInput & { userId: string; expiresAt: number };
export type ActivityExecutor = (command: ActivityCommand, signal: AbortSignal, before?: AccountRecords) => Promise<unknown>;
type Options = { enabled?: () => boolean; allowedUser?: (id: string) => boolean; execute?: ActivityExecutor; now?: () => Date; read?: typeof readAccountSnapshot };
const PRODUCTION_ACTIVITY_ENABLED = false;
export function createActivityHandler({ enabled = () => PRODUCTION_ACTIVITY_ENABLED, allowedUser = () => true, execute, now = () => new Date(), read = readAccountSnapshot }: Options = {}) {
  return async (request: Request) => {
    if (request.method !== 'POST') return reply(405, { error: 'method-not-allowed' });
    if (new URL(request.url).search) return reply(400, { error: 'unexpected-input' });
    try {
      const auth = await authenticateAccount(request);
      if (auth instanceof Response) return auth;
      if (!enabled() || !execute) return reply(503, { error: 'activity-not-ready' });
      if (!allowedUser(auth.userId)) return reply(403, { error: 'activity-forbidden' });
      if (request.headers.get('content-type')?.split(';')[0].trim().toLowerCase() !== 'application/json') return reply(415, { error: 'json-required' });
      const raw = await request.text();
      if (raw.length > 512) return reply(413, { error: 'input-too-large' });
      let body: unknown;
      try { body = JSON.parse(raw); } catch { return reply(400, { error: 'invalid-input' }); }
      const parsed = activityInputSchema.safeParse(body);
      if (!parsed.success) return reply(400, { error: 'invalid-input' });
      const input = parsed.data, { userId, client, expiresAt } = auth;
      if (input.date !== seoulToday(now())) return reply(409, { error: 'day-changed' });
      const readDay = async () => {
        const value = await read(client, userId, input.date, seoulToday(now()));
        if (value.userId !== userId || value.date !== input.date) throw new Error('owner-mismatch');
        return recordsSchema.parse(value);
      };
      const before = await readDay();
      if (!before.record || before.record.stage === 'checkin') return reply(409, { error: 'reflection-required' });
      activityDaySchema.parse(before);
      const status = activityStatus(before, input);
      if (status === 'invalid') return reply(409, { error: 'activity-unavailable' });
      if (status === 'done') return reply(200, { day: before, changed: false, effect: null });
      if (before.record!.revision !== input.revision) return reply(409, { error: 'revision-conflict' });
      if (input.date !== seoulToday(now())) return reply(409, { error: 'day-changed' });
      if (expiresAt <= Date.now()) return reply(401, { error: 'authentication-expired' });
      request.signal.throwIfAborted();
      const ack = draftResultSchema.parse(await execute({ ...input, userId, expiresAt }, request.signal, before));
      if (ack.date !== input.date || ack.revision < input.revision || (ack.changed && ack.revision !== input.revision + 1)) throw new Error('invalid-ack');
      const day = activityDaySchema.parse(await readDay());
      if (day.record!.revision < ack.revision || activityStatus(day, input) !== 'done') throw new Error('activity-not-visible');
      return reply(200, { day, changed: ack.changed, effect: activityEffect(before, day, input, ack.changed, ack.revision) });
    } catch (error) {
      const code = typeof error === 'object' && error !== null && 'code' in error ? String(error.code) : '';
      if (['42883', 'PGRST202'].includes(code)) return reply(503, { error: 'activity-not-ready' });
      if (['PT409', '22023', 'P0002'].includes(code)) return reply(409, { error: 'activity-conflict-reload' });
      return reply(503, { error: 'activity-uncertain-reload' });
    }
  };
}
export const handleActivityRequest = createActivityHandler({ allowedUser: isApprovedDraftTester });
