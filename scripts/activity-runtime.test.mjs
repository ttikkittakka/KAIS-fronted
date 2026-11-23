import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import ts from 'typescript';
import { loadTs } from './helpers/load-ts.mjs';
const { isApprovedDraftTester } = loadTs(new URL('../src/lib/account-reflection/gates.ts', import.meta.url));
const A = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', B = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
function setup(activated) {
  let source = readFileSync(new URL('../src/lib/account-activity/runtime.ts', import.meta.url), 'utf8');
  if (!activated) source = source.replace('const DEVELOPMENT_ACTIVITY_ENABLED = true;', 'const DEVELOPMENT_ACTIVITY_ENABLED = false;');
  const env = { NODE_ENV: 'development', ONESTEP_DRAFT_TEST_USER_IDS: A + ',' + B };
  let calls = 0;
  const dependencies = {
    '../account-photos/lock': { withPhotoDayLock: (_owner, _date, work) => work() },
    'server-only': {},
    '../account/auth': { authenticateAccount: async () => ({ userId: A }), reply: (status, data) => Response.json(data, { status }) },
    '../account/db-pool': { accountPoolConfig: () => ({}), getAccountCommitPool: () => ({}) },
    '../account-records/model': { seoulToday: () => '2026-11-18' },
    '../account-reflection/gates': { isApprovedDraftTester: id => isApprovedDraftTester(id, env) },
    '../account-reflection/commit-load-guard': { assertCommitTestHealthy() {} },
    './executor': { createActivityExecutor: () => async () => { calls++; return {}; } },
    './server': { createActivityHandler: options => options },
  };
  const exports = {};
  const code = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText;
  new Function('require', 'exports', 'process', code)(name => dependencies[name], exports, { env });
  return { exports, env, calls: () => calls };
}
test('runtime remains closed without separate code activation, including development and old approval flags', () => {
  const { exports, env } = setup(false);
  env.ONESTEP_ACTIVITY_TRIAL_APPROVAL = 'A-20261117-photo-done-01';
  assert.equal(exports.activityEnabled(), false);
});
test('activated runtime allows only A/B development and current Seoul date before reaching executor', async () => {
  const { exports, env, calls } = setup(true), handler = exports.handleDevelopmentActivity;
  assert.equal(handler.allowedUser(A), true); assert.equal(handler.allowedUser(B), true);
  assert.equal(handler.allowedUser('cccccccc-cccc-4ccc-8ccc-cccccccccccc'), false);
  const signal = new AbortController().signal;
  await assert.rejects(handler.execute({ userId: A, date: '2026-11-17' }, signal));
  assert.equal(calls(), 0);
  await handler.execute({ userId: A, date: '2026-11-18' }, signal); assert.equal(calls(), 1);
  env.NODE_ENV = 'production'; assert.equal(handler.enabled(), false);
  await assert.rejects(handler.execute({ userId: A, date: '2026-11-18' }, signal)); assert.equal(calls(), 1);
});
