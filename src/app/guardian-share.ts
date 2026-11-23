import { getAuthClient } from '../lib/supabase/auth-client';
import { dataScope } from './app-storage';
import type { MoodSnapshot } from './wellbeing';

const TOKEN = /^[a-f0-9]{64}$/;
const hex = (bytes: Uint8Array) => Array.from(bytes, value => value.toString(16).padStart(2, '0')).join('');

export type GuardianShare = { entries: MoodSnapshot[]; expiresAt: string; updatedAt: string };
export const guardianTokenValid = (token: string) => TOKEN.test(token);
export const guardianAvailable = () => dataScope() === 'account' && !!getAuthClient() && !!globalThis.isSecureContext;

export async function startGuardianShare(entries: MoodSnapshot[]) {
  const client = getAuthClient();
  if (!client || !guardianAvailable()) throw new Error('로그인한 계정과 안전한 연결이 필요해요.');
  const token = hex(crypto.getRandomValues(new Uint8Array(32)));
  const result = await client.rpc('onestep_guardian_create', { p_token: token, p_entries: entries });
  if (result.error || typeof result.data !== 'string') throw new Error('공유를 열지 못했어요. 계정 연결과 공유 설정을 확인해 주세요.');
  const link = new URL('/guardian', window.location.origin);
  link.hash = token;
  return { url: link.href, expiresAt: result.data };
}

export async function guardianStatus() {
  const client = getAuthClient();
  if (!client || !guardianAvailable()) return null;
  const { data, error } = await client.rpc('onestep_guardian_status');
  if (error?.code === 'PGRST202' || error?.code === '42883') return null;
  if (error) throw new Error('공유 상태를 불러오지 못했어요.');
  return typeof data === 'string' ? data : null;
}

export async function syncGuardianShare(entries: MoodSnapshot[]) {
  const client = getAuthClient();
  if (!client || !guardianAvailable()) return;
  const { error } = await client.rpc('onestep_guardian_sync', { p_entries: entries });
  if (error) throw new Error('공유 정보를 갱신하지 못했어요.');
}

export async function revokeGuardianShare() {
  const client = getAuthClient();
  if (!client || !guardianAvailable()) return;
  const { error } = await client.rpc('onestep_guardian_revoke');
  if (error) throw new Error('공유를 중단하지 못했어요. 연결을 확인하고 다시 시도해 주세요.');
}

export async function readGuardianShare(token: string): Promise<GuardianShare | null> {
  if (!guardianTokenValid(token) || !globalThis.isSecureContext) throw new Error('링크를 확인하거나 HTTPS에서 열어 주세요.');
  const client = getAuthClient();
  if (!client) throw new Error('보호자 공유 서버가 연결되면 이 링크를 열 수 있어요.');
  const { data, error } = await client.rpc('onestep_guardian_get', { p_token: token });
  if (error) throw new Error('공유 정보를 불러오지 못했어요. 연결을 확인해 주세요.');
  if (!data || !Array.isArray(data.entries) || typeof data.expiresAt !== 'string' || typeof data.updatedAt !== 'string') return null;
  return { ...data, entries: [...data.entries].sort((a, b) => a.date.localeCompare(b.date)) };
}
