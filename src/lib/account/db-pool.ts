import 'server-only';
import { Pool, type PoolConfig, type PoolClient } from 'pg';
import { createSecureContext, checkServerIdentity } from 'node:tls';
import type { CommitPool } from '../account-reflection/commit-executor';
import { safeDbError } from './db-diagnostics';

const HOST = 'aws-0-ap-northeast-2.pooler.supabase.com';
type Environment = Record<string, string | undefined>;
function invalid(): never { throw new Error('account-db-configuration-invalid'); }
function integer(value: string | undefined, fallback: number, min: number, max: number) {
  if (value === undefined) return fallback;
  if (!/^\d+$/.test(value)) return invalid();
  const number = Number(value);
  if (!Number.isSafeInteger(number) || number < min || number > max) return invalid();
  return number;
}

/** Explicit fields only: no DATABASE_URL, PG* fallback or client-visible configuration. */
export function accountPoolConfig(env: Environment): PoolConfig {
  const host = env.ONESTEP_DB_HOST, user = env.ONESTEP_DB_USER;
  const password = env.ONESTEP_DB_PASSWORD, ca = env.ONESTEP_DB_CA_PEM;
  if (host !== HOST || env.ONESTEP_DB_DATABASE !== 'postgres' || env.ONESTEP_DB_PORT !== '6543'
    || user !== 'onestep_app_login_v1.yhzgucbiwvizjxpzwpqg'
    || !password || /^(sbp_|sb_secret_|sb_publishable_|eyJ)/.test(password)
    || !ca || !ca.includes('-----BEGIN CERTIFICATE-----')
    || env.NODE_TLS_REJECT_UNAUTHORIZED === '0') return invalid();
  try { createSecureContext({ ca }); } catch { return invalid(); }
  return {
    host, port: 6543, database: 'postgres', user, password,
    ssl: { ca, rejectUnauthorized: true, minVersion: 'TLSv1.2', servername: host,
      checkServerIdentity: (_hostname, certificate) => checkServerIdentity(host, certificate) },
    max: integer(env.ONESTEP_DB_POOL_MAX, 1, 1, 4),
    connectionTimeoutMillis: integer(env.ONESTEP_DB_CONNECT_TIMEOUT_MS, 5000, 100, 15000),
    idleTimeoutMillis: integer(env.ONESTEP_DB_IDLE_TIMEOUT_MS, 10000, 1000, 60000),
    // Driver deadline exceeds the executor's 8s statement timeout. A driver timeout
    // has no SQLSTATE, so the adapter destroys the connection instead of reusing it.
    query_timeout: integer(env.ONESTEP_DB_QUERY_TIMEOUT_MS, 12000, 10000, 30000),
    keepAlive: true,
    application_name: 'onestep-account-commit',
  };
}

type DriverPool = Pick<Pool, 'connect' | 'end' | 'on'>;

/** Internal driver seam. No pool/credentials are created at module import time. */
export function adaptCommitPool(driver: DriverPool): CommitPool & { close(): Promise<void> } {
  // pg removes idle clients on error. A listener prevents an unhandled EventEmitter error;
  // raw driver errors must never be logged because they can contain sensitive connection data.
  driver.on('error', () => {});
  return {
    async connect() {
      let client: PoolClient;
      try { client = await driver.connect(); } catch (error) { throw safeDbError(error, 'connect'); }
      let released = false, broken = false;
      const onError = () => { broken = true; };
      client.on('error', onError);
      return {
        async query(sql: string, values?: unknown[]) {
          if (released || broken) throw new Error('account-db-connection-unavailable');
          try { return await client.query(sql, values); }
          catch (error) {
            const sanitized = safeDbError(error, 'query');
            // SQL errors can be rolled back. Transport/protocol errors cannot be trusted.
            if (!('code' in sanitized) || String(sanitized.code).startsWith('08')
              || ['57P01', '57P02', '57P03'].includes(String(sanitized.code))) broken = true;
            throw sanitized;
          }
        },
        release(destroy = false) {
          if (released) return;
          released = true;
          client.removeListener('error', onError);
          client.release(destroy || broken);
        },
      };
    },
    async close() { try { await driver.end(); } catch (error) { throw safeDbError(error, 'close'); } },
  };
}

let singleton: ReturnType<typeof adaptCommitPool> | undefined;
/** Explicit future bootstrap only. Existing routes/gates deliberately do not call this. */
export function getAccountCommitPool() {
  if (typeof window !== 'undefined') throw new Error('server-only');
  if (!singleton) {
    let config: PoolConfig;
    try { config = accountPoolConfig(process.env); }
    catch (error) { throw safeDbError(error, 'pool-configuration'); }
    try { singleton = adaptCommitPool(new Pool(config)); }
    catch (error) { throw safeDbError(error, 'pool-construction'); }
  }
  return singleton;
}

/** Drain only after in-flight requests finish; not on each request. */
export async function closeAccountCommitPool() {
  const pool = singleton;
  singleton = undefined;
  await pool?.close();
}
