import { defineConfig, devices } from '@playwright/test';
import { getConfig, getEnvironment } from './config/environments';

/**
 * Playwright configuration for E2E testing of Strata documentation site
 * 
 * Environment-aware configuration:
 * - local: Uses localhost:5000, fast timeouts, hardware GPU
 * - development: Uses Replit dev URL with system Chromium
 * - staging: Works with GitHub Copilot's Playwright MCP server
 * - production: Tests against live GitHub Pages site
 */

const envConfig = getConfig();
const env = getEnvironment();

console.log(`[Playwright] Environment: ${env}`);
console.log(`[Playwright] Base URL: ${envConfig.baseUrl}`);
console.log(`[Playwright] Executable: ${envConfig.executablePath || 'bundled'}`);

export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: true,
  forbidOnly: env === 'staging',
  retries: envConfig.retries,
  workers: envConfig.workers,
  reporter: env === 'staging' ? 'github' : 'html',
  
  timeout: envConfig.timeout.test,
  expect: {
    timeout: envConfig.timeout.navigation,
  },

  use: {
    baseURL: envConfig.baseUrl,
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    navigationTimeout: envConfig.timeout.navigation,
    actionTimeout: envConfig.timeout.action,
    headless: envConfig.headless,
  },

  projects: [
    {
      name: 'chromium',
      use: { 
        ...devices['Desktop Chrome'],
        channel: envConfig.executablePath ? undefined : 'chromium',
        launchOptions: {
          executablePath: envConfig.executablePath,
          args: [
            '--no-sandbox',
            '--disable-setuid-sandbox',
            ...(envConfig.useSoftwareRendering ? [
              '--disable-gpu',
              '--disable-software-rasterizer',
            ] : []),
          ],
          env: envConfig.useSoftwareRendering ? {
            ...process.env,
            LIBGL_ALWAYS_SOFTWARE: '1',
            GALLIUM_DRIVER: 'llvmpipe',
          } : undefined,
        },
      },
    },
    ...(env === 'staging' ? [
      {
        name: 'firefox',
        use: { ...devices['Desktop Firefox'] },
      },
      {
        name: 'webkit',
        use: { ...devices['Desktop Safari'] },
      },
    ] : []),
  ],

  ...(envConfig.timeout.webServer > 0 && env !== 'development' && env !== 'production' ? {
    webServer: {
      command: 'cd docs-site && pnpm dev',
      url: 'http://localhost:5000',
      reuseExistingServer: env === 'local',
      timeout: envConfig.timeout.webServer,
    },
  } : {}),
});
