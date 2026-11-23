import { test, expect } from '@playwright/test';
import { loadTs } from '../../scripts/helpers/load-ts.mjs';
const { mockAnalysis } = loadTs(new URL('../../src/lib/ai-prototype/mock.ts', import.meta.url));

for (const [width, height] of [[1280, 900], [390, 844], [320, 568]]) {
  test(`AI 시제품 모의 검증 ${width}×${height}`, async ({ browser }, info) => {
    test.skip(info.project.name !== 'desktop', '뷰포트를 직접 지정합니다.');
    const context = await browser.newContext({ viewport: { width, height }, serviceWorkers: 'block' });
    const forbidden = [], pageErrors = [];
    let calls = 0;
    await context.route('**/*', async route => {
      const req = route.request(), url = new URL(req.url());
      if (url.hostname === 'localhost' && url.pathname === '/__nextjs_original-stack-frames') return route.continue();
      if (url.pathname === '/api/dev/ai-mind') {
        // 요청을 브라우저에서 가로채므로 Next.js나 OpenAI로 전달되지 않습니다.
        calls++;
        const { requestId: _requestId, ...input } = req.postDataJSON();
        if (calls === 2) return route.fulfill({ status: 502, contentType: 'application/json', body: JSON.stringify({ errorCode: 'OPENAI_RATE_LIMITED', apiCalls: 1 }) });
        await new Promise(resolve => setTimeout(resolve, 200));
        return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({
          model: 'gpt-5.4-mini', analysis: mockAnalysis(input), usage: { inputTokens: 2000, outputTokens: 800 }, estimatedUsd: 0.0051, apiCalls: 1,
        }) });
      }
      if (url.pathname.startsWith('/api/') || !['localhost', '127.0.0.1'].includes(url.hostname) || !['GET', 'HEAD'].includes(req.method())) {
        forbidden.push(url.pathname); return route.abort();
      }
      return route.continue();
    });
    try {
      const page = await context.newPage(); page.on('pageerror', error => pageErrors.push(error.message));
      page.on('console', message => { if (message.type() === 'error' && !message.text().includes('Failed to load resource')) pageErrors.push(message.text()); });
      await page.goto('http://localhost:3000/dev/ai-mind');
      await expect(page.getByRole('heading', { name: '마음을 읽는 작은 연습' })).toBeVisible();
      const execute = page.getByRole('button', { name: 'AI 마음 분석 1회 실행' });
      await expect(execute).toBeDisabled();
      expect(calls).toBe(0);
      // 스크린샷의 커서 숨김 스타일이 hydration 전에 DOM을 바꾸지 않도록 이벤트 처리를 확인합니다.
      await page.getByRole('checkbox').check();
      await expect(execute).toBeEnabled();
      await page.getByRole('checkbox').uncheck();
      await expect(execute).toBeDisabled();
      await page.screenshot({ path: info.outputPath(`ai-${width}-initial.png`), fullPage: true });
      for (const id of ['exhausted', 'meal', 'light', 'quiet', 'mixed', 'injection']) {
        await page.locator('#test-case').selectOption(id);
        await page.getByRole('button', { name: '모의 결과 보기 · API 호출 없음' }).click();
        await expect(page.getByTestId('care-result')).toHaveCount(3);
        await expect(page.getByText('모의 결과 · 정해진 예시 · AI 호출 없음')).toBeVisible();
      }
      expect(calls).toBe(0);
      await page.locator('#test-case').selectOption('mixed');
      await page.getByRole('button', { name: '모의 결과 보기 · API 호출 없음' }).click();
      await expect(page.getByTestId('care-result').first()).toBeVisible();
      await page.screenshot({ path: info.outputPath(`ai-${width}-mock.png`), fullPage: true });
      await page.getByRole('checkbox').check();
      await execute.click();
      await expect(page.getByText('AI 분석 결과 · 이 화면에만 보관')).toBeVisible();
      await expect(page.getByTestId('call-count')).toHaveText('1회 / 1회');
      expect(calls).toBe(1);
      await execute.click();
      await expect(page.locator('main').getByRole('alert')).toContainText('OPENAI_RATE_LIMITED');
      await page.waitForTimeout(500);
      expect(calls).toBe(2);
      await page.locator('#fiction-note').fill('가상 기록: 잠시 쉬고 싶어요.');
      await expect(execute).toBeDisabled();
      await expect(page.getByTestId('care-result')).toHaveCount(0);
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
      const fit = await page.locator('main button, main select, main textarea').evaluateAll(elements => elements.every(el => {
        const r = el.getBoundingClientRect(); return r.left >= 0 && r.right <= innerWidth + 1 && r.height >= 40;
      }));
      expect(fit).toBe(true);
      expect(forbidden).toEqual([]);
      expect(pageErrors).toEqual([]);
      await page.reload();
      await expect(page.getByTestId('call-count')).toHaveText('0회 / 0회');
      expect(calls).toBe(2);
    } finally { await context.close(); }
  });
}
