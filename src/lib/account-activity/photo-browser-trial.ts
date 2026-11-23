import 'server-only';
import { readFile, open, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { authenticateAccount, reply } from '../account/auth';
import { accountPoolConfig, getAccountCommitPool } from '../account/db-pool';
import { seoulToday } from '../account-records/model';
import { isApprovedDraftTester } from '../account-reflection/gates';
import { createActivityHandler } from './server';
import { createActivityExecutor } from './executor';
import { createPhotoTrialExecutor, CURRENT_PHOTO_TRIAL_ID } from './photo-trial';

const directory = () => join(process.cwd(), '.env.phase3b-ab', CURRENT_PHOTO_TRIAL_ID);
const receipt = () => join(directory(), 'activity-http.attempt');
async function approval() {
  if (process.env.NODE_ENV !== 'development' || seoulToday() !== '2026-11-17') return null;
  try {
    const value = JSON.parse(await readFile(join(directory(), 'browser-approval.json'), 'utf8'));
    if (value.executionId !== CURRENT_PHOTO_TRIAL_ID || !Number.isFinite(value.expiresAt) || value.expiresAt <= Date.now() ||
        !isApprovedDraftTester(value.userId) || existsSync(receipt()) ||
        existsSync(join(directory(), 'activity-executor.attempt'))) return null;
    accountPoolConfig(process.env); // Checks this Next process's injected configuration; no connection.
    return value as { userId: string; expiresAt: number };
  } catch { return null; }
}
export async function photoBrowserStatus(request: Request) {
  const auth = await authenticateAccount(request);
  if (auth instanceof Response) return auth;
  let configured = false;
  try { accountPoolConfig(process.env); configured = true; } catch { /* Never expose configuration. */ }
  const permit = await approval();
  return reply(200, { enabled: permit?.userId === auth.userId,
    development: process.env.NODE_ENV === 'development', configured,
    today: seoulToday(), date: '2026-11-17', action: 'photo_done' });
}
export async function handlePhotoBrowserTrial(request: Request) {
  const permit = await approval();
  if (!permit) return reply(503, { error: 'activity-not-ready' });
  const auth = await authenticateAccount(request);
  if (auth instanceof Response) return auth;
  if (auth.userId !== permit.userId) return reply(403, { error: 'activity-forbidden' });
  try {
    const input = await request.clone().json();
    if (input.action !== 'photo_done' || input.date !== '2026-11-17' || input.revision !== 5 || input.careId !== undefined)
      return reply(403, { error: 'photo-trial-scope' });
  } catch { return reply(400, { error: 'invalid-input' }); }
  // Exclusive HTTP receipt closes this gate across processes, errors and refreshes.
  try { const file = await open(receipt(), 'wx', 0o600); await file.close(); }
  catch { return reply(409, { error: 'photo-trial-already-attempted' }); }
  const handle = createActivityHandler({
    enabled: () => process.env.NODE_ENV === 'development' && Date.now() < permit.expiresAt,
    allowedUser: id => id === permit.userId && isApprovedDraftTester(id),
    execute: (command, signal, before) => {
      if (!before) throw new Error('photo-trial-snapshot-required');
      return createPhotoTrialExecutor({ trialId: CURRENT_PHOTO_TRIAL_ID,
        read: async () => before,
        environment: () => ({ ...process.env, ONESTEP_ACTIVITY_TRIAL_APPROVAL: CURRENT_PHOTO_TRIAL_ID, ONESTEP_ACTIVITY_APPROVED_A_ID: permit.userId }),
        execute: (input, abort) => createActivityExecutor(getAccountCommitPool())(input, abort),
      })(command, signal);
    },
  });
  const response = await handle(request);
  await writeFile(join(directory(), 'browser-http-result.json'), JSON.stringify({ executionId: CURRENT_PHOTO_TRIAL_ID, status: response.status, finishedAt: new Date().toISOString(), gateClosed: true }), { flag: 'wx', mode: 0o600 });
  return response;
}
