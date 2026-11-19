import 'server-only';
import { z } from 'zod';
import { executeAccountTransaction, type CommitPool } from '../account-reflection/commit-executor';
import { activityInputSchema } from './model';
import type { ActivityExecutor } from './server';
export function createActivityExecutor(pool: CommitPool): ActivityExecutor {
  return async (raw, signal) => {
    const { userId, expiresAt, ...input } = raw;
    z.uuid().parse(userId); z.number().finite().parse(expiresAt);
    const command = { ...activityInputSchema.parse(input), userId, expiresAt };
    return executeAccountTransaction(pool, command, 'activity',
      [command.date, command.action, command.careId ?? null, command.revision], signal);
  };
}
