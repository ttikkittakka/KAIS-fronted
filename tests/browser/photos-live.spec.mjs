import { test, expect } from '@playwright/test';
import { account, readAccount, fingerprint, installSession, guard, capture, ready, writeAudit, baseURL } from './support.mjs';

test('live photo calendar: absence, stored image and comment survive reload and new login', async ({ browser }, info) => {
  const date = '2026-11-18';
  for (const role of ['A', 'B']) {
    for (const login of [1, 2]) {
      const auth = await account(role, login === 2);
      const endpoint = '/api/account/records?date=' + date;
      const before = await readAccount(auth, endpoint);
      const meta = await readAccount(auth, '/api/account/photos?date=' + date);
      const context = await browser.newContext({ ...info.project.use, baseURL });
      const audit = await guard(context);
      const images = [];
      // Opening the calendar can also restore today's photo. Count only the selected date.
      context.on('request', req => { const u = new URL(req.url()); if (u.pathname === '/api/account/photos' && u.searchParams.get('date') === date && u.searchParams.has('image')) images.push(true); });
      try {
        await installSession(context, auth);
        const page = await context.newPage();
        const open = async () => {
          await ready(page);
          await page.getByRole('navigation').getByRole('button', { name: '기록', exact: true }).click();
          await page.locator('.record-calendar button').filter({ hasText: /^18$/ }).click();
          await expect(page.locator('.record-details .answer-summary')).toBeVisible();
          if (meta.hasPhoto) {
            await expect(page.locator('.record-details .record-photo')).toBeVisible();
            await expect.poll(() => page.locator('.record-details .record-photo').evaluate(img => img.complete && img.naturalWidth > 0)).toBe(true);
          } else {
            await expect(page.locator('.record-details')).toContainText('사진 없이 남긴 하루예요.');
            expect(images.length).toBe(0);
          }
          // Compare privately; assertion output never includes the user's text.
          const commentMatches = await page.locator('.record-details .saved-text').evaluateAll((nodes, comment) => nodes.some(n => n.textContent === comment), before.record?.photo_comment ?? '');
          if (before.record?.photo_comment) expect(commentMatches).toBe(true);
        };
        await page.goto(baseURL); await open();
        await page.reload(); await open();
        if (meta.hasPhoto) {
          await page.locator('.record-details .record-photo').scrollIntoViewIfNeeded();
          await expect(page.locator('.record-details .record-photo')).toBeInViewport();
        } else await page.locator('.record-details .empty-copy').scrollIntoViewIfNeeded();
        await capture(page, info, `photo-${role}-login-${login}`);
        const unchanged = fingerprint(before) === fingerprint(await readAccount(auth, endpoint));
        writeAudit({ outputPath: name => info.outputPath(`${role}-${login}-${name}`) }, audit, { role, date, hasPhoto: meta.hasPhoto, commentPresent: !!before.record?.photo_comment, snapshotUnchanged: unchanged, imageRequests: images.length });
        expect(unchanged).toBe(true);
        expect(audit.readErrors).toEqual([]);
        expect(audit.blockedWrites).toEqual([]);
        expect(audit.pageErrors).toBe(0);
      } finally { await context.close(); }
    }
  }
});
