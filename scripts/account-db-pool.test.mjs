import { test } from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { rootCertificates } from 'node:tls';
import { Pool } from 'pg';
import { loadTs } from './helpers/load-ts.mjs';
const { accountPoolConfig, adaptCommitPool, getAccountCommitPool } = loadTs(new URL('../src/lib/account/db-pool.ts', import.meta.url));
const { executeAccountTransaction } = loadTs(new URL('../src/lib/account-reflection/commit-executor.ts', import.meta.url));
const env = () => ({ ONESTEP_DB_HOST: 'aws-0-ap-northeast-2.pooler.supabase.com', ONESTEP_DB_PORT: '6543',
  ONESTEP_DB_DATABASE: 'postgres', ONESTEP_DB_USER: 'onestep_app_login_v1.yhzgucbiwvizjxpzwpqg', ONESTEP_DB_PASSWORD: 'offline-fixture-only',
  ONESTEP_DB_CA_PEM: rootCertificates[0] });
const A = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', B = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const command = userId => ({ userId, expiresAt: Date.now() + 60000, date: '2026-11-13', revision: 0 });
const run = (pool, id = A) => executeAccountTransaction(pool, command(id), 'activity', [], new AbortController().signal);

test('PT409 survives adapter sanitization without leaking driver details', async () => {
  const f = fixture();
  f.client.query = async () => { throw Object.assign(new Error('private'), { code: 'PT409', detail: 'private', query: 'private' }); };
  const pool = adaptCommitPool(f.driver), c = await pool.connect();
  await assert.rejects(c.query('SELECT 1'), e => e.code === 'PT409' && e.message === 'account-db-operation-failed' && !e.detail && !e.query && !e.cause);
  c.release(); assert.deepEqual(f.releases, [false]); await pool.close();
});

test('strict TLS configuration, bounded pool, no connection string or ambient PG fallback', () => {
  const c = accountPoolConfig(env());
  assert.equal(c.max, 1); assert.equal(c.ssl.rejectUnauthorized, true);
  assert.equal(c.query_timeout, 12000);
  assert.equal(c.ssl.minVersion, 'TLSv1.2'); assert.equal(c.ssl.servername, c.host);
  assert.equal(c.connectionString, undefined);
  assert.ok(c.ssl.checkServerIdentity(c.host, { subjectaltname: 'DNS:wrong.invalid', subject: { CN: 'wrong.invalid' } }));
  for (const change of [{ ONESTEP_DB_USER: 'postgres' }, { ONESTEP_DB_USER: 'service_role' },
    { ONESTEP_DB_USER: 'onestep_app_login_v1' }, { ONESTEP_DB_USER: 'onestep_app_login_v1.wrongproject' },
    { ONESTEP_DB_HOST: 'db.yhzgucbiwvizjxpzwpqg.supabase.co' },
    { ONESTEP_DB_HOST: 'other.invalid' }, { ONESTEP_DB_PORT: '5432' }, { ONESTEP_DB_DATABASE: 'other' },
    { ONESTEP_DB_PASSWORD: 'sbp_do-not-use' }, { ONESTEP_DB_PASSWORD: 'eyJnot-a-password' },
    { ONESTEP_DB_CA_PEM: 'bad-ca' }, { NODE_TLS_REJECT_UNAUTHORIZED: '0' },
    { ONESTEP_DB_POOL_MAX: '5' }, { ONESTEP_DB_CONNECT_TIMEOUT_MS: '0' }, { ONESTEP_DB_IDLE_TIMEOUT_MS: 'NaN' }]) {
    assert.throws(() => accountPoolConfig({ ...env(), ...change }), /^Error: account-db-configuration-invalid$/);
  }
  assert.throws(() => accountPoolConfig({}), /configuration-invalid/);
});

