import 'server-only';
import { createHash } from 'node:crypto';
import { open, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { Pool } from 'pg';
import { accountPoolConfig } from './db-pool';
import { classifyDbError } from './db-diagnostics';

/** One actual Next.js connection; read-only identity and LOCAL context checks, no RPC. */
export async function runNextDbDiagnostic() {
  if (process.env.NODE_ENV !== 'development' || process.env.NEXT_RUNTIME !== 'nodejs' ||
      process.env.ONESTEP_NEXT_DB_DIAGNOSTIC !== 'read-only-once') return;
  const dir = join(process.cwd(), '.env.phase3b-ab');
  // A separate diagnostic receipt; never touches the consumed commit receipts.
  try { const file = await open(join(dir, 'next-shared-db-readonly.attempt'), 'wx', 0o600); await file.close(); }
  catch { return; }
  const report: Record<string, unknown> = { runtime: 'next-nodejs', production: false, pid: process.pid, connectionsAttempted: 0, identitySelects: 0, writes: 0 };
  let pool: Pool | undefined, stage = 'configuration';
  const hash = (value: string | undefined) => createHash('sha256').update(value ?? '').digest('hex');
  try {
    const config = accountPoolConfig(process.env);
    report.passwordInjectionMatches = !!process.env.ONESTEP_DB_PASSWORD && hash(process.env.ONESTEP_DB_PASSWORD) === process.env.ONESTEP_DIAGNOSTIC_PASSWORD_HASH;
    report.caInjectionMatches = !!process.env.ONESTEP_DB_CA_PEM && hash(process.env.ONESTEP_DB_CA_PEM) === process.env.ONESTEP_DIAGNOSTIC_CA_HASH;
    report.hostExact = config.host === 'aws-0-ap-northeast-2.pooler.supabase.com';
    report.hostMalformed = /[\s/:"'$]/.test(config.host ?? '');
    report.tlsVerification = typeof config.ssl === 'object' && config.ssl.rejectUnauthorized === true;
    report.portCorrect = config.port === 6543;
    if (!report.passwordInjectionMatches || !report.caInjectionMatches) throw new Error('injection-mismatch');
    stage = 'pool-construction'; pool = new Pool(config); pool.on('error', () => {});
    stage = 'connect'; report.connectionsAttempted = 1;
    const client = await pool.connect();
    try {
      stage = 'identity-select'; report.identitySelects = 1;
      const result = await client.query('SELECT current_user = $1 AS login_matches, session_user = $1 AS session_matches, current_database() = $2 AS database_matches', ['onestep_app_login_v1', config.database]);
      report.identity = result.rows[0];
      if (!Object.values(result.rows[0]).every(value => value === true)) throw new Error('identity-mismatch');
      const stats = async () => (await client.query("SELECT xact_rollback::text AS rollbacks, numbackends, deadlocks::text AS deadlocks FROM pg_catalog.pg_stat_database WHERE datname=current_database()")).rows[0];
      stage = 'stats-before'; const before = await stats();
      report.statsBefore = before;
      stage = 'local-context';
      await client.query('BEGIN READ ONLY');
      await client.query("SET LOCAL statement_timeout='5s'");
      await client.query("SET LOCAL idle_in_transaction_session_timeout='10s'");
      const cleanSql = "SELECT current_user='onestep_app_login_v1' AND coalesce(current_setting('request.jwt.claim.sub',true),'')='' AND coalesce(current_setting('request.jwt.claims',true),'')='' AS clean";
      report.initialClaimsClean = (await client.query(cleanSql)).rows[0]?.clean === true;
      if (!report.initialClaimsClean) throw new Error('dirty-initial-context');
      await client.query('SET LOCAL ROLE onestep_commit_executor');
      await client.query("SELECT set_config('request.jwt.claim.sub',$1,true), set_config('request.jwt.claims',$2,true)", ['readonly-probe', JSON.stringify({ sub: 'readonly-probe' })]);
      report.localContext = (await client.query("SELECT current_user='onestep_commit_executor' AND session_user='onestep_app_login_v1' AND current_setting('request.jwt.claim.sub')='readonly-probe' AND current_setting('request.jwt.claims')::jsonb->>'sub'='readonly-probe' AS ok")).rows[0]?.ok === true;
      if (!report.localContext) throw new Error('local-context-mismatch');
      await client.query('COMMIT');
      stage = 'context-after-commit';
      report.claimsCleanAfterCommit = (await client.query(cleanSql)).rows[0]?.clean === true;
      if (!report.claimsCleanAfterCommit) throw new Error('context-not-reset');
      stage = 'stats-after'; const after = await stats();
      report.statsAfter = after;
      report.rollbackDelta = Number(after.rollbacks) - Number(before.rollbacks);
      report.deadlockDelta = Number(after.deadlocks) - Number(before.deadlocks);
      report.cpuMeasured = false;
      report.loadConcern = Number(report.rollbackDelta) > 0 || Number(report.deadlockDelta) > 0 || after.numbackends - before.numbackends > 5;
      if (report.loadConcern) throw new Error('load-concern-stop');
      report.success = true;
    } finally { client.release(true); }
  } catch (error) { report.success = false; report.stage = stage; report.chain = classifyDbError(error); }
  finally {
    try { await pool?.end(); } catch { report.closeFailed = true; }
    delete process.env.ONESTEP_DIAGNOSTIC_PASSWORD_HASH; delete process.env.ONESTEP_DIAGNOSTIC_CA_HASH;
    await writeFile(join(dir, 'next-shared-db-readonly-result.json'), JSON.stringify(report, null, 2), { mode: 0o600 });
    console.info(JSON.stringify({ event: 'next-db-readonly-diagnostic', ...report }));
  }
}
