import { createHmac } from 'node:crypto';
import { createClient } from '@supabase/supabase-js';
import { z } from 'zod';
import { getSupabaseConfig } from '../../../lib/supabase/client';
import { requestUser, privateJson, smallJson } from '../../../lib/request';
import { INSTALL_CONSENT_VERSION } from '../../install-phone';

export const runtime = 'nodejs';
const input = z.object({
  phone: z.string().regex(/^\+8210[0-9]{8}$/),
  consent: z.literal(true),
  version: z.literal(INSTALL_CONSENT_VERSION),
}).strict();

export async function POST(request: Request) {
  const parsed = input.safeParse(await smallJson(request, 1024));
  if (!parsed.success) return privateJson({ status: 'invalid' }, 400);
  const user = await requestUser(request);
  const age = Date.now() - Date.parse(user?.created_at ?? '');
  if (!user?.email_confirmed_at || !Number.isFinite(age) || age < -60_000 || age > 7 * 86400_000) return privateJson({ status: 'unverified' }, 403);
  const config = getSupabaseConfig();
  const { SUPABASE_SERVICE_ROLE_KEY: serviceKey, TWILIO_ACCOUNT_SID: account, TWILIO_AUTH_TOKEN: secret,
    TWILIO_MESSAGING_SERVICE_SID: sender, INSTALL_SMS_PEPPER: pepper, GARDEN_PUBLIC_URL: publicUrl } = process.env;
  let installUrl: URL | undefined;
  try { if (publicUrl) installUrl = new URL('/install', publicUrl); } catch {}
  if (!config.ok || !serviceKey || !account?.match(/^AC[0-9a-f]{32}$/i) || !secret || !sender?.match(/^MG[0-9a-f]{32}$/i)
      || !pepper || pepper.length < 32 || !installUrl || installUrl.protocol !== 'https:') return privateJson({ status: 'unavailable' }, 503);

  const service = createClient(config.url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });
  const phone = parsed.data.phone;
  const hash = createHmac('sha256', pepper).update(phone).digest('hex');
  const { data: claim, error } = await service.rpc('onestep_install_claim', { p_owner: user.id, p_hash: hash, p_consent_version: parsed.data.version });
  if (error) return privateJson({ status: 'unavailable' }, 503);
  if (claim !== 'claimed') return privateJson({ status: claim });
  let status: 'accepted' | 'failed' = 'failed';
  try {
    const response = await fetch('https://api.twilio.com/2010-04-01/Accounts/' + account + '/Messages.json', {
      method: 'POST',
      headers: { Authorization: 'Basic ' + Buffer.from(account + ':' + secret).toString('base64') },
      body: new URLSearchParams({ To: phone, MessagingServiceSid: sender, Body: '오늘의 정원 설치 안내 ' + installUrl.href }),
      signal: AbortSignal.timeout(8000),
    });
    if (response.ok) {
      const payload = await response.json() as { sid?: string; status?: string };
      if (payload.sid && !['failed', 'undelivered', 'canceled'].includes(payload.status ?? '')) status = 'accepted';
    }
  } catch { /* An uncertain submission keeps the one-time claim to avoid sending twice. */ }
  await service.rpc('onestep_install_result', { p_owner: user.id, p_status: status });
  return privateJson({ status });
}
