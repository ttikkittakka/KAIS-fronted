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

export const GROWTH_TRIAL_ID = 'A-20261116-growth-done-01';
const date = '2026-11-16';
/** Prepared only. No route imports this module; enabling requires separate approval. */
export function growthTrialBefore(day: AccountRecords, owner: string) {
  activityDaySchema.parse(day);
  if (day.userId !== owner || day.date !== date || day.today !== date ||
      day.record?.stage !== 'growth' || day.record.revision !== 6 ||
      day.record.answers.length !== 4 || !day.record.answers.every(Boolean) ||
      day.cares.length !== 3 || day.cares.some(c => c.completed_at !== null) ||
      day.rewards.length !== 1 || day.rewards[0].reason !== 'reflection' ||
      day.rewards[0].delta !== 10 || day.sunshineBalance !== 10) throw new Error('growth-trial-precondition');
}
export function growthTrialAfter(before: AccountRecords, after: AccountRecords) {
  growthTrialBefore(before, before.userId);
  activityDaySchema.parse(after);
  const participation = after.rewards.filter(r => r.reason === 'participation');
  if (participation.length !== 1 || participation[0].delta !== 5 || participation[0].event_key !== before.date + ':participation') throw new Error('growth-trial-reward');
  const expected = { ...before, sunshineBalance: 15, record: { ...before.record!, stage: 'care', revision: 7 }, rewards: [...before.rewards, participation[0]] };
  after = { ...after, rewards: [...after.rewards].sort((a,b) => a.reason.localeCompare(b.reason)) };
  expected.rewards.sort((a,b) => a.reason.localeCompare(b.reason));
  // Includes unchanged answers, text, care IDs/completions, ledger and balance.
  if (JSON.stringify(after) !== JSON.stringify(expected)) throw new Error('growth-trial-postcondition');
}
async function reserve() {
  const directory = join(process.cwd(), '.env.phase3b-ab', GROWTH_TRIAL_ID);
  await mkdir(directory, { recursive: true });
  const file = await open(join(directory, 'activity-executor.attempt'), 'wx', 0o600);
  await file.close();
}
/** Lazy Shared Pooler reuse: no credentials or connections at construction time. */
export function createSharedGrowthTrialExecutor(read: (owner: string, date: string) => Promise<AccountRecords>) {
  return createGrowthTrialExecutor({ read,
    execute: (command, signal) => createActivityExecutor(getAccountCommitPool())(command, signal),
  });
}
export function createGrowthTrialExecutor(options: {
  execute: ActivityExecutor;
  read: (owner: string, date: string) => Promise<AccountRecords>;
  reserve?: () => Promise<void>;
  environment?: () => NodeJS.ProcessEnv;
  now?: () => Date;
  timeoutMs?: number;
}): ActivityExecutor {
  return async (command, signal) => {
    const env = (options.environment ?? (() => process.env))();
    const now = (options.now ?? (() => new Date()))();
    if (env.NODE_ENV !== 'development' || env.ONESTEP_ACTIVITY_TRIAL_APPROVAL !== GROWTH_TRIAL_ID ||
        !isApprovedDraftTester(command.userId, env) || command.userId !== env.ONESTEP_ACTIVITY_APPROVED_A_ID ||
        command.date !== date || seoulToday(now) !== date || command.revision !== 6 ||
        command.action !== 'growth_done' || command.careId !== undefined || command.expiresAt <= now.getTime()) throw new Error('growth-trial-not-approved');
    signal.throwIfAborted(); assertCommitTestHealthy();
    const before = await options.read(command.userId, date);
    growthTrialBefore(before, command.userId);
    signal.throwIfAborted(); assertCommitTestHealthy();
    await (options.reserve ?? reserve)();
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
