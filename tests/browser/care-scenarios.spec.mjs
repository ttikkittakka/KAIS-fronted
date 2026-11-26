import { test, expect } from '@playwright/test';

test('demo scenarios change real IDs, preserve completion on reload and never write to an account', async ({ page, context, baseURL }) => {
  const writes = [];
  await context.route('**/*', route => {
    const request = route.request(), url = new URL(request.url());
    if (request.method() !== 'GET') { writes.push(url.pathname); return route.abort(); }
    return url.origin === new URL(baseURL).origin ? route.continue() : route.abort();
  });
  await page.addInitScript(() => localStorage.setItem('care-test-sentinel', 'untouched'));
  const snapshots = [];
  const current = () => page.evaluate(() => {
    const scope = JSON.parse(sessionStorage.getItem('little-garden.demo-session.v1'));
    return JSON.parse(scope['little-garden.daily-checkin.v1']);
  });
  await page.goto('/demo');
  for (const label of ['기본 상태', '에너지 낮음', '많이 지친 날', '신난 상태']) {
    await page.getByText('상태별 추천 체험', { exact: true }).click();
    await page.getByRole('button', { name: label, exact: true }).click();
    await page.getByRole('button', { name: '이 상태로 돌봄 체험', exact: true }).click();
    await expect(page.locator('.care-card')).toHaveCount(3);
    const before = await current();
    snapshots.push(before.careRecommendations[0].ids.slice().sort().join(','));
    await page.reload();
    await expect(page.locator('.care-card')).toHaveCount(3);
    expect((await current()).careRecommendations).toEqual(before.careRecommendations);
  }
  expect(new Set(snapshots).size).toBe(4);
  for (let i = 0; i < 3; i++) {
    await page.locator('.care-card').nth(i).getByRole('button').click();
    await page.getByRole('button', { name: '시작하기', exact: true }).click();
    await page.getByRole('button', { name: '돌봄 마쳤어요', exact: true }).dblclick();
    await expect(page.locator('.completion-status')).toHaveText(`오늘 ${i + 1}/3 완료`);
    await page.reload();
    await expect(page.locator('.care-card-done')).toHaveCount(i + 1);
  }
  const completed = await current();
  await page.goto('/demo' + new URL(page.url()).search + '#care');
  await expect(page.locator('.care-card-done')).toHaveCount(3);
  expect((await current()).sunshine).toEqual(completed.sunshine);
  expect(writes).toEqual([]);
  expect(await page.evaluate(() => localStorage.getItem('care-test-sentinel'))).toBe('untouched');
});
