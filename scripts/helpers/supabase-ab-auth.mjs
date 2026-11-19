// Shared gate for auth-only preflight and the live test; no DB/Storage access.
export async function verifyTestAccounts({ env, run, projectUrl, createdAfter, makeClient, check, ok }) {
  const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  check(uuid.test(env.ONESTEP_AB_USER_ID_A ?? '') && uuid.test(env.ONESTEP_AB_USER_ID_B ?? '') &&
    env.ONESTEP_AB_USER_ID_A !== env.ONESTEP_AB_USER_ID_B, 'two distinct test UUIDs configured');
  check(env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY?.startsWith('sb_publishable_'), 'publishable key only');
  const entries = [];
  for (const role of ['A', 'B']) {
    const client = makeClient();
    const login = ok(await client.auth.signInWithPassword({
      email: env[`ONESTEP_AB_EMAIL_${role}`], password: env[`ONESTEP_AB_PASSWORD_${role}`],
    }), `${role} normal password login`);
    const token = login?.session?.access_token;
    check(typeof token === 'string' && token.split('.').length === 3, `${role} access token present`);
    const { user } = ok(await client.auth.getUser(token), `${role} server verified Auth identity`);
    check(!!user?.id, `${role} server verified Auth identity`);
    // Decode only AFTER the server has validated this exact token.
    let claims;
    try { claims = JSON.parse(Buffer.from(token.split('.')[1], 'base64url').toString()); } catch {}
    check(claims?.sub === user.id && claims?.iss === `${projectUrl}/auth/v1` &&
      claims?.role === 'authenticated' && claims?.exp * 1000 > Date.now(), `${role} verified JWT matches UUID/project/role/expiry`);
    check(user.id === env[`ONESTEP_AB_USER_ID_${role}`] && user.email === env[`ONESTEP_AB_EMAIL_${role}`] &&
      user.role === 'authenticated', `${role} UUID/email/role match`);
    check(Number.isFinite(Date.parse(user.email_confirmed_at)) && Date.parse(user.email_confirmed_at) <= Date.now(),
      `${role} server email confirmation complete`);
    check(Date.parse(user.created_at) >= createdAfter && Date.parse(user.created_at) <= Date.now(), `${role} newly created account`);
    check(user.user_metadata?.onestep_test_run === run && user.user_metadata?.onestep_test_role === role,
      `${role} explicit dedicated test-account marker`);
    entries.push({ role, client, id: user.id });
  }
  return entries; // Neither identity may reach data operations until BOTH pass.
}
