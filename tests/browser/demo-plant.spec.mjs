import { expect, test } from '@playwright/test';

test('touch opens the demo action ring without paging past plant mood', async ({ context, page, baseURL }, info) => {
  test.skip(!info.project.use.hasTouch, 'Requires browser touch input');
  await context.route('**/*', route => {
    const request = route.request();
    return new URL(request.url()).origin === new URL(baseURL).origin && request.method() === 'GET'
      ? route.continue() : route.abort();
  });
  await page.goto('/demo');

  const plant = page.locator('.hero-plant button.companion-art');
  const mood = page.getByRole('menuitem', { name: '기분', exact: true });
  await plant.tap();
  await expect(mood).toBeVisible();
  await mood.tap();
  const moods = page.getByRole('menu', { name: '식물 기분' });
  await moods.getByRole('menuitemradio', { name: '속상함' }).tap();
  await expect(moods).toHaveCount(0);
  await expect(plant).toHaveClass(/companion-art--face-low/);

  await plant.focus();
  await page.keyboard.press('Enter');
  await expect(mood).toBeVisible();
});
