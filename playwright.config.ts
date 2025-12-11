/// <reference types="node" />
import { defineConfig, devices } from '@playwright/test';

/**
 * Playwright configuration for E2E testing of Strata rendering examples
 * Configured for software rendering with Mesa llvmpipe
 */
export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : 2,
  reporter: 'html',
  
  timeout: 60000,
  expect: {
    timeout: 30000,
  },

  use: {
    baseURL: 'http://localhost:5000',
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    navigationTimeout: 30000,
    actionTimeout: 15000,
  },

  projects: [
    {
      name: 'chromium',
      use: { 
        ...devices['Desktop Chrome'],
        launchOptions: {
          executablePath: process.env.CHROMIUM_PATH,
          args: ['--no-sandbox', '--disable-setuid-sandbox'],
        },
      },
    },
  ],

  webServer: {
    command: 'cd docs-site && pnpm dev',
    url: 'http://localhost:5000',
    reuseExistingServer: !process.env.CI,
    timeout: 120000,
  },
});
