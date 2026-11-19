import 'server-only';

const nodeCodes = new Set(['ECONNREFUSED', 'ECONNRESET', 'ETIMEDOUT', 'ENOTFOUND', 'EAI_AGAIN',
  'ENETUNREACH', 'EHOSTUNREACH', 'EPIPE', 'ERR_TLS_CERT_ALTNAME_INVALID', 'CERT_HAS_EXPIRED',
  'DEPTH_ZERO_SELF_SIGNED_CERT', 'SELF_SIGNED_CERT_IN_CHAIN', 'UNABLE_TO_VERIFY_LEAF_SIGNATURE',
  'UNABLE_TO_GET_ISSUER_CERT_LOCALLY', 'ERR_SSL_WRONG_VERSION_NUMBER', 'ABORT_ERR']);
export const sqlState = (code: unknown): string | undefined => typeof code === 'string' &&
  /^(?:(?:[0-9][0-9A-Z]|P0|XX|F0|HV)[0-9A-Z]{3}|PT[0-9]{3})$/.test(code) ? code : undefined;
export type DbStage = 'pool-configuration' | 'pool-construction' | 'connect' | 'begin' | 'role' |
  'timeouts' | 'claims' | 'rpc' | 'acknowledgement' | 'commit' | 'query' | 'close';
type ErrorClass = { sqlstate?: string; nodeCode?: string; timeout?: 'connection' | 'query' | 'statement' | 'lock' | 'abort'; category?: 'configuration' };
/** Values only from fixed allowlists. Never retain messages, query/parameters, stack or raw causes. */
export function classifyDbError(error: unknown): ErrorClass[] {
  const result: ErrorClass[] = [], seen = new Set<unknown>();
  let cursor = error;
  for (let depth = 0; depth < 5 && cursor && typeof cursor === 'object' && !seen.has(cursor); depth++) {
    seen.add(cursor);
    const value = cursor as { code?: unknown; message?: unknown; name?: unknown; cause?: unknown; diagnostic?: { chain?: ErrorClass[] } };
    if (value.diagnostic?.chain) {
      // Reclassify bounded sanitized causes, rather than accepting arbitrary diagnostic fields.
      for (const entry of value.diagnostic.chain.slice(0, 5 - result.length)) {
        const item: ErrorClass = {};
        if (sqlState(entry.sqlstate)) item.sqlstate = entry.sqlstate;
        if (entry.nodeCode && nodeCodes.has(entry.nodeCode)) item.nodeCode = entry.nodeCode;
        if (['connection','query','statement','lock','abort'].includes(entry.timeout ?? '')) item.timeout = entry.timeout;
        if (entry.category === 'configuration') item.category = 'configuration';
        result.push(item);
      }
      break;
    }
    const item: ErrorClass = {};
    const state = sqlState(value.code); if (state) item.sqlstate = state;
    if (typeof value.code === 'string' && nodeCodes.has(value.code)) item.nodeCode = value.code;
    if (value.message === 'account-db-configuration-invalid') item.category = 'configuration';
    if (['Connection terminated due to connection timeout', 'timeout exceeded when trying to connect'].includes(String(value.message))) item.timeout = 'connection';
    if (value.message === 'Query read timeout') item.timeout = 'query';
    if (state === '57014' && value.message === 'canceling statement due to statement timeout') item.timeout = 'statement';
    if (state === '55P03' && value.message === 'canceling statement due to lock timeout') item.timeout = 'lock';
    if (value.name === 'AbortError' || value.name === 'TimeoutError') item.timeout = 'abort';
    result.push(item); cursor = value.cause;
  }
  return result;
}
export function safeDbError(error: unknown, stage: DbStage, transactionBegan = false) {
  const chain = classifyDbError(error);
  const code = sqlState((error as { code?: unknown } | null)?.code);
  return Object.assign(new Error('account-db-operation-failed'), code ? { code } : {}, {
    diagnostic: { stage, transactionBegan, chain },
  });
}
