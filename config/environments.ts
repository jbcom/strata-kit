/**
 * Environment Configuration System for Strata
 * 
 * Supports four environments:
 * - local: Developer machine with hardware GPU
 * - development: Replit environment (uses live dev URL)
 * - staging: GitHub Copilot/GitHub Actions (uses MCP Playwright server)
 * - production: GitHub Pages static hosting
 */

/* eslint-disable @typescript-eslint/no-require-imports */
declare const process: { env: Record<string, string | undefined> };
declare function require(id: string): unknown;

export type Environment = 'local' | 'development' | 'staging' | 'production';

export interface EnvironmentConfig {
  name: Environment;
  baseUrl: string;
  useExternalBrowser: boolean;
  useSoftwareRendering: boolean;
  playwrightMode: 'internal' | 'mcp' | 'none';
  executablePath?: string;
  timeout: {
    test: number;
    navigation: number;
    action: number;
    webServer: number;
  };
  retries: number;
  workers: number;
  headless: boolean;
}

function getSystemChromiumPath(): string | undefined {
  // Check environment variable first
  if (process.env.CHROMIUM_PATH) {
    return process.env.CHROMIUM_PATH;
  }
  
  // Common Nix/Replit chromium paths
  const commonPaths = [
    '/usr/bin/chromium',
    '/usr/bin/chromium-browser',
  ];
  
  // Check if any exist (synchronously at load time)
  try {
    const { existsSync } = require('fs');
    for (const path of commonPaths) {
      if (existsSync(path)) {
        return path;
      }
    }
  } catch {
    // Ignore errors
  }
  
  // Try to find via which command
  try {
    const { execSync } = require('child_process');
    const result = execSync('which chromium 2>/dev/null', { encoding: 'utf8' }).trim();
    if (result) return result;
  } catch {
    // Ignore errors
  }
  
  return undefined;
}

function detectEnvironment(): Environment {
  if (process.env.GITHUB_ACTIONS) {
    return 'staging';
  }
  
  if (process.env.REPL_ID || process.env.REPLIT_DOMAINS) {
    return 'development';
  }
  
  if (process.env.NODE_ENV === 'production') {
    return 'production';
  }
  
  return 'local';
}

function getReplitDevUrl(): string | null {
  const domain = process.env.REPLIT_DOMAINS;
  if (domain) {
    return `https://${domain}`;
  }
  return null;
}

function getProductionUrl(): string {
  return process.env.PRODUCTION_URL || 'https://jbcom.github.io/strata';
}

const configs: Record<Environment, EnvironmentConfig> = {
  local: {
    name: 'local',
    baseUrl: 'http://localhost:5000',
    useExternalBrowser: false,
    useSoftwareRendering: false,
    playwrightMode: 'internal',
    timeout: {
      test: 30000,
      navigation: 15000,
      action: 10000,
      webServer: 60000,
    },
    retries: 0,
    workers: 4,
    headless: true,
  },
  
  development: {
    name: 'development',
    baseUrl: getReplitDevUrl() || 'http://localhost:5000',
    useExternalBrowser: true,
    useSoftwareRendering: true,
    playwrightMode: 'internal',
    executablePath: getSystemChromiumPath(),
    timeout: {
      test: 60000,
      navigation: 30000,
      action: 15000,
      webServer: 0,
    },
    retries: 1,
    workers: 2,
    headless: true,
  },
  
  staging: {
    name: 'staging',
    baseUrl: process.env.STAGING_URL || 'http://localhost:5000',
    useExternalBrowser: false,
    useSoftwareRendering: false,
    playwrightMode: 'mcp',
    timeout: {
      test: 60000,
      navigation: 30000,
      action: 15000,
      webServer: 120000,
    },
    retries: 2,
    workers: 1,
    headless: true,
  },
  
  production: {
    name: 'production',
    baseUrl: getProductionUrl(),
    useExternalBrowser: true,
    useSoftwareRendering: false,
    playwrightMode: 'none',
    timeout: {
      test: 30000,
      navigation: 15000,
      action: 10000,
      webServer: 0,
    },
    retries: 0,
    workers: 4,
    headless: true,
  },
};

export function getConfig(env?: Environment): EnvironmentConfig {
  const environment = env || detectEnvironment();
  const config = { ...configs[environment] };
  
  if (environment === 'development') {
    const replitUrl = getReplitDevUrl();
    if (replitUrl) {
      config.baseUrl = replitUrl;
    }
  }
  
  return config;
}

export function getEnvironment(): Environment {
  return detectEnvironment();
}

export function isReplit(): boolean {
  return !!process.env.REPL_ID;
}

export function isGitHubActions(): boolean {
  return !!process.env.GITHUB_ACTIONS;
}

export function isLocal(): boolean {
  return !isReplit() && !isGitHubActions() && process.env.NODE_ENV !== 'production';
}

export default {
  getConfig,
  getEnvironment,
  isReplit,
  isGitHubActions,
  isLocal,
  configs,
};
