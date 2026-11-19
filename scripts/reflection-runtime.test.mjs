import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import ts from 'typescript';
import { loadTs } from './helpers/load-ts.mjs';
const { isApprovedDraftTester } = loadTs(new URL('../src/lib/account-reflection/gates.ts', import.meta.url));
const A = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', B = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
function setup(activate) {
  let code = readFileSync(new URL('../src/lib/account-reflection/commit-runtime.ts', import.meta.url), 'utf8');
  if (!activate) code = code.replace('const DEVELOPMENT_COMMIT_ENABLED = true;', 'const DEVELOPMENT_COMMIT_ENABLED = false;');
  const env = { NODE_ENV: 'development', ONESTEP_DRAFT_TEST_USER_IDS: A + ',' + B };
  let calls = 0;
  const dependencies = {
    'server-only': {},
    '../account/db-pool': { accountPoolConfig() {}, getAccountCommitPool: () => ({}) },
    '../account/auth': { authenticateAccount: async () => ({ userId: A }), reply: (status, body) => Response.json(body, { status }) },
    '../account-records/model': { seoulToday: () => '2026-11-18' },
    './gates': { isApprovedDraftTester: id => isApprovedDraftTester(id, env) },
    './commit-load-guard': { assertCommitTestHealthy() {}, readCommitSnapshot() {}, serializeCommitTest: handler => handler },
    './commit-server': { createCommitHandler: options => options },
    './commit-executor': { createCommitExecutor: () => async () => { calls++; return {}; } },
  };
  const exports = {};
  new Function('require', 'exports', 'process', ts.transpileModule(code, { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText)(name => dependencies[name], exports, { env });
  return { exports, env, calls: () => calls };
}
test('reflection capability stays sealed even with an old trial approval', async () => {
  const { exports, env } = setup(false);
  env.ONESTEP_COMMIT_TRIAL_APPROVAL = 'A-20261117-reflection-01';
  assert.equal(exports.isDevelopmentCommitEnabled(), false);
  assert.equal((await (await exports.handleCommitCapability(new Request('http://localhost'))).json()).enabled, false);
});
test('approved generic reflection runtime supports A/B and current date, not fixed revision/balance or past trials', async () => {
  const { exports, env, calls } = setup(true), handler = exports.handlePreparedCommitRequest;
  assert.equal(handler.allowedUser(A), true); assert.equal(handler.allowedUser(B), true);
  assert.equal(handler.allowedUser('cccccccc-cccc-4ccc-8ccc-cccccccccccc'), false);
  const draft = { today: '2026-11-18', date: '2026-11-18', record: { stage: 'checkin', revision: 8, answers: ['normal', 'normal', 'normal', 'normal'], recommendation_title: null }, cares: [], rewards: [], sunshineBalance: 20 };
  assert.equal(handler.validateDraft(draft), true);
  assert.equal(handler.validateDraft({ ...draft, cares: [{}] }), false);
  const signal = new AbortController().signal;
  assert.throws(() => handler.execute({ userId: A, date: '2026-11-17' }, signal));
  assert.equal(calls(), 0);
  await handler.execute({ userId: A, date: '2026-11-18', expiresAt: Date.now() + 60000 }, signal);
  assert.equal(calls(), 1);
  env.NODE_ENV = 'production'; assert.equal(handler.enabled(), false);
});
