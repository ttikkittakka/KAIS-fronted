// Explicit opt-in live test. Only newly created, UUID-pinned A/B accounts.
// Never uses service-role credentials, existing app sessions or browser storage.
import { createClient } from '@supabase/supabase-js';
import nextEnv from '@next/env';
import sharp from 'sharp';
import { mkdirSync, writeFileSync, existsSync, readFileSync } from 'node:fs';
import { parseEnv, parseArgs } from 'node:util';
import { verifyTestAccounts } from './helpers/supabase-ab-auth.mjs';
import { abRunFiles } from './helpers/supabase-ab-files.mjs';

async function main() {
  const { values } = parseArgs({ options: { run: { type: 'boolean' }, preflight: { type: 'boolean' }, 'run-id': { type: 'string' } } });
  if (values.run && values.preflight) throw new Error('Choose preflight or run, not both');
  if (!values.run && !values.preflight) {
    console.log('No requests made. Use --preflight --run-id <new ID> after confirming both emails, then --run --run-id <same ID>.');
    return;
  }
  const AB_ENV_FILE = abRunFiles(values['run-id']).output;
  nextEnv.loadEnvConfig(process.cwd(), true, { info() {}, error() {} });
  // Test identities come exclusively from the shared file, never stale shell variables.
  const testEnv = parseEnv(readFileSync(AB_ENV_FILE, 'utf8'));
  if (values['run-id'] && testEnv.ONESTEP_AB_RUN !== values['run-id']) throw new Error('Prepared run ID mismatch');
  const env = Object.fromEntries(Object.entries(process.env).filter(([key]) => !key.startsWith('ONESTEP_AB_')));
  for (const [key, value] of Object.entries(testEnv)) {
    if (key.startsWith('ONESTEP_AB_')) env[key] = value;
  }
  const project = 'yhzgucbiwvizjxpzwpqg';
  const projectUrl = `https://${project}.supabase.co`;
  if (env.NEXT_PUBLIC_SUPABASE_URL !== projectUrl) throw new Error('Wrong project: no requests made');
  if (env.ONESTEP_AB_APPROVED_PROJECT !== project) throw new Error('Explicit approved project required');
  const createdAfter = Date.parse(env.ONESTEP_AB_CREATED_AFTER ?? '');
  if (!Number.isFinite(createdAfter) || createdAfter > Date.now() || Date.now() - createdAfter > 86400000) throw new Error('Fresh account creation window required (last 24 hours)');
  const run = env.ONESTEP_AB_RUN;
  if (!/^onestep-ab-[a-z0-9-]+$/.test(run ?? '')) throw new Error('Missing test run marker');
  const report = { run, startedAt: new Date().toISOString(), outcome: 'NOT_COMPLETED', checks: [], accounts: [], photos: [] };
  const directory = 'supabase/tests/results';
  if (values.run) mkdirSync(directory, { recursive: true });
  const marker = `${directory}/${run}.started`;
  if (existsSync(marker)) throw new Error('Run already started; inspect its report, do not reuse accounts');
  if (values.run) writeFileSync(marker, new Date().toISOString(), { flag: 'wx' });
  const reportPath = `${directory}/${run}-${Date.now()}.json`;
  const checkpoint = () => { if (values.run) writeFileSync(reportPath, JSON.stringify(report, null, 2) + '\n'); };
  const check = (condition, name) => {
    report.checks.push({ name, pass: !!condition });
    if (!condition) report.lastError = { step: name };
    checkpoint();
    if (!condition) throw new Error(name);
  };
  const ok = (response, name) => {
    if (response.error) {
      report.lastError = { step: name, code: response.error.code, status: response.error.status ?? response.error.statusCode };
      throw new Error(name);
    }
    return response.data;
  };
  const sqlDenied = (r, name) => check(r.error?.code === '42501', name);
  const storageDenied = (r, name) => check(
    ['400', '401', '403', '404'].includes(String(r.error?.status ?? r.error?.statusCode)) &&
    /row.level security|unauthorized|not found|not authorized|permission/i.test(r.error?.message ?? ''), name);
  const bucket = client => client.storage.from('onestep-photos');
  const entries = [];
  const record = async t => {
    const rows = ok(await t.client.from('onestep_daily_records').select('*').eq('user_id', t.id).eq('record_date', t.day), 'own record read');
    check(rows.length === 1, 'own record exists'); return rows[0];
  };
  const garden = async t => ok(await t.client.from('onestep_gardens').select('*').eq('user_id', t.id), 'garden snapshot');
  const download = async (t, path) => Buffer.from(await ok(await bucket(t.client).download(path), 'owner download').arrayBuffer());
  const makeClient = () => createClient(projectUrl, env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    global: { fetch: (url, options) => {
      if (new URL(url).origin !== projectUrl) throw new Error('Cross-project request blocked');
      return fetch(url, { ...options, redirect: 'error', signal: AbortSignal.timeout(15000) });
    } },
  });
  const protectedTables = ['onestep_gardens', 'onestep_inventory', 'onestep_placements', 'onestep_sunshine_ledger', 'onestep_purchases', 'onestep_growth_grants'];
  const snapshot = async t => Object.fromEntries(await Promise.all(protectedTables.map(async table => [table,
    ok(await t.client.from(table).select('*').eq('user_id', t.id), `snapshot ${table}`).map(row => JSON.stringify(row)).sort(),
  ])));
  try {
    entries.push(...await verifyTestAccounts({ env, run, projectUrl, createdAfter, makeClient, check, ok }));
    if (values.preflight) {
      report.outcome = 'AUTH_PREFLIGHT_PASS';
      return; // No marker, report file, DB RPC or Storage operation.
    }
    for (const t of entries) {
      const { role, client } = t;
      report.accounts.push({ role, uuid: t.id }); checkpoint();
      for (const table of ['onestep_daily_records', 'onestep_daily_cares', 'onestep_photos', 'onestep_sunshine_ledger', 'onestep_purchases', 'onestep_growth_grants']) {
        const rows = ok(await client.from(table).select('user_id').eq('user_id', t.id).limit(1), `${role} baseline ${table}`);
        check(rows.length === 0, `${role} empty ${table}; never reuse an account with existing data`);
      }
      t.gardenBefore = await garden(t);
      check(t.gardenBefore.length === 1 && Number(t.gardenBefore[0].sunshine_balance) === 0 && t.gardenBefore[0].active_days === 0 && Number(t.gardenBefore[0].layout_revision) === 0, 'fresh default garden only');
      t.protectedBefore = await snapshot(t);
      const inventory = t.protectedBefore.onestep_inventory.map(x => JSON.parse(x));
      check(inventory.length === 2 && inventory.every(x => x.source === 'default' && ['sprout', 'default-sky'].includes(x.item_id)), 'default inventory only');
      const placements = t.protectedBefore.onestep_placements.map(x => JSON.parse(x));
      check(placements.length === 1 && placements[0].slot_id === 'background' && placements[0].item_id === 'default-sky', 'default placement only');
    }
    // No mutation occurs until BOTH identities and empty baselines pass.
    for (const t of entries) {
      t.day = ok(await t.client.rpc('onestep_start_day'), `${t.role} start_day`);
      const before = await record(t);
      const note = `${run}_${t.role}`;
      ok(await t.client.rpc('onestep_save_writing', { p_date: t.day, p_note: note, p_comment: '', p_revision: before.revision }), `${t.role} save_writing`);
      const after = await record(t);
      check(after.note === note && after.revision === before.revision + 1, `${t.role} RPC positive control`);
    }
    const anonymous = makeClient();
    for (const t of entries) {
      sqlDenied(await anonymous.from('onestep_daily_records').select('user_id').eq('user_id', t.id), 'anonymous record read denied');
      sqlDenied(await anonymous.rpc('onestep_start_day'), 'anonymous mutation RPC denied');
      for (const [table, change] of [['onestep_gardens', { sunshine_balance: 999 }], ['onestep_sunshine_ledger', { delta: 999 }], ['onestep_purchases', { cost: 1 }]]) {
        sqlDenied(await t.client.from(table).update(change).eq('user_id', t.id).select('user_id'), `${t.role} direct ${table} UPDATE privilege denied`);
      }
      check(JSON.stringify(await snapshot(t)) === JSON.stringify(t.protectedBefore), 'protected data unchanged after denied writes');
    }
    for (const [actor, target] of [[entries[0], entries[1]], [entries[1], entries[0]]]) {
      const before = await record(target);
      const rows = ok(await actor.client.from('onestep_daily_records').select('user_id,record_date').eq('user_id', target.id).eq('record_date', target.day), 'cross-user read response');
      check(rows.length === 0, `${actor.role} cannot read ${target.role}`);
      sqlDenied(await actor.client.from('onestep_daily_records').update({ note: `${run}_DENIED` }).eq('user_id', target.id).eq('record_date', target.day).select('user_id'), `${actor.role} cannot directly update ${target.role}`);
      check(JSON.stringify(await record(target)) === JSON.stringify(before), 'target record unchanged');
      const ownBefore = await record(actor);
      sqlDenied(await actor.client.from('onestep_daily_records').update({ note: `${run}_DENIED` }).eq('user_id', actor.id).eq('record_date', actor.day).select('user_id'), `${actor.role} cannot directly update self`);
      check(JSON.stringify(await record(actor)) === JSON.stringify(ownBefore), 'own direct UPDATE changed nothing');
    }
    const jpeg = await sharp({ create: { width: 2, height: 2, channels: 3, background: '#468c64' } }).jpeg().toBuffer();
    const reserve = async t => {
      const data = ok(await t.client.rpc('onestep_reserve_photo', { p_date: t.day }), 'reserve synthetic photo');
      const p = Array.isArray(data) ? data[0] : data;
      check(p.user_id === t.id && p.object_path === `${t.id}/${p.id}.jpg` && p.status === 'staged', 'reserved path belongs to this test user');
      report.photos.push({ owner: t.id, id: p.id, path: p.object_path, state: 'staged' }); checkpoint();
      return p;
    };
    for (const [owner, other] of [[entries[0], entries[1]], [entries[1], entries[0]]]) {
      const p = await reserve(owner);
      ok(await bucket(owner.client).upload(p.object_path, jpeg, { contentType: 'image/jpeg', upsert: false }), 'owner upload positive control');
      check((await download(owner, p.object_path)).equals(jpeg), 'owner reads exact synthetic JPEG');
      storageDenied(await bucket(other.client).download(p.object_path), 'other user cannot download owner photo');
      let r = await record(owner);
      ok(await owner.client.rpc('onestep_attach_photo', { p_date: owner.day, p_photo: p.id, p_revision: r.revision }), 'owner attach');
      const replacement = await reserve(owner);
      storageDenied(await bucket(other.client).upload(replacement.object_path, jpeg, { contentType: 'image/jpeg', upsert: false }), 'other user cannot upload to valid reserved staged path');
      storageDenied(await bucket(anonymous).download(p.object_path), 'anonymous cannot download existing photo');
      r = await record(owner);
      const failedAttach = await owner.client.rpc('onestep_attach_photo', { p_date: owner.day, p_photo: replacement.id, p_revision: r.revision });
      check(failedAttach.error?.code === 'P0001' && /upload has not completed/i.test(failedAttach.error.message), 'missing upload rejects replacement');
      check(JSON.stringify(await record(owner)) === JSON.stringify(r), 'failed replacement preserves photo and revision');
      storageDenied(await bucket(owner.client).update(p.object_path, jpeg, { contentType: 'image/jpeg' }), 'owner cannot overwrite attached object');
      storageDenied(await bucket(other.client).update(p.object_path, jpeg, { contentType: 'image/jpeg' }), 'other user cannot overwrite object');
      const attachedDelete = await bucket(owner.client).remove([p.object_path]);
      if (attachedDelete.error) storageDenied(attachedDelete, 'attached deletion denied');
      else check(attachedDelete.data.length === 0, 'attached deletion affects zero objects');
      check((await download(owner, p.object_path)).equals(jpeg), 'attached object preserved');
      ok(await bucket(owner.client).upload(replacement.object_path, jpeg, { contentType: 'image/jpeg', upsert: false }), 'retry replacement upload');
      ok(await owner.client.rpc('onestep_attach_photo', { p_date: owner.day, p_photo: replacement.id, p_revision: r.revision }), 'retry replacement attach');
      r = await record(owner);
      check(r.photo_id === replacement.id && (await download(owner, replacement.object_path)).equals(jpeg), 'replacement retry succeeds');
      ok(await owner.client.rpc('onestep_attach_photo', { p_date: owner.day, p_photo: null, p_revision: r.revision }), 'detach synthetic photo');
      const crossDelete = await bucket(other.client).remove([p.object_path]);
      if (crossDelete.error) storageDenied(crossDelete, 'other-user retired deletion denied');
      else check(crossDelete.data.length === 0, 'other-user retired deletion affects zero objects');
      check((await download(owner, p.object_path)).equals(jpeg), 'retired photo survives other-user delete');
      ok(await owner.client.rpc('onestep_retire_photo', { p_photo: p.id }), 'owner retire idempotent');
      ok(await bucket(owner.client).remove([p.object_path]), 'owner Storage API cleanup');
      const remaining = ok(await bucket(owner.client).list(owner.id, { search: `${p.id}.jpg` }), 'owner list after cleanup');
      check(!remaining.some(x => x.name === `${p.id}.jpg`), 'synthetic uploaded object removed');
      ok(await owner.client.rpc('onestep_retire_photo', { p_photo: replacement.id }), 'retire detached replacement');
      ok(await bucket(owner.client).remove([replacement.object_path]), 'remove exact synthetic replacement');
      const replacementRemaining = ok(await bucket(owner.client).list(owner.id, { search: `${replacement.id}.jpg` }), 'replacement cleanup verification');
      check(!replacementRemaining.some(x => x.name === `${replacement.id}.jpg`), 'replacement object removed');
      for (const x of report.photos.filter(x => x.owner === owner.id)) x.state = 'retired; API object absent';
      check(JSON.stringify(await garden(owner)) === JSON.stringify(owner.gardenBefore), 'garden/character/sunshine snapshot unchanged');
      check(JSON.stringify(await snapshot(owner)) === JSON.stringify(owner.protectedBefore), 'all protected baseline data unchanged');
    }
    report.outcome = 'PASS';
    report.residuals = 'Two test Auth users, one synthetic daily record per user, and retired photo tombstones remain. No account/record deletion was attempted. Only this run\'s uploaded JPEGs were removed via owner Storage API.';
  } catch {
    report.outcome = 'STOPPED_NOT_PASSED';
    report.residuals = 'Do not assume rollback or cleanup. Inspect only UUIDs and paths in this report. No automatic cleanup after a failure.';
    process.exitCode = 1;
  } finally {
    checkpoint();
    console.log(JSON.stringify({ outcome: report.outcome, completedChecks: report.checks.filter(x => x.pass).length, lastError: report.lastError, report: values.run ? reportPath : undefined }));
  }

}
main().catch(() => {
  console.error('Test stopped before completion. Check options, prepared files, project, account age and existing marker. No automatic retry.');
  process.exitCode = 1;
});
