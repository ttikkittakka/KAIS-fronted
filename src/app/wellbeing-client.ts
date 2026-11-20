import { getAuthClient } from '../lib/supabase/auth-client';
import { dataScope } from './app-storage';

export async function wellbeingResponse<T>(payload: object, optIn: boolean, signal: AbortSignal): Promise<T> {
  const ai = optIn && dataScope() === 'account';
  const session = ai ? await getAuthClient()?.auth.getSession() : undefined;
  const token = session?.data.session?.access_token;
  const response = await fetch('/api/wellbeing', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: 'Bearer ' + token } : {}) },
    body: JSON.stringify({ ...payload, ai: !!token }), cache: 'no-store',
    signal: AbortSignal.any([signal, AbortSignal.timeout(10_000)]),
  });
  if (!response.ok) throw new Error('추천에 연결하지 못했어요.');
  return response.json() as Promise<T>;
}
