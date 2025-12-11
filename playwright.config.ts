import { defineConfig, devices } from '@playwright/test';

/**
 * Playwright configuration for E2E testing of Strata rendering examples
 */
export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: 'html',
  
  use: {
    baseURL: 'http://localhost:5000',
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
  },

  projects: [
    {
      name: 'chromium',
      use: { 
        ...devices['Desktop Chrome'],
        channel: 'chromium',
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
  },
});
