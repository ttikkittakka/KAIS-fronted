import 'server-only';
import { z } from 'zod';
import type { SupabaseClient } from '@supabase/supabase-js';
import { ACCOUNT_PROJECT } from '../account-garden/model';
import { allowedDate, recordsSchema, seoulToday } from './model';

// Production stays sealed. Development read-only rollout follows verified A/B RPC checks.
// This gate never enables the independent draft/commit/activity/writing gates.
const PRODUCTION_SNAPSHOT_ENABLED = false;
export const isAccountSnapshotEnabled = () =>
  process.env.NODE_ENV === 'development' || PRODUCTION_SNAPSHOT_ENABLED;

const snapshotSchema = z.object({
  userId: z.uuid(), today: recordsSchema.shape.today, date: recordsSchema.shape.date,
  garden: z.object({ user_id: z.uuid(), sunshine_balance: recordsSchema.shape.sunshineBalance }).strict().nullable(),
  record: recordsSchema.shape.record, cares: recordsSchema.shape.cares, rewards: recordsSchema.shape.rewards,
}).strict();

/** Explicit get_day → app DTO mapping. Never merge fields from separate reads/caches. */
export function adaptAccountSnapshot(raw: unknown, userId: string, date: string, acceptedToday: readonly string[]) {
  const parsed = snapshotSchema.safeParse(raw);
  if (!parsed.success) throw new Error('invalid-records-data');
  const value = parsed.data;
  if (value.userId !== userId || value.date !== date || !acceptedToday.includes(value.today) ||
      (value.garden && value.garden.user_id !== userId)) throw new Error('invalid-records-data');
  if (!value.garden) throw new Error('initialization-required');
  const result = recordsSchema.safeParse({ project: ACCOUNT_PROJECT, userId: value.userId, today: value.today, date: value.date,
    sunshineBalance: value.garden.sunshine_balance, record: value.record, cares: value.cares, rewards: value.rewards });
  if (!result.success) throw new Error('invalid-records-data');
  return result.data;
}

/** Inject only offline transports/readiness in tests; production instance remains locked. */
export function createAccountSnapshotReader({ enabled = isAccountSnapshotEnabled, now = () => new Date() }:
  { enabled?: () => boolean; now?: () => Date } = {}) {
  return async (client: SupabaseClient, userId: string, date: string, today: string) => {
    if (!enabled()) throw new Error('records-snapshot-not-ready');
    if (!z.uuid().safeParse(userId).success || !allowedDate(date, today)) throw new Error('invalid-date-query');
    const before = seoulToday(now());
    const result = await client.rpc('onestep_get_day', { p_date: date });
    if (result.error) {
      if (['42883', 'PGRST202'].includes(result.error.code)) throw new Error('records-snapshot-not-ready');
      if (result.error.code === '22023') throw new Error('snapshot-date-conflict');
      if (['42501', 'PGRST301', 'PGRST303'].includes(result.error.code)) throw new Error('records-snapshot-forbidden');
      throw new Error('records-query-failed');
    }
    return adaptAccountSnapshot(result.data, userId, date, [before, seoulToday(now())]);
  };
}
export const readAccountSnapshot = createAccountSnapshotReader();
