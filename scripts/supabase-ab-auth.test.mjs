import { test } from 'node:test';
import assert from 'node:assert/strict';
import { verifyTestAccounts } from './helpers/supabase-ab-auth.mjs';

const projectUrl = 'https://yhzgucbiwvizjxpzwpqg.supabase.co';
const run = 'onestep-ab-11111111-1111-4111-8111-111111111111';
async function simulate({ unconfirmed, loginError, invalidJwt, serverError, wrongRun } = {}) {
  const env = { NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_mock' };
  for (const [i, role] of ['A', 'B'].entries()) {
    env[`ONESTEP_AB_USER_ID_${role}`] = `${i + 1}1111111-1111-4111-8111-111111111111`;
    env[`ONESTEP_AB_EMAIL_${role}`] = `${role}@example.invalid`;
    env[`ONESTEP_AB_PASSWORD_${role}`] = 'mock-secret';
  }
  const checks = [], calls = [];
  let dataWrites = 0, index = 0;
  const makeClient = () => {
    const role = ['A', 'B'][index++];
    const id = env[`ONESTEP_AB_USER_ID_${role}`];
    const token = `mock.${Buffer.from(JSON.stringify({ sub: id, iss: invalidJwt === role ? 'wrong' : `${projectUrl}/auth/v1`, role: 'authenticated', exp: Date.now() / 1000 + 60 })).toString('base64url')}.mock`;
    return { auth: {
      signInWithPassword: async () => {
        calls.push(`${role}:login`);
        return loginError === role ? { error: { code: 'email_not_confirmed', status: 400 } } : { data: { session: { access_token: token } } };
      },
      getUser: async received => {
        assert.equal(received, token);
        calls.push(`${role}:server`);
        return serverError === role ? { error: { code: 'bad_jwt', status: 401 } } : { data: { user: {
          id, email: env[`ONESTEP_AB_EMAIL_${role}`], role: 'authenticated',
          email_confirmed_at: unconfirmed === role ? null : new Date().toISOString(),
          created_at: new Date().toISOString(), user_metadata: { onestep_test_run: wrongRun === role ? 'old-run' : run, onestep_test_role: role },
        } } };
      },
    } };
  };
  let error;
  try {
    const entries = await verifyTestAccounts({ env, run, projectUrl, createdAfter: Date.now() - 1000, makeClient,
      check: (pass, name) => { checks.push({ pass: !!pass, name }); if (!pass) throw new Error(name); },
      ok: (r, name) => { if (r.error) throw new Error(name); return r.data; },
    });
    assert.equal(entries.length, 2);
    dataWrites++; // Represents the caller's first data operation after the gate.
  } catch (e) { error = e.message; }
  assert.ok(!JSON.stringify(checks).includes('mock-secret'));
  return { checks, calls, dataWrites, error };
}

test('both server identities and email confirmations must pass before data operations', async () => {
  const r = await simulate();
  assert.equal(r.error, undefined);
  assert.equal(r.dataWrites, 1);
  for (const role of ['A', 'B']) {
    assert.ok(r.checks.some(c => c.pass && c.name === `${role} server verified Auth identity`));
    assert.ok(r.checks.some(c => c.pass && c.name === `${role} server email confirmation complete`));
  }
  assert.equal(r.checks[0].name, 'two distinct test UUIDs configured');
});
test('email_not_confirmed at A login stops before B and data operations', async () => {
  const r = await simulate({ loginError: 'A' });
  assert.equal(r.dataWrites, 0);
  assert.equal(r.error, 'A normal password login');
  assert.deepEqual(r.calls, ['A:login']);
});
test('successful login and server verification do not imply confirmed email', async () => {
  for (const role of ['A', 'B']) {
    const r = await simulate({ unconfirmed: role });
    assert.equal(r.dataWrites, 0);
    assert.equal(r.error, `${role} server email confirmation complete`);
  }
});
test('server rejection, wrong JWT claims or old account run block all data operations', async () => {
  for (const options of [{ serverError: 'B' }, { invalidJwt: 'B' }, { wrongRun: 'B' }]) {
    const r = await simulate(options);
    assert.equal(r.dataWrites, 0);
    assert.ok(r.error);
  }
});
