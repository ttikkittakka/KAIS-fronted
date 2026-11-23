import { test } from 'node:test';
import assert from 'node:assert/strict';
import { prepareAccounts, validate, PROJECT } from './supabase-ab-prepare.mjs';
import { abRunFiles, AB_ENV_FILE, AB_STATE_FILE, AB_INPUT_FILE } from './helpers/supabase-ab-files.mjs';

test('run paths isolate attempts and never select preserved files', () => {
  const first = abRunFiles('onestep-ab-11111111-1111-4111-8111-111111111111');
  const second = abRunFiles('onestep-ab-22222222-2222-4222-8222-222222222222');
  assert.equal(new Set([...Object.values(first), ...Object.values(second)]).size, 4);
  for (const file of [...Object.values(first), ...Object.values(second)]) {
    assert.ok(![AB_ENV_FILE, AB_STATE_FILE, AB_INPUT_FILE].includes(file));
    assert.ok(file.startsWith('.env.'));
  }
  for (const invalid of ['', '../old', 'onestep-ab-../../old', 'onestep-ab-invalid']) {
    assert.throws(() => abRunFiles(invalid));
  }
});

const input = { ONESTEP_AB_EMAIL_A: 'a@example.invalid', ONESTEP_AB_EMAIL_B: 'b@example.invalid',
  ONESTEP_AB_PASSWORD_A: 'mock-password-a', ONESTEP_AB_PASSWORD_B: 'mock-password-b' };
const run = 'onestep-ab-mock';
const createdAfter = new Date(Date.now() - 1000).toISOString();
const ids = ['11111111-1111-4111-8111-111111111111', '22222222-2222-4222-8222-222222222222'];
function response(role) {
  return { data: { user: { id: ids[role === 'A' ? 0 : 1], email: input[`ONESTEP_AB_EMAIL_${role}`],
    identities: [{ provider: 'email' }], created_at: new Date().toISOString(),
    user_metadata: { onestep_test_run: run, onestep_test_role: role }, email_confirmed_at: null,
  }, session: { access_token: 'DO_NOT_PERSIST_TOKEN' } }, error: null };
}
async function simulate(signUp) {
  const checkpoints = [];
  const result = await prepareAccounts({ client: { auth: { signUp } }, input, run, createdAfter,
    checkpoint: s => checkpoints.push(JSON.parse(JSON.stringify(s))) });
  assert.doesNotMatch(JSON.stringify(checkpoints), /mock-password|DO_NOT_PERSIST_TOKEN/);
  return { result, checkpoints };
}
test('configuration rejects wrong project, secret key and repeated emails', () => {
  const app = { NEXT_PUBLIC_SUPABASE_URL: `https://${PROJECT}.supabase.co`, NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_mock' };
  validate(app, input);
  assert.throws(() => validate({ ...app, NEXT_PUBLIC_SUPABASE_URL: 'https://other.supabase.co' }, input));
  assert.throws(() => validate({ ...app, NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: 'sb_secret_mock' }, input));
  assert.throws(() => validate(app, { ...input, ONESTEP_AB_EMAIL_B: input.ONESTEP_AB_EMAIL_A }));
});
test('two signups carry markers and preserve UUIDs without token persistence', async () => {
  const calls = [];
  const { result, checkpoints } = await simulate(async args => { calls.push(args); return response(args.options.data.onestep_test_role); });
  assert.equal(result.outcome, 'CREATED_AWAITING_AUTH_CHECK');
  assert.deepEqual(result.accounts.map(a => a.uuid), ids);
  assert.equal(calls.length, 2);
  assert.equal(calls[0].options.data.onestep_test_run, run);
  assert.equal(checkpoints[1].accounts[0].outcome, 'REQUEST_STARTED');
});
test('duplicate A stops before B, including obscured duplicate response', async () => {
  for (const r of [{ data: null, error: { code: 'user_already_exists' } },
    { ...response('A'), data: { user: { ...response('A').data.user, identities: [] } } }]) {
    let calls = 0;
    const { result } = await simulate(async () => { calls++; return r; });
    assert.equal(calls, 1);
    assert.equal(result.outcome, 'STOPPED_NO_AUTOMATIC_RETRY');
    assert.equal(result.accounts[0].uuid, undefined);
  }
});
test('B network failure preserves A and never retries or deletes', async () => {
  let calls = 0;
  const { result } = await simulate(async () => { if (++calls === 1) return response('A'); throw new Error('network'); });
  assert.equal(calls, 2);
  assert.equal(result.accounts[0].uuid, ids[0]);
  assert.equal(result.accounts[1].outcome, 'NETWORK_OR_RESULT_UNCERTAIN');
});
test('old user response is never accepted as new', async () => {
  const r = response('A'); r.data.user.created_at = '2020-01-01T00:00:00Z';
  const { result } = await simulate(async () => r);
  assert.equal(result.outcome, 'STOPPED_NO_AUTOMATIC_RETRY');
});
