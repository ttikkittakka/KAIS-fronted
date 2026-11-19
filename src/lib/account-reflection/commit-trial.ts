import 'server-only';
import { mkdir, open } from 'node:fs/promises';
import { join } from 'node:path';
import { isApprovedDraftTester } from './gates';
import { seoulToday } from '../account-records/model';
import type { CommitExecutor } from './commit-server';
import { assertCommitTestHealthy, stopCommitTest } from './commit-load-guard';

export function isApprovedCommitTester(id: string, env: NodeJS.ProcessEnv = process.env) {
  return isApprovedDraftTester(id, env) && env.ONESTEP_COMMIT_TEST_USER_ID === id;
}

async function reserveTrial(env: NodeJS.ProcessEnv = process.env) {
  const id = env.ONESTEP_COMMIT_TRIAL_APPROVAL;
  if (env.NODE_ENV !== 'development' || !id || !['A-20261116-shared-retest-01', 'A-20261117-reflection-01'].includes(id) ||
      (id === 'A-20261117-reflection-01' && env.ONESTEP_COMMIT_TEST_DATE !== '2026-11-17')) throw new Error('commit-trial-not-approved');
  const directory = join(process.cwd(), '.env.phase3b-ab', id);
  await mkdir(directory, { recursive: true });
  // Atomic across requests/processes. Never auto-remove, even after an uncertain failure.
  const file = await open(join(directory, 'commit-trial.attempt'), 'wx', 0o600);
  await file.close();
}

/** Activation still requires the separate code gate. No automatic retry or receipt reset. */
export function createSingleCommitTrial(execute: CommitExecutor, reserve = reserveTrial,
  environment: () => NodeJS.ProcessEnv = () => process.env): CommitExecutor {
  return async (command, signal) => {
    const env = environment();
    if (!isApprovedCommitTester(command.userId, env) || command.date !== env.ONESTEP_COMMIT_TEST_DATE ||
        command.date !== seoulToday(new Date()) || command.expiresAt <= Date.now()) throw new Error('commit-trial-not-approved');
    signal.throwIfAborted();
    assertCommitTestHealthy();
    await reserve(env);
    signal.throwIfAborted();
    const controller = new AbortController();
    const interval = setInterval(() => {
      try { assertCommitTestHealthy(); } catch { controller.abort(); }
    }, 100);
    const timeout = setTimeout(() => { stopCommitTest(); controller.abort(); }, 15000);
    try {
      assertCommitTestHealthy();
      return await execute(command, AbortSignal.any([signal, controller.signal]));
    } finally { clearInterval(interval); clearTimeout(timeout); }
  };
}
