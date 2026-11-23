import { test, expect } from '@playwright/test';
import { readFileSync } from 'node:fs';

// 실제 계정·PIN·환경 파일을 읽지 않는 독립 브라우저 검증입니다.
const project = 'yhzgucbiwvizjxpzwpqg';
const userId = '00000000-0000-4000-8000-000000000001';
const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Seoul' }).format(new Date());
const garden = {
  project, userId, today,
  profile: { user_id: userId, display_name: '가상 개발자', timezone: 'Asia/Seoul' },
  garden: { user_id: userId, main_character: 'sprout', sunshine_balance: 37, active_days: 0, growth_stage: 0, layout_revision: 0 },
  inventory: [{ user_id: userId, item_id: 'default-sky', source: 'default', acquired_at: new Date().toISOString() }],
  placements: [{ user_id: userId, slot_id: 'background', item_id: 'default-sky' }], growthGrants: [], todayRecord: null,
};

for (const signedIn of [false, true]) test(`기존 개발자 모드 복구 · ${signedIn ? '가상 로그인' : '로그아웃'}`, async ({ browser }, info) => {
  const context = await browser.newContext({ viewport: info.project.use.viewport, serviceWorkers: 'block' });
  const prohibited = []; let unlocks = 0;
  await context.addInitScript(({ signedIn, project, userId }) => {
    localStorage.setItem('developer-qa-preserve', '보존할 가상 데이터');
    if (signedIn) localStorage.setItem(`sb-${project}-auth-token`, JSON.stringify({
      access_token: 'synthetic-token-not-valid', refresh_token: 'synthetic-refresh-not-valid',
      expires_at: Math.floor(Date.now() / 1000) + 86400, token_type: 'bearer',
      user: { id: userId, email: 'fixture@example.test', aud: 'authenticated', role: 'authenticated' },
    }));
  }, { signedIn, project, userId });
  await context.route('**/*', async route => {
    const request = route.request(), url = new URL(request.url());
    const json = body => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(body) });
    if (url.pathname === '/api/developer/unlock') {
      unlocks++;
      return route.fulfill({ status: request.postDataJSON().password === '0000' ? 200 : 401, contentType: 'application/json', body: JSON.stringify({ ok: request.postDataJSON().password === '0000' }) });
    }
    if (url.pathname.startsWith('/api/account/') && request.method() === 'GET') {
      if (url.pathname === '/api/account/garden') return json(garden);
      if (url.pathname === '/api/account/records') return json({ project, userId, today, date: today, sunshineBalance: 37, record: null, cares: [], rewards: [] });
      return json({ enabled: false });
    }
    if (url.hostname === 'unpkg.com' && url.pathname.endsWith('.wasm')) return route.fulfill({ contentType: 'application/wasm', body: readFileSync('node_modules/@rive-app/canvas/rive.wasm') });
    if (url.hostname === 'localhost' && url.pathname === '/__nextjs_original-stack-frames') return route.continue();
    if (url.hostname !== 'localhost' || url.pathname.startsWith('/api/') || !['GET', 'HEAD'].includes(request.method())) {
      prohibited.push(url.pathname); return route.abort();
    }
    return route.continue();
  });
  try {
    const page = await context.newPage();
    await page.goto('/');
    if (signedIn) {
      await page.getByRole('button', { name: '설정', exact: true }).click();
      await page.getByRole('button', { name: /개발자 테스트/ }).click();
    } else await page.getByRole('button', { name: '개발용 정원 테스트' }).click();
    await page.getByLabel('개발용 PIN').fill('1111');
    await page.getByRole('button', { name: signedIn ? '개발자 모드 열기' : '테스트 정원 열기' }).click();
    await expect(page.locator('.auth-error[role="alert"]')).toBeVisible();
    await expect(page.getByText('개발용 로컬 정원', { exact: false })).toHaveCount(0);
    await page.getByLabel('개발용 PIN').fill('0000');
    await page.getByRole('button', { name: signedIn ? '개발자 모드 열기' : '테스트 정원 열기' }).click();
    await expect(page.locator('.auth-dev-banner')).toBeVisible();
    await page.getByRole('button', { name: /시작하기/ }).click();
    await expect(page.getByRole('heading', { name: '오늘의 정원', exact: true })).toBeVisible();
    await page.getByRole('button', { name: '설정', exact: true }).click();
    await page.getByRole('button', { name: /개발자 테스트/ }).click();
    await page.getByRole('button', { name: '+100 햇살', exact: true }).click();
    await page.getByRole('button', { name: '+1,000 햇살', exact: true }).click();
    const sandbox = await page.evaluate(() => JSON.parse(localStorage.getItem('little-garden.sandbox.test.v1')));
    const controls = JSON.parse(sandbox.values['little-garden.developer-controls.v1']);
    expect(controls.transactions.reduce((sum, t) => sum + t.delta, 0)).toBe(1100);
    await page.screenshot({ path: info.outputPath(`developer-${signedIn}.png`), fullPage: true });
    await page.getByRole('button', { name: '상점 열기', exact: true }).click();
    await expect(page.getByRole('heading', { name: '작은 정원 상점' })).toBeVisible();
    await page.getByRole('button', { name: '뒤로 가기' }).click();
    await page.getByRole('button', { name: '설정', exact: true }).click();
    await page.getByRole('button', { name: /개발자 테스트/ }).click();
    await page.getByRole('button', { name: '정원 꾸미기', exact: true }).click();
    await expect(page.getByRole('heading', { name: '정원 꾸미기', exact: true })).toBeVisible();
    await page.getByRole('button', { name: '뒤로 가기' }).click();
    await page.getByRole('button', { name: '오늘의 나 기록하기' }).click();
    for (let i = 0; i < 4; i++) {
      await expect(page.locator('.progress-head')).toContainText(`${i + 1} / 4`);
      await page.locator('.choice-list button').first().click();
    }
    await expect(page.getByRole('button', { name: '사진 선택', exact: true })).toBeVisible();
    await page.getByRole('button', { name: '성장하기로 이어가기' }).click();
    await page.locator('textarea').fill('브라우저 검증용 가상 기록이에요.');
    await page.getByRole('button', { name: '오늘의 추천 행동 만나보기' }).click();
    await expect(page.locator('.care-card')).toHaveCount(3);
    await page.getByRole('button', { name: '선택하기', exact: true }).first().click();
    await page.getByRole('button', { name: '해볼게요', exact: true }).click();
    await expect(page.getByRole('timer', { name: '남은 돌봄 시간' })).toBeVisible();
    await page.getByRole('button', { name: '일시정지', exact: true }).click();
    await expect(page.getByRole('button', { name: '이어하기', exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: '돌봄 마쳤어요', exact: true })).toBeVisible();
    await page.screenshot({ path: info.outputPath(`care-${signedIn}.png`), fullPage: true });
    expect(await page.evaluate(() => localStorage.getItem('developer-qa-preserve'))).toBe('보존할 가상 데이터');
    expect(unlocks).toBe(2);
    expect(prohibited).toEqual([]);
    await page.getByRole('button', { name: '테스트 나가기' }).click();
    await expect(page.locator('.auth-dev-banner')).toHaveCount(0);
    if (signedIn) await expect(page.getByRole('button', { name: '설정', exact: true })).toBeVisible();
    else await expect(page.getByRole('button', { name: '로그인', exact: true })).toBeVisible();
  } finally { await context.close(); }
});
