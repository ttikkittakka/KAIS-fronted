// Only Auth and the existing Next.js GET Snapshot route; never sends an activity request.
import fs from 'node:fs';
import nextEnv from '@next/env';
import { createClient } from '@supabase/supabase-js';
import { createHash } from 'node:crypto';
nextEnv.loadEnvConfig(process.cwd(), true, { info() {}, error() {} });
let step = 'configuration';
try {
  const file = fs.readdirSync('.').find(n => n.startsWith('.env.onestep-ab-') && n.endsWith('-run.local'));
  const source = fs.readFileSync(file, 'utf8');
  const get = k => source.match(new RegExp('^' + k + '=(.*)$', 'm'))?.[1].trim().replace(/^['"]|['"]$/g, '');
  const client = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
  step = 'authentication';
  const auth = await client.auth.signInWithPassword({ email: get('ONESTEP_AB_EMAIL_A'), password: get('ONESTEP_AB_PASSWORD_A') });
  if (auth.error || auth.data.user?.id !== get('ONESTEP_AB_USER_ID_A')) throw Error();
  step = 'next-snapshot';
  const status = await fetch('http://127.0.0.1:3000/api/account/activity', { headers: { Authorization: 'Bearer ' + auth.data.session.access_token }, signal: AbortSignal.timeout(20000) });
  if (!status.ok) throw Error();
  const gate = await status.json();
  console.log(JSON.stringify({ development: gate.development, configured: gate.configured, enabled: gate.enabled, nextToday: gate.today }));
  const response = await fetch('http://127.0.0.1:3000/api/account/records?date=2026-11-17', { headers: { Authorization: 'Bearer ' + auth.data.session.access_token }, signal: AbortSignal.timeout(20000) });
  if (!response.ok) { console.log(JSON.stringify({ http: response.status, step, gateOpened: false })); process.exitCode = 1; }
  else {
    const day = await response.json();
    console.log(JSON.stringify({ http: response.status, accountMatches: day.userId === auth.data.user.id, serverToday: day.today, date: day.date, stage: day.record?.stage, revision: day.record?.revision, cares: day.cares?.length, balance: day.sunshineBalance, ledger: day.rewards?.length }));
    if (process.argv.includes('--arm')) {
      step = 'local-approval-preconditions';
      const dir = '.env.phase3b-ab/A-20261117-photo-done-01';
      if (!gate.development || !gate.configured || gate.today !== '2026-11-17' ||
          day.userId !== auth.data.user.id || day.today !== '2026-11-17' || day.date !== day.today ||
          day.record?.stage !== 'photo' || day.record.revision !== 5 || day.record.answers.length !== 4 || !day.record.answers.every(Boolean) ||
          day.cares.length !== 3 || day.cares.some(c => c.completed_at !== null) || day.sunshineBalance !== 20 ||
          day.rewards.length !== 1 || day.rewards[0].reason !== 'reflection' || day.rewards[0].delta !== 10 ||
          fs.existsSync(dir + '/activity-http.attempt') || fs.existsSync(dir + '/activity-executor.attempt')) throw Error();
      const digest = value => createHash('sha256').update(JSON.stringify(value)).digest('hex');
      const read = async (token, date) => {
        const r = await fetch('http://127.0.0.1:3000/api/account/records?date=' + date, { headers: { Authorization: 'Bearer ' + token }, signal: AbortSignal.timeout(20000) });
        if (!r.ok) throw Error(); return r.json();
      };
      const past = await read(auth.data.session.access_token, '2026-11-16');
      const b = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
      const bAuth = await b.auth.signInWithPassword({ email: get('ONESTEP_AB_EMAIL_B'), password: get('ONESTEP_AB_PASSWORD_B') });
      if (bAuth.error || bAuth.data.user?.id !== get('ONESTEP_AB_USER_ID_B')) throw Error();
      const bToday = await read(bAuth.data.session.access_token, '2026-11-17');
      await b.auth.signOut({ scope: 'local' });
      const fresh = await read(auth.data.session.access_token, '2026-11-17');
      if (digest(fresh) !== digest(day)) throw Error();
      fs.writeFileSync(dir + '/browser-baseline.json', JSON.stringify({ aToday: digest(day), aPast: digest(past), bToday: digest(bToday), expectedAfter: digest({ ...day, record: { ...day.record, stage: 'growth', revision: 6 } }) }), { flag: 'wx', mode: 0o600 });
      const expiresAt = Math.min(Date.now() + 20 * 60 * 1000, Date.parse('2026-11-18T00:00:00+09:00'));
      fs.writeFileSync(dir + '/browser-approval.json', JSON.stringify({ executionId: 'A-20261117-photo-done-01', userId: auth.data.user.id, expiresAt }), { flag: 'wx', mode: 0o600 });
      console.log(JSON.stringify({ armed: true, expiresAtSeoul: new Date(expiresAt).toLocaleString('sv-SE', { timeZone: 'Asia/Seoul' }), activityRequestsSent: 0 }));
    }
  }
  await client.auth.signOut({ scope: 'local' });
} catch { console.log(JSON.stringify({ error: 'READ_ONLY_NEXT_PREFLIGHT_FAILED', step, details: 'suppressed', gateOpened: false })); process.exitCode = 1; }
