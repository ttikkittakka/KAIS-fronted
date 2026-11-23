import 'server-only';
import { authenticateAccount, reply } from '../account/auth';
import { seoulToday, HISTORY_DAYS } from './model';
import { monthSchema } from './month';
export async function handleMonthRequest(request: Request) {
  const params = new URL(request.url).searchParams, month = params.get('month') ?? '';
  if (request.method !== 'GET' || [...params.keys()].some(k => k !== 'month') || params.getAll('month').length !== 1 || !/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) return reply(400, { error: 'invalid-month' });
  try {
    const auth = await authenticateAccount(request); if (auth instanceof Response) return auth;
    const today = seoulToday(), oldest = new Date(Date.parse(today) - HISTORY_DAYS * 86400000).toISOString().slice(0, 10);
    if (month > today.slice(0, 7) || month < oldest.slice(0, 7)) return reply(200, { userId: auth.userId, today, month, dates: [] });
    const next = new Date(month + '-01T00:00:00Z'); next.setUTCMonth(next.getUTCMonth() + 1);
    const start = month + '-01' < oldest ? oldest : month + '-01';
    // One bounded, owner-filtered SELECT; existing RLS remains in force.
    const result = await auth.client.from('onestep_daily_records').select('user_id,record_date').eq('user_id', auth.userId).gte('record_date', start).lt('record_date', next.toISOString().slice(0, 10)).lte('record_date', today).order('record_date').limit(31);
    if (result.error || result.data.some(row => row.user_id !== auth.userId)) throw Error();
    return reply(200, monthSchema.parse({ userId: auth.userId, today, month, dates: result.data.map(row => row.record_date) }));
  } catch { return reply(503, { error: 'records-unavailable' }); }
}