function fixture(fail = '') {
  const client = new EventEmitter(), driver = new EventEmitter();
  let claims = null;
  const seen = [], releases = [], sqls = [];
  client.query = async (sql, values) => {
    sqls.push(sql);
    if (sql === fail || (fail === 'RPC' && sql.startsWith('SELECT public.'))) throw Object.assign(new Error('sensitive-driver-message'), { code: '40001' });
    if (sql.includes('set_config')) { assert.equal(JSON.parse(values[1]).sub, values[0]); claims = values[0]; }
    if (sql.startsWith('SELECT public.')) { seen.push(claims); return { rows: [{ result: { changed: true, revision: 1, date: '2026-11-13' } }] }; }
    if (sql === 'COMMIT' || sql === 'ROLLBACK') claims = null;
    return { rows: [] };
  };
  client.release = destroy => releases.push(destroy);
  driver.connect = async () => client;
  driver.end = async () => {};
  return { driver, client, seen, releases, sqls, claims: () => claims };
}

test('adapter plus executor clears LOCAL A/B claims between transactions', async () => {
  const f = fixture(), pool = adaptCommitPool(f.driver);
  await run(pool, A); assert.equal(f.claims(), null);
  await run(pool, B); assert.deepEqual(f.seen, [A, B]); assert.equal(f.claims(), null);
  assert.deepEqual(f.releases, [false, false]); await pool.close();
});
for (const failure of ['RPC', 'COMMIT', 'BEGIN ISOLATION LEVEL READ COMMITTED']) {
  test(`adapter executor ${failure} sanitizes errors and releases safely`, async () => {
    const f = fixture(failure), pool = adaptCommitPool(f.driver);
    await assert.rejects(run(pool), error => error.message === 'account-db-operation-failed' && error.code === '40001' && !error.cause);
    assert.equal(f.releases[0], failure !== 'RPC');
    if (failure !== 'BEGIN ISOLATION LEVEL READ COMMITTED') assert.equal(f.sqls.at(-1), 'ROLLBACK');
  });
}
test('rollback failure destroys connection', async () => {
  const f = fixture('ROLLBACK');
  const query = f.client.query;
  f.client.query = (sql, args) => sql.startsWith('SELECT public.') ? Promise.reject(Object.assign(new Error('private'), { code: '40001' })) : query(sql, args);
  await assert.rejects(run(adaptCommitPool(f.driver))); assert.deepEqual(f.releases, [true]);
});
test('transport errors, checked-out error events and duplicate release never reuse bad client', async () => {
  for (const mode of ['ECONNRESET', 'EPIPE', 'event']) {
    const f = fixture(), c = await adaptCommitPool(f.driver).connect();
    if (mode !== 'event') {
      f.client.query = async () => { throw Object.assign(new Error('private'), { code: mode }); };
      await assert.rejects(c.query('SELECT 1'), /operation-failed/);
    } else f.client.emit('error', new Error('private'));
    c.release(); c.release(); assert.deepEqual(f.releases, [true]);
    await assert.rejects(c.query('SELECT 1'), /unavailable/);
  }
});
test('idle pool errors are handled and connect errors are sanitized', async () => {
  const f = fixture(), pool = adaptCommitPool(f.driver);
  f.driver.emit('error', new Error('private'));
  f.driver.connect = async () => { throw new Error('private-secret'); };
  await assert.rejects(pool.connect(), /^Error: account-db-operation-failed$/);
});
test('default bootstrap fails closed without dedicated configuration', () => {
  // No environment is loaded by this test; never call a configured production pool.
  if (!process.env.ONESTEP_DB_HOST) assert.throws(getAccountCommitPool, e => e.diagnostic?.stage === 'pool-configuration');
});

test('real pg Pool construction is lazy and does not authenticate or connect', async () => {
  const driver = new Pool(accountPoolConfig(env()));
  const pool = adaptCommitPool(driver);
  assert.equal(driver.totalCount, 0); assert.equal(driver.waitingCount, 0);
  await pool.close();
});

test('A SQL error rolls back before a reused connection serves B', async () => {
  const f = fixture(), query = f.client.query;
  let first = true;
  f.client.query = async (sql, values) => {
    if (first && sql.startsWith('SELECT public.')) {
      first = false; throw Object.assign(new Error('private'), { code: '40001' });
    }
    return query(sql, values);
  };
  const pool = adaptCommitPool(f.driver);
  await assert.rejects(run(pool, A)); assert.equal(f.claims(), null);
  await run(pool, B); assert.deepEqual(f.seen, [B]); assert.deepEqual(f.releases, [false, false]);
});
