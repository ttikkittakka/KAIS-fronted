import { getSupabaseClient } from '../../../../lib/supabase/client';

export const runtime = 'nodejs';

/** Explicit development probe: no table access, user login, or storage mutations. */
export async function GET() {
  const reply = (status: number, result: object) => Response.json(result, {
    status, headers: { 'Cache-Control': 'no-store' },
  });
  if (process.env.NODE_ENV !== 'development') return reply(404, { ok: false });

  const result = getSupabaseClient();
  if (!result.ok) return reply(503, { ok: false, reason: result.reason });

  try {
    // Public Auth settings check connectivity/key acceptance without requiring tables.
    const response = await fetch(new URL('/auth/v1/settings', result.url), {
      method: 'GET',
      headers: { apikey: result.publishableKey },
      cache: 'no-store',
      credentials: 'omit',
      redirect: 'error',
      signal: AbortSignal.timeout(8000),
    });
    if (!response.ok) {
      await response.body?.cancel();
      return reply(502, { ok: false, reason: 'upstream-error', upstreamStatus: response.status });
    }
    const settings: unknown = await response.json();
    if (!settings || typeof settings !== 'object' || !('external' in settings)) {
      return reply(502, { ok: false, reason: 'unexpected-response' });
    }
    return reply(200, { ok: true, clientInitialized: true, authReachable: true });
  } catch {
    return reply(502, { ok: false, reason: 'connection-failed' });
  }
}
