import { test, expect } from '@playwright/test';
import { account, readAccount, fingerprint, installSession, guard, capture, ready, writeAudit, baseURL } from './support.mjs';

for (const role of ['A', 'B']) test(`live ${role}: existing account read-only navigation`, async ({ browser }, info) => {
  const auth = await account(role);
  const before = await readAccount(auth);
  const context = await browser.newContext({ ...info.project.use, baseURL });
  const audit = await guard(context);
  try {
    await installSession(context, auth);
    const page = await context.newPage();
    await page.goto(baseURL);
    await ready(page);
    const homeLayout = await capture(page, info, 'live-' + role + '-home');
    expect(homeLayout.homeButtonOverlapsNavigation).toBe(false);
    await expect(page.locator('.home-cta')).toBeInViewport({ratio:1});
    if (before.record) {
      await page.locator('.home-cta').click();
      await expect(page.locator('main')).toHaveAttribute('data-account-view', before.record.stage);
      await capture(page, info, 'live-' + role + '-current-stage');
      if (before.record.stage === 'growth') {
        await page.getByRole('button', { name: '뒤로 가기', exact: true }).click();
        await expect(page.locator('#photo-comment')).toBeVisible();
        await capture(page, info, 'live-' + role + '-photo');
      }
      await page.reload(); await ready(page);
    }
    await page.getByRole('navigation').getByRole('button', { name: '기록', exact: true }).click();
    await expect(page.locator('.calendar-card')).toBeVisible();
    await capture(page, info, 'live-' + role + '-calendar');
    await page.getByRole('navigation').getByRole('button', { name: '정원', exact: true }).click();
    await page.getByRole('button', { name: '상점', exact: true }).click();
    await expect(page.locator('main')).toHaveAttribute('data-account-view', 'shop');
    await capture(page, info, 'live-' + role + '-shop');
    const after = await readAccount(auth);
    const unchanged = fingerprint(before) === fingerprint(after);
    writeAudit(info, audit, { mode: 'LIVE_READ_ONLY', role, date: before.date, stage: before.record?.stage ?? null, revision: before.record?.revision ?? null,
      recommendations: before.cares.length, balance: before.sunshineBalance, snapshotUnchanged: unchanged });
    expect(unchanged, 'account Snapshot unchanged').toBe(true);
    expect(audit.blockedWrites, 'no write intent from read-only navigation').toEqual([]);
    expect(audit.pageErrors, 'browser runtime exceptions').toBe(0);
  } finally { await context.close(); }
});
