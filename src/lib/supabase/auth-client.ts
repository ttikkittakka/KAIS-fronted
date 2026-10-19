import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { getSupabaseConfig } from './client';

let client: SupabaseClient | null = null;

/** Browser-only SDK session storage; never uses the legacy garden storage keys. */
export function getAuthClient(): SupabaseClient | null {
  if (typeof window === 'undefined') return null;
  if (client) return client;
  const config = getSupabaseConfig();
  if (!config.ok) return null;
  try {
    client = createClient(config.url, config.publishableKey, {
      auth: {
        storageKey: 'little-garden.supabase-auth.v1',
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
        flowType: 'pkce',
      },
    });
    return client;
  } catch { return null; }
}
