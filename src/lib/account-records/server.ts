import { authenticateAccount, reply } from '../account/auth';
import { ACCOUNT_PROJECT } from '../account-garden/model';
import { allowedDate, recordsSchema, seoulToday } from './model';
import type { SupabaseClient } from '@supabase/supabase-js';
import { isAccountSnapshotEnabled, readAccountSnapshot } from './snapshot';

/** Shared JWT/RLS reader. Errors remain errors, never empty records or zero balances. */
export async function readAccountRecords(client: SupabaseClient, userId: string, date: string, today: string) {
  // Compatibility mode is selected before any request. Never fall back on RPC failure.
  if (isAccountSnapshotEnabled()) return readAccountSnapshot(client, userId, date, today);
  const results = await Promise.all([
    client.from('onestep_gardens').select('user_id,sunshine_balance').eq('user_id', userId).maybeSingle(),
    client.from('onestep_daily_records').select('user_id,record_date,answers,stage,plant_state,note,photo_comment,recommendation_title,revision').eq('user_id', userId).eq('record_date', date).maybeSingle(),
    client.from('onestep_daily_cares').select('user_id,record_date,position,care_id,catalog_version,completed_at').eq('user_id', userId).eq('record_date', date).order('position').limit(4),
    client.from('onestep_sunshine_ledger').select('user_id,record_date,event_key,reason,delta,policy_version').eq('user_id', userId).eq('record_date', date).order('event_key').limit(4),
  ]);
  if (results.some(result => result.error)) throw new Error('records-query-failed');
  const garden = results[0].data, record = results[1].data, cares = results[2].data, rewards = results[3].data;
  if (!garden) throw new Error('initialization-required');
  if (garden.user_id !== userId) throw new Error('invalid-records-data');
  const parsed = recordsSchema.safeParse({ project: ACCOUNT_PROJECT, userId, today, date,
    sunshineBalance: garden.sunshine_balance, record, cares, rewards });
  if (!parsed.success) throw new Error('invalid-records-data');
  return parsed.data;
}

export function createRecordsHandler({ read = readAccountRecords, now = () => new Date() }:
  { read?: typeof readAccountRecords; now?: () => Date } = {}) {
 return async function handleRecordsRequest(request: Request) {
  if (request.method !== 'GET') return reply(405, { error: 'method-not-allowed' });
  const params = new URL(request.url).searchParams;
  const today = seoulToday(now());
  const date = params.get('date') ?? today;
  if (Array.from(params.keys()).some(key => key !== 'date') || params.getAll('date').length > 1 || !allowedDate(date, today)) {
    return reply(400, { error: 'invalid-date-query' });
  }
  try {
    const auth = await authenticateAccount(request);
    if (auth instanceof Response) return auth;
    const { client, userId } = auth;
    return reply(200, await read(client, userId, date, today));
  } catch (error) {
    if (error instanceof Error && error.message === 'records-snapshot-not-ready') return reply(503, { error: error.message });
    if (error instanceof Error && error.message === 'snapshot-date-conflict') return reply(409, { error: error.message });
    if (error instanceof Error && error.message === 'records-snapshot-forbidden') return reply(403, { error: error.message });
    if (error instanceof Error && error.message === 'initialization-required') return reply(409, { error: error.message });
    if (error instanceof Error && ['records-query-failed', 'invalid-records-data'].includes(error.message)) return reply(502, { error: error.message });
    return reply(503, { error: 'records-unavailable' });
  }
 };
}
export const handleRecordsRequest = createRecordsHandler();
