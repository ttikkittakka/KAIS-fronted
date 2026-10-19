import { createClient, type SupabaseClient } from '@supabase/supabase-js';

type ClientResult =
  | { ok: true; client: SupabaseClient; url: string; publishableKey: string }
  | { ok: false; reason: 'missing-config' | 'invalid-config' | 'initialization-failed' };

let cached: Extract<ClientResult, { ok: true }> | undefined;

/** Optional connection only. Does not read or write the app's local data. */
export function getSupabaseConfig(): { ok: true; url: string; publishableKey: string } | Extract<ClientResult, { ok: false }> {
  // Literal property access is required for Next.js browser environment inlining.
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const publishableKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY?.trim();
  if (!url || !publishableKey) return { ok: false, reason: 'missing-config' };

  try {
    const parsed = new URL(url);
    // This connection uses new publishable keys only, never secret/service-role keys.
    if (parsed.protocol !== 'https:' || parsed.username || parsed.password ||
        parsed.search || parsed.hash || (parsed.pathname !== '/' && parsed.pathname !== '') ||
        !/^sb_publishable_[A-Za-z0-9_-]+$/.test(publishableKey)) {
      return { ok: false, reason: 'invalid-config' };
    }
  } catch {
    return { ok: false, reason: 'invalid-config' };
  }

  return { ok: true, url, publishableKey };
}

export function getSupabaseClient(): ClientResult {
  const config = getSupabaseConfig();
  if (!config.ok) return config;
  const { url, publishableKey } = config;
  if (cached?.url === url && cached.publishableKey === publishableKey) return cached;
  try {
    const client = createClient(url, publishableKey, {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
        detectSessionInUrl: false,
      },
    });
    cached = { ok: true, client, url, publishableKey };
    return cached;
  } catch {
    // Never leak SDK errors (which might contain configuration) to the UI/logs.
    return { ok: false, reason: 'initialization-failed' };
  }
}
