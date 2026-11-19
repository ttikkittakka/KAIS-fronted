import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { loadTs } from './helpers/load-ts.mjs';
test('browser gate allows only approved photo click once and closes after an uncertain response', async () => {
  const auth = loadTs(new URL('../src/lib/account/auth.ts', import.meta.url));
  const db = loadTs(new URL('../src/lib/account/db-pool.ts', import.meta.url));
  const model = loadTs(new URL('../src/lib/account-records/model.ts', import.meta.url));
  const gates = loadTs(new URL('../src/lib/account-reflection/gates.ts', import.meta.url));
  const server = loadTs(new URL('../src/lib/account-activity/server.ts', import.meta.url));
  let owner = 'test-A', calls = 0;
  auth.authenticateAccount = async () => ({ userId: owner });
  db.accountPoolConfig = () => ({});
  model.seoulToday = () => '2026-11-17';
  gates.isApprovedDraftTester = id => ['test-A', 'test-B'].includes(id);
  server.createActivityHandler = () => async () => { calls++; return Response.json({ error: 'uncertain' }, { status: 503 }); };
  const { handlePhotoBrowserTrial, photoBrowserStatus } = loadTs(new URL('../src/lib/account-activity/photo-browser-trial.ts', import.meta.url));
  const cwd = process.cwd(), environment = process.env.NODE_ENV;
  const dir = mkdtempSync(join(tmpdir(), 'photo-browser-gate-'));
  process.chdir(dir); process.env.NODE_ENV = 'development';
  const folder = join(dir, '.env.phase3b-ab', 'A-20261117-photo-done-01'); mkdirSync(folder, { recursive: true });
  const request = (patch = {}) => new Request('http://localhost/api/account/activity', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ date: '2026-11-17', revision: 5, action: 'photo_done', ...patch }) });
  try {
    assert.equal((await handlePhotoBrowserTrial(request())).status, 503);
    writeFileSync(join(folder, 'browser-approval.json'), JSON.stringify({ executionId: 'A-20261117-photo-done-01', userId: 'test-A', expiresAt: Date.now() + 60000 }));
    process.env.NODE_ENV = 'production'; assert.equal((await handlePhotoBrowserTrial(request())).status, 503);
    process.env.NODE_ENV = 'development';
    owner = 'test-B'; assert.equal((await handlePhotoBrowserTrial(request())).status, 403); owner = 'test-A';
    for (const patch of [{ action: 'growth_done' }, { action: 'care_done' }, { date: '2026-11-16' }, { revision: 6 }]) assert.equal((await handlePhotoBrowserTrial(request(patch))).status, 403);
    assert.equal(calls, 0); assert.equal(existsSync(join(folder, 'activity-http.attempt')), false);
    assert.equal((await (await photoBrowserStatus(request())).json()).enabled, true);
    await Promise.all([handlePhotoBrowserTrial(request()), handlePhotoBrowserTrial(request())]);
    assert.equal(calls, 1); assert.equal(existsSync(join(folder, 'activity-http.attempt')), true);
    assert.equal((await (await photoBrowserStatus(request())).json()).enabled, false);
    assert.equal((await handlePhotoBrowserTrial(request())).status, 503); assert.equal(calls, 1);
  } finally { process.chdir(cwd); if (environment === undefined) delete process.env.NODE_ENV; else process.env.NODE_ENV = environment; }
});
