import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import nextEnv from '@next/env';
import { createClient } from '@supabase/supabase-js';
import { expect } from '@playwright/test';

nextEnv.loadEnvConfig(process.cwd(), true, { info() {}, error() {} });
export const baseURL = 'http://localhost:3000';
const sessions = new Map();
export async function account(role, fresh = false) {
  if (!fresh && sessions.has(role)) return sessions.get(role);
  if (!['A', 'B'].includes(role)) throw Error('Unknown approved test role');
  const files = fs.readdirSync('.').filter(n => n.startsWith('.env.onestep-ab-') && n.endsWith('-run.local'));
  if (files.length !== 1) throw Error('Exactly one existing A/B credential file required');
  const source = fs.readFileSync(files[0], 'utf8');
  const get = key => source.match(new RegExp('^' + key + '=(.*)$', 'm'))?.[1].trim().replace(/^['"]|['"]$/g, '');
  const owner = get('ONESTEP_AB_USER_ID_' + role);
  if (!(process.env.ONESTEP_DRAFT_TEST_USER_IDS ?? '').split(',').map(s=>s.trim()).includes(owner)) throw Error('Test account is not on the existing allowlist');
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const client = createClient(url, process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
  const result = await client.auth.signInWithPassword({ email: get('ONESTEP_AB_EMAIL_' + role), password: get('ONESTEP_AB_PASSWORD_' + role) });
  if (result.error || result.data.user?.id !== owner || !result.data.session) throw Error('Approved test account authentication failed (details suppressed)');
  const value = { role, owner, session: result.data.session, storageKey: 'sb-' + new URL(url).hostname.split('.')[0] + '-auth-token' };
  sessions.set(role, value);
  return value;
}
export async function readAccount(auth, endpoint = '/api/account/records') {
  const response = await fetch(baseURL + endpoint, { headers: { Authorization: 'Bearer ' + auth.session.access_token }, signal: AbortSignal.timeout(20000) });
  if (!response.ok) throw Error('Read-only account query failed: HTTP ' + response.status);
  return response.json();
}
export const fingerprint = value => createHash('sha256').update(JSON.stringify(value)).digest('hex');
export async function installSession(context, auth) {
  await context.addInitScript(({ key, session, origin }) => {
    if (location.origin === origin && !sessionStorage.getItem('browser-test-session-installed')) {
      localStorage.setItem(key, JSON.stringify(session));
      sessionStorage.setItem('browser-test-session-installed', '1');
    }
  }, { key: auth.storageKey, session: auth.session, origin: baseURL });
}
/** Default-deny writes before navigation. Fixtures may fulfill locally, never forward a mutation. */
export async function guard(context, fixture) {
  const audit = { blockedWrites: [], blockedDiagnostics: 0, blockedAssetHosts: [], consoleCategories: [], fixtureWrites: [], readErrors: [], pageErrors: 0 };
  await context.route('**/*', async route => {
    const request = route.request(), url = new URL(request.url()), method = request.method();
    if (url.origin === baseURL && url.pathname === '/__nextjs_original-stack-frames') { audit.blockedDiagnostics++; return route.abort('blockedbyclient'); }
    if (fixture && url.origin === baseURL && url.pathname.startsWith('/api/account/')) {
      const reply = await fixture(url, method, request);
      if (reply) { if (!['GET','HEAD','OPTIONS'].includes(method)) audit.fixtureWrites.push(url.pathname); return route.fulfill(reply); }
    }
    if (!['GET', 'HEAD', 'OPTIONS'].includes(method)) { audit.blockedWrites.push(url.origin === baseURL ? url.pathname : 'external-mutation'); return route.abort('blockedbyclient'); }
    if (url.origin === baseURL || (url.protocol === 'https:' && url.hostname.endsWith('.supabase.co')) || url.hostname === 'unpkg.com') return route.continue();
    if (!audit.blockedAssetHosts.includes(url.hostname)) audit.blockedAssetHosts.push(url.hostname);
    return route.abort('blockedbyclient');
  });
  context.on('page', page => {
    page.on('console', message => { if (message.type() !== 'error') return; const text=message.text(); const category=/Failed to load resource/.test(text)?'resource-load':/Cannot update a component/.test(text)?'react-render-update':/unique.*key/i.test(text)?'react-key':/Rive|wasm/i.test(text)?'rive-resource':/hydration|hydrated/i.test(text)?'hydration':'other-console-error'; if(!audit.consoleCategories.includes(category))audit.consoleCategories.push(category); });
    page.on('pageerror', () => { audit.pageErrors++; });
    page.on('response', response => { const u = new URL(response.url()); if (u.origin === baseURL && u.pathname.startsWith('/api/account/') && response.status() >= 400) audit.readErrors.push({ path: u.pathname, status: response.status() }); });
  });
  return audit;
}
export async function capture(page, info, name, privateData = true) {
  await page.evaluate(() => document.fonts.ready);
  await page.evaluate(async () => {
    const finite = document.getAnimations().filter(a => a.effect?.getComputedTiming().iterations !== Infinity);
    await Promise.all(finite.map(a => a.finished.catch(() => {})));
  });
  const sensitive = page.locator(privateData ? 'input, textarea, .auth-account, .saved-text, .record-photo, .answer-summary, .mood-chip, .choice-list button.selected, .profile-name' : 'input[type=password], input[type=email], .auth-account');
  const file = info.outputPath(name + '.png');
  await page.screenshot({ path: file, fullPage: true, mask: [sensitive], maskColor: '#d8dfd5' });
  const layout = await page.evaluate(() => ({
    viewport: { width: innerWidth, height: innerHeight },
    horizontalOverflow: document.documentElement.scrollWidth > innerWidth + 1,
    frameHorizontalOverflow: [...document.querySelectorAll('.phone-frame')].some(el=>el.scrollWidth>el.clientWidth+1),
    view: document.querySelector('[data-account-view]')?.getAttribute('data-account-view') ?? 'login',
    riveReady: document.querySelectorAll('.rive-plant--ready').length,
    homeButtonOverlapsNavigation: (() => { const c=document.querySelector('.home-cta')?.getBoundingClientRect(),n=document.querySelector('.bottom-nav')?.getBoundingClientRect(); return !!c && !!n && c.top < n.bottom && c.bottom > n.top; })(),
  }));
  expect(layout.horizontalOverflow, 'page horizontal overflow').toBe(false);
  expect(layout.frameHorizontalOverflow, 'phone frame horizontal overflow').toBe(false);
  fs.writeFileSync(info.outputPath(name + '.json'), JSON.stringify(layout, null, 2));
  return layout;
}
export async function ready(page) {
  await expect(page.locator('.home-cta')).toBeVisible();
}
export function writeAudit(info, audit, extra = {}) {
  fs.writeFileSync(info.outputPath('audit.json'), JSON.stringify({ ...audit, ...extra }, null, 2));
}
export const samplePhoto = path.resolve('public/plant.png.png');
