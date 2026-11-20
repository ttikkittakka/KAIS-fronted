import { getSupabaseClient } from './supabase/client';

export async function smallJson(request: Request, maxBytes = 4096) {
  const reader = request.body?.getReader();
  if (!reader || !request.headers.get('content-type')?.startsWith('application/json')) return null;
  const decoder = new TextDecoder();
  let bytes = 0;
  let json = '';
  try {
    for (;;) {
      const chunk = await reader.read();
      if (chunk.done) return JSON.parse(json + decoder.decode());
      bytes += chunk.value.byteLength;
      if (bytes > maxBytes) { await reader.cancel(); return null; }
      json += decoder.decode(chunk.value, { stream: true });
    }
  } catch { return null; }
  finally { reader.releaseLock(); }
}

export async function requestUser(request: Request) {
  const token = request.headers.get('authorization')?.match(/^Bearer ([\w.\-]+)$/i)?.[1];
  const sdk = getSupabaseClient();
  if (!token || token.length > 8192 || !sdk.ok) return null;
  try {
    const { data, error } = await sdk.client.auth.getUser(token);
    return error ? null : data.user;
  } catch { return null; }
}

export function privateJson(data: unknown, status = 200) {
  return Response.json(data, { status, headers: { 'Cache-Control': 'no-store', 'Referrer-Policy': 'no-referrer' } });
}
