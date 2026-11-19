import { defineConfig } from '@playwright/test';
// Do not put real account DOM text into Playwright's failure-context artifacts.
process.env.PLAYWRIGHT_NO_COPY_PROMPT = '1';
const run = process.env.ONESTEP_BROWSER_RUN_ID ??= new Date().toISOString().replace(/[:.]/g, '-');

export default defineConfig({
  testDir: './tests/browser',
  workers: 1,
  retries: 0,
  timeout: 90000,
  expect: { timeout: 20000 },
  outputDir: '.playwright-results/run-' + run,
  reporter: [['list']],
  use: {
    baseURL: 'http://localhost:3000',
    channel: 'chrome',
    headless: true,
    serviceWorkers: 'block',
    trace: 'off',
    video: 'off',
    screenshot: 'off',
    actionTimeout: 15000,
  },
  projects: [
    { name: 'desktop', use: { viewport: { width: 1280, height: 900 } } },
    { name: 'mobile', use: { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 1 } },
  ],
});
