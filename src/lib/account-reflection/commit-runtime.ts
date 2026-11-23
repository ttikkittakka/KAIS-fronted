import 'server-only';
import { accountPoolConfig, getAccountCommitPool } from '../account/db-pool';
import { authenticateAccount, reply } from '../account/auth';
import { seoulToday } from '../account-records/model';
import { createCommitExecutor, type CommitPool } from './commit-executor';
import { createCommitHandler, type CommitExecutor } from './commit-server';
import { isApprovedDraftTester } from './gates';
import { assertCommitTestHealthy, readCommitSnapshot, serializeCommitTest } from './commit-load-guard';

// Read-only preparation is independent from the sealed write gate, with no executor.
export const handleCommitPreparationRequest = serializeCommitTest(createCommitHandler({
  prepareOnly: true,
  enabled: () => process.env.NODE_ENV === 'development',
  allowedUser: isApprovedDraftTester,
  read: readCommitSnapshot,
}));

/** Called only after request Auth, input and snapshot validation. No eager connection. */
export function createLazyCommitExecutor(getPool: () => CommitPool = getAccountCommitPool): CommitExecutor {
  return async (command, signal) => {
    signal.throwIfAborted();
    if (command.expiresAt <= Date.now()) throw new Error('authentication-expired');
    return createCommitExecutor(getPool())(command, signal);
  };
}

// Approved development A/B reflection flow. Production and non-allowlisted users remain blocked.
const DEVELOPMENT_COMMIT_ENABLED = true;
export function isDevelopmentCommitEnabled() {
  if (!DEVELOPMENT_COMMIT_ENABLED || process.env.NODE_ENV !== 'development') return false;
  try { accountPoolConfig(process.env); assertCommitTestHealthy(); return true; }
  catch { return false; }
}
export async function handleCommitCapability(request: Request) {
  const auth = await authenticateAccount(request);
  if (auth instanceof Response) return auth;
  return reply(200, { enabled: isDevelopmentCommitEnabled() && isApprovedDraftTester(auth.userId), today: seoulToday() });
}
export const handlePreparedCommitRequest = createCommitHandler({
  enabled: isDevelopmentCommitEnabled,
  allowedUser: isApprovedDraftTester,
  validateDraft: day => day.today === day.date && day.record?.stage === 'checkin' &&
    day.record.answers.every(Boolean) && day.record.recommendation_title === null && day.cares.length === 0 && day.rewards.length === 0,
  read: readCommitSnapshot,
  execute: (command, signal) => {
    if (!isDevelopmentCommitEnabled() || !isApprovedDraftTester(command.userId) || command.date !== seoulToday()) throw new Error('reflection-commit-not-ready');
    return createLazyCommitExecutor()(command, AbortSignal.any([signal, AbortSignal.timeout(15000)]));
  },
});
