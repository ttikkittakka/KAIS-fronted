import { authenticateAccount, reply } from '../account/auth';
import { ACCOUNT_PROJECT, gardenSchema } from './model';
/** Request-local clients only. No privileged key, cookie session, or shared cache. */
export async function handleGardenRequest(request: Request) {
  if (!['GET', 'POST'].includes(request.method)) return reply(405, { error: 'method-not-allowed' });
  if (new URL(request.url).search || (request.method === 'POST' && await request.text())) {
    return reply(400, { error: 'unexpected-input' });
  }
  try {
    const authenticated = await authenticateAccount(request);
    if (authenticated instanceof Response) return authenticated;
    const { client, userId } = authenticated;
    if (request.method === 'POST') {
      const result = await client.rpc('onestep_ensure_garden');
      return result.error ? reply(502, { error: 'initialization-failed' }) : reply(200, { ok: true });
    }
    const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Seoul', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
    const results = await Promise.all([
      client.from('onestep_profiles').select('user_id,display_name,timezone').eq('user_id', userId).maybeSingle(),
      client.from('onestep_gardens').select('user_id,main_character,sunshine_balance,active_days,growth_stage,layout_revision').eq('user_id', userId).maybeSingle(),
      client.from('onestep_inventory').select('user_id,item_id,source,acquired_at').eq('user_id', userId),
      client.from('onestep_placements').select('user_id,slot_id,item_id').eq('user_id', userId),
      client.from('onestep_growth_grants').select('user_id,milestone_days,active_days,granted_at,seen_at').eq('user_id', userId),
      client.from('onestep_daily_records').select('user_id,record_date,plant_state,stage,revision').eq('user_id', userId).eq('record_date', today).maybeSingle(),
    ]);
    if (results.some(result => result.error)) return reply(502, { error: 'garden-query-failed' });
    const [profile, garden, inventory, placements, growthGrants, todayRecord] = results.map(result => result.data);
    if (!profile || !garden) return reply(409, { error: 'initialization-required' });
    const parsed = gardenSchema.safeParse({ project: ACCOUNT_PROJECT, userId, today, profile, garden, inventory, placements, growthGrants, todayRecord });
    if (!parsed.success) return reply(502, { error: 'invalid-garden-data' });
    return reply(200, parsed.data);
  } catch {
    return reply(503, { error: 'garden-unavailable' });
  }
}
