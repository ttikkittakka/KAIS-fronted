import { createClient } from '@supabase/supabase-js';
import { getSupabaseConfig } from '../supabase/client';
import { ACCOUNT_PROJECT } from '../account-garden/model';
export const reply = (status: number, body: object) => Response.json(body, {
  status, headers: { 'Cache-Control': 'private, no-store', Vary: 'Authorization' },
});
export async function authenticateAccount(request: Request) {
  const token = request.headers.get('authorization')?.match(/^Bearer ([^\s]+)$/i)?.[1];
  if (!token) return reply(401, { error: 'authentication-required' });
  const config = getSupabaseConfig();
  if (!config.ok || config.url !== `https://${ACCOUNT_PROJECT}.supabase.co`) return reply(503, { error: 'configuration-unavailable' });
  const client = createClient(config.url, config.publishableKey, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    global: {
      headers: { Authorization: `Bearer ${token}` },
      fetch: (input, init) => fetch(input, { ...init, cache: 'no-store', redirect: 'error',
        signal: AbortSignal.any([request.signal, AbortSignal.timeout(15000)]) }),
    },
  });
  const { data, error } = await client.auth.getUser(token);
  if (error || !data.user) return reply(error && (error.status === 0 || (error.status ?? 0) >= 500) ? 503 : 401, { error: 'authentication-failed' });
  // Decode only after Auth has verified this exact token. Pin issuer and identity.
  let claims;
  try { claims = JSON.parse(Buffer.from(token.split('.')[1], 'base64url').toString()); }
  catch { return reply(401, { error: 'authentication-failed' }); }
  const userId = data.user.id;
  if (claims.iss !== `${config.url}/auth/v1` || claims.sub !== userId || claims.role !== 'authenticated' ||
      !Number.isFinite(claims.exp) || claims.exp * 1000 <= Date.now()) return reply(401, { error: 'authentication-failed' });
  return { client, userId, expiresAt: claims.exp * 1000 };
}
