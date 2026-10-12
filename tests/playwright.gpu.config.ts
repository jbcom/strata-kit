import { defineConfig } from '@playwright/test';

/** The render pool sets HEAVY_RENDER_HEADLESS; local visual proof is intentionally out of scope. */
export default defineConfig({
  testDir: '.',
  testMatch: 'surfaceFields.gpu.playwright.ts',
  timeout: 30_000,
  workers: 1,
  use: {
    browserName: 'chromium',
    headless: process.env.HEAVY_RENDER_HEADLESS === '1',
    launchOptions: {
      args: ['--mute-audio', '--use-angle=metal', '--ignore-gpu-blocklist'],
    },
  },
});
