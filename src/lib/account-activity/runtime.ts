import 'server-only';
import { authenticateAccount, reply } from '../account/auth';
import { accountPoolConfig, getAccountCommitPool } from '../account/db-pool';
import { seoulToday } from '../account-records/model';
import { isApprovedDraftTester } from '../account-reflection/gates';
import { assertCommitTestHealthy } from '../account-reflection/commit-load-guard';
import { createActivityExecutor } from './executor';
import { createActivityHandler } from './server';
import { withPhotoDayLock } from '../account-photos/lock';

// Approved A/B development flow; only authenticated user actions reach the executor.
const DEVELOPMENT_ACTIVITY_ENABLED = true;
export function activityEnabled() {
  if (!DEVELOPMENT_ACTIVITY_ENABLED || process.env.NODE_ENV !== 'development') return false;
  try { accountPoolConfig(process.env); assertCommitTestHealthy(); return true; }
  catch { return false; }
}
export async function activityCapability(request: Request) {
  const auth = await authenticateAccount(request);
  if (auth instanceof Response) return auth;
  return reply(200, { enabled: activityEnabled() && isApprovedDraftTester(auth.userId), today: seoulToday() });
}
export const handleDevelopmentActivity = createActivityHandler({
  enabled: activityEnabled,
  allowedUser: isApprovedDraftTester,
  execute: async (command, signal) => {
    if (!activityEnabled() || !isApprovedDraftTester(command.userId) || command.date !== seoulToday()) throw new Error('activity-not-ready');
    const deadline = AbortSignal.any([signal, AbortSignal.timeout(15000)]);
    deadline.throwIfAborted();
    return withPhotoDayLock(command.userId, command.date, () => createActivityExecutor(getAccountCommitPool())(command, deadline));
  },
});
