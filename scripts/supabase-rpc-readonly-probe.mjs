// Opt-in, read-only HTTP probe. Never invokes an RPC or reads application rows.
// Credentials are supplied through process environment, not .env auto-loading.
const expected = [
  'onestep_ensure_garden', 'onestep_start_day', 'onestep_save_writing',
  'onestep_buy_item', 'onestep_save_layout', 'onestep_reserve_photo',
  'onestep_attach_photo', 'onestep_retire_photo',
];

async function main() {
  if (!process.argv.includes('--run')) {
    console.log('No network requests made. To run, supply ONESTEP_TEST_URL, ONESTEP_TEST_PUBLISHABLE_KEY, ONESTEP_TEST_ACCESS_TOKEN, ONESTEP_TEST_USER_ID in the process environment, then use --run. Never paste tokens into chat or commit them.');
    return;
  }
  const env = process.env;
  const url = new URL(env.ONESTEP_TEST_URL ?? '');
  if (url.protocol !== 'https:' || url.username || url.password || url.pathname !== '/' || url.search || url.hash) {
    throw new Error('Use the HTTPS project root URL.');
  }
  const key = env.ONESTEP_TEST_PUBLISHABLE_KEY ?? '';
  const token = env.ONESTEP_TEST_ACCESS_TOKEN ?? '';
  const userId = env.ONESTEP_TEST_USER_ID ?? '';
  if (!key.startsWith('sb_publishable_') || token.split('.').length !== 3 || !/^[0-9a-f-]{36}$/i.test(userId)) {
    throw new Error('Supply a publishable key, a test-user access token and the expected test-user UUID. No secret/service-role key.');
  }
  const headers = { apikey: key, Authorization: `Bearer ${token}` };
  const auth = await fetch(new URL('/auth/v1/user', url), {
    method: 'GET', headers, redirect: 'error', signal: AbortSignal.timeout(15000),
  });
  if (!auth.ok) throw new Error(`Auth identity check failed (HTTP ${auth.status}). No RPC checks performed.`);
  const user = await auth.json();
  if (user.id !== userId || user.role !== 'authenticated') throw new Error('Verified test-user ID/role mismatch. Stopped.');
  const response = await fetch(new URL('/rest/v1/', url), {
    method: 'GET', headers: { ...headers, Accept: 'application/openapi+json', 'Accept-Profile': 'public' },
    redirect: 'error', signal: AbortSignal.timeout(15000),
  });
  if (!response.ok) {
    let code;
    try { code = (await response.json()).code; } catch { /* Do not print response bodies or credentials. */ }
    console.log(JSON.stringify({ result: 'INCONCLUSIVE', httpStatus: response.status,
      code: typeof code === 'string' && /^[A-Z0-9_]+$/.test(code) ? code : undefined,
      note: 'Check Data API enabled state, profile, JWT and schema cache. No function was invoked.' }, null, 2));
    process.exitCode = 2;
    return;
  }
  const spec = await response.json();
  if (!spec.paths || typeof spec.paths !== 'object') throw new Error('OpenAPI paths unavailable; reachability remains unverified.');
  const routes = Object.keys(spec.paths).filter(p => p.startsWith('/rpc/onestep_')).sort();
  const missing = expected.filter(name => !routes.includes(`/rpc/${name}`));
  const serverRoutes = routes.filter(p => ['/rpc/onestep_commit_reflection', '/rpc/onestep_commit_activity'].includes(p));
  console.log(JSON.stringify({
    result: serverRoutes.length ? 'REVIEW_SERVER_ROUTES' : missing.length ? 'INCONCLUSIVE_MISSING_ROUTES' : 'USER_ROUTES_LISTED',
    routes, missingExpectedUserRoutes: missing, unexpectedServerRoutes: serverRoutes,
    note: 'OpenAPI visibility is evidence only, not proof of RPC execution or RLS isolation. No function or application table was queried.',
  }, null, 2));
  if (missing.length || serverRoutes.length) process.exitCode = 2;
}

main().catch(error => {
  // Never print upstream bodies, headers, access tokens or stack traces.
  const safeMessages = ['Use the HTTPS', 'Supply a publishable', 'Auth identity', 'Verified test-user', 'OpenAPI paths'];
  console.error(safeMessages.some(prefix => error.message.startsWith(prefix)) ? error.message : 'Probe failed; check environment, network and project settings. Credentials were not printed.');
  process.exitCode = 1;
});
