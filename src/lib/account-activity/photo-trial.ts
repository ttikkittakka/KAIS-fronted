import 'server-only';
import { mkdir, open } from 'node:fs/promises';
import { join } from 'node:path';
import { isApprovedDraftTester } from '../account-reflection/gates';
import { assertCommitTestHealthy } from '../account-reflection/commit-load-guard';
import { seoulToday, type AccountRecords } from '../account-records/model';
import { activityDaySchema } from './model';
import type { ActivityExecutor } from './server';
import { createActivityExecutor } from './executor';
import { getAccountCommitPool } from '../account/db-pool';

export const PHOTO_TRIAL_ID = 'A-20261116-photo-done-01';
const profiles = {
  'A-20261116-photo-done-01': { date: '2026-11-16', balance: 10 },
  'A-20261117-photo-done-01': { date: '2026-11-17', balance: 20 },
} as const;
export type PhotoTrialId = keyof typeof profiles;
export const CURRENT_PHOTO_TRIAL_ID: PhotoTrialId = 'A-20261117-photo-done-01';
/** Prepared only. No route imports this module; enabling requires separate approval. */
export function photoTrialBefore(day: AccountRecords, owner: string, id: PhotoTrialId = PHOTO_TRIAL_ID) {
  const { date, balance } = profiles[id];
  activityDaySchema.parse(day);
  if (day.userId !== owner || day.date !== date || day.today !== date ||
      day.record?.stage !== 'photo' || day.record.revision !== 5 ||
      day.record.answers.length !== 4 || !day.record.answers.every(Boolean) ||
      day.cares.length !== 3 || day.cares.some(c => c.completed_at !== null) ||
      day.rewards.length !== 1 || day.rewards[0].reason !== 'reflection' ||
      day.rewards[0].delta !== 10 || day.sunshineBalance !== balance) throw new Error('photo-trial-precondition');
}
export function photoTrialAfter(before: AccountRecords, after: AccountRecords, id: PhotoTrialId = PHOTO_TRIAL_ID) {
  photoTrialBefore(before, before.userId, id);
  activityDaySchema.parse(after);
  const expected = { ...before, record: { ...before.record!, stage: 'growth', revision: 6 } };
  // Includes unchanged answers, text, care IDs/completions, ledger and balance.
  if (JSON.stringify(after) !== JSON.stringify(expected)) throw new Error('photo-trial-postcondition');
}
async function reserve(id: PhotoTrialId) {
  const directory = join(process.cwd(), '.env.phase3b-ab', id);
  await mkdir(directory, { recursive: true });
  const file = await open(join(directory, 'activity-executor.attempt'), 'wx', 0o600);
  await file.close();
}
/** Lazy Shared Pooler reuse: no credentials or connections at construction time. */
export function createSharedPhotoTrialExecutor(read: (owner: string, date: string) => Promise<AccountRecords>, trialId: PhotoTrialId = PHOTO_TRIAL_ID) {
  return createPhotoTrialExecutor({ read, trialId,
    execute: (command, signal) => createActivityExecutor(getAccountCommitPool())(command, signal),
  });
}
export function createPhotoTrialExecutor(options: {
  execute: ActivityExecutor;
  read: (owner: string, date: string) => Promise<AccountRecords>;
  reserve?: () => Promise<void>;
  environment?: () => NodeJS.ProcessEnv;
  now?: () => Date;
  timeoutMs?: number;
  trialId?: PhotoTrialId;
}): ActivityExecutor {
  return async (command, signal) => {
    const env = (options.environment ?? (() => process.env))();
    const now = (options.now ?? (() => new Date()))();
    const id = options.trialId ?? PHOTO_TRIAL_ID;
    const { date } = profiles[id];
    if (env.NODE_ENV !== 'development' || env.ONESTEP_ACTIVITY_TRIAL_APPROVAL !== id ||
        !isApprovedDraftTester(command.userId, env) || command.userId !== env.ONESTEP_ACTIVITY_APPROVED_A_ID ||
        command.date !== date || seoulToday(now) !== date || command.revision !== 5 ||
        command.action !== 'photo_done' || command.careId !== undefined || command.expiresAt <= now.getTime()) throw new Error('photo-trial-not-approved');
    signal.throwIfAborted(); assertCommitTestHealthy();
    const before = await options.read(command.userId, date);
    photoTrialBefore(before, command.userId, id);
    signal.throwIfAborted(); assertCommitTestHealthy();
    await (options.reserve ?? (() => reserve(id)))();
    // Reservation is consumed before connect/SQL and never removed after uncertainty.
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), options.timeoutMs ?? 15000);
    try {
      const combined = AbortSignal.any([signal, controller.signal]);
      combined.throwIfAborted(); assertCommitTestHealthy();
      return await options.execute(command, combined);
    } finally { clearTimeout(timer); }
  };
}
