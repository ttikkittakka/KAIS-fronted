import 'server-only';
import { z } from 'zod';
import { draftInputSchema, draftResultSchema } from './model';
import type { CommitExecutor } from './commit-server';
import { safeDbError, type DbStage } from '../account/db-diagnostics';

/** Structural node-postgres adapter. No driver, pool, credentials or network connection is created here. */
export type CommitConnection = {
  query(sql: string, values?: unknown[]): Promise<{ rows: { result?: unknown }[] }>;
  release(destroy?: boolean): void;
};
export type CommitPool = { connect(): Promise<CommitConnection> };
const commandSchema = draftInputSchema.extend({ userId: z.uuid(),
  expiresAt: z.number().finite(),
  cares: z.array(z.string().min(1)).length(3).refine(ids => new Set(ids).size === 3), title: z.string().min(1).max(200).refine(value => value.trim().length > 0),
}).refine(value => value.answers.every(Boolean));

/** Requires a dedicated minimum-privilege pool, TLS verification and bounded connection wait. */
export function createCommitExecutor(pool: CommitPool): CommitExecutor {
  if (typeof window !== 'undefined') throw new Error('server-only');
  return async (raw, signal) => {
    const command = commandSchema.parse(raw);
    return executeAccountTransaction(pool, command, 'reflection',
      [command.date, command.answers, command.cares, command.title, command.revision], signal);
  };
}

/** Fixed allowlist only; shared transaction hygiene for the two approved v2 contracts. */
export async function executeAccountTransaction(pool: CommitPool,
  command: { userId: string; expiresAt: number; date: string; revision: number },
  kind: 'reflection' | 'activity', values: unknown[], signal: AbortSignal) {
    if (typeof window !== 'undefined') throw new Error('server-only');
    const sql = kind === 'reflection'
      ? 'SELECT public.onestep_commit_reflection_v2($1::date,$2::text[],$3::text[],$4::text,$5::bigint) AS result'
      : 'SELECT public.onestep_commit_activity_v2($1::date,$2::text,$3::text,$4::bigint) AS result';
    signal.throwIfAborted();
    const client = await pool.connect();
    let began = false, committing = false, destroy = false;
    let stage: DbStage = 'begin';
    try {
      signal.throwIfAborted();
      if (command.expiresAt <= Date.now()) throw new Error('authentication-expired');
      await client.query('BEGIN ISOLATION LEVEL READ COMMITTED'); began = true;
      stage = 'role';
      await client.query("SET LOCAL ROLE onestep_commit_executor");
      stage = 'timeouts';
      await client.query("SET LOCAL lock_timeout = '2s'");
      await client.query("SET LOCAL statement_timeout = '8s'");
      await client.query("SET LOCAL idle_in_transaction_session_timeout = '10s'");
      stage = 'claims';
      await client.query("SELECT pg_catalog.set_config('request.jwt.claim.sub', $1, true), pg_catalog.set_config('request.jwt.claims', $2, true)",
        [command.userId, JSON.stringify({ sub: command.userId })]);
      signal.throwIfAborted();
      stage = 'rpc';
      const result = await client.query(sql, values);
      stage = 'acknowledgement';
      const ack = draftResultSchema.parse(result.rows[0]?.result);
      if (ack.date !== command.date || ack.revision < command.revision || (ack.changed && ack.revision <= command.revision)) throw new Error('invalid-commit-ack');
      if (kind === 'activity' && ack.changed && ack.revision !== command.revision + 1) throw new Error('invalid-activity-ack');
      signal.throwIfAborted();
      committing = true;
      stage = 'commit';
      await client.query('COMMIT'); began = false;
      return ack;
    } catch (error) {
      const failure = safeDbError(error, stage, began);
      destroy = committing || !began;
      if (began) {
        try { await client.query('ROLLBACK'); } catch { destroy = true; }
      }
      throw failure;
    } finally { client.release(destroy); }
}
