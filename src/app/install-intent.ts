import { getAuthClient } from '../lib/supabase/auth-client';
import { INSTALL_CONSENT_VERSION, INSTALL_INTENT_KEY, koreanMobile } from './install-phone';

const PENDING_MS = 7 * 86400_000;
type Intent = { email: string; phone: string; until: number };
const normalizeEmail = (email: string) => email.trim().toLowerCase();

export function saveInstallIntent(email: string, phone: string | null) {
  if (!phone) { sessionStorage.removeItem(INSTALL_INTENT_KEY); return; }
  sessionStorage.setItem(INSTALL_INTENT_KEY, JSON.stringify({ email: normalizeEmail(email), phone, until: Date.now() + PENDING_MS }));
}

export function installIntent(email: string): Intent | null {
  try {
    const value = JSON.parse(sessionStorage.getItem(INSTALL_INTENT_KEY) ?? 'null') as Intent | null;
    if (!value || value.until <= Date.now()) { sessionStorage.removeItem(INSTALL_INTENT_KEY); return null; }
    return value.email === normalizeEmail(email) && koreanMobile(value.phone) === value.phone ? value : null;
  } catch { return null; }
}

export async function sendInstallIntent(email: string, signal: AbortSignal) {
  const intent = installIntent(email);
  if (!intent) return null;
  const client = getAuthClient();
  const { data } = client ? await client.auth.getSession() : { data: null };
  const session = data?.session;
  if (signal.aborted || !session || normalizeEmail(session.user.email ?? '') !== intent.email) return null;
  const response = await fetch('/api/install-sms', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + session.access_token },
    body: JSON.stringify({ phone: intent.phone, consent: true, version: INSTALL_CONSENT_VERSION }),
    cache: 'no-store', signal,
  });
  const result = await response.json() as { status?: string };
  if (response.ok || result.status === 'invalid') sessionStorage.removeItem(INSTALL_INTENT_KEY);
  if (result.status === 'accepted') return '설치 안내 문자를 접수했어요.';
  if (result.status === 'sending') return '설치 안내 문자를 처리하고 있어요.';
  if (result.status === 'duplicate') return '이미 이 번호로 설치 안내를 요청했어요.';
  return '문자 안내를 확인하지 못했어요. 설치 페이지에서 바로 열 수 있어요.';
}
