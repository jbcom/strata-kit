import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: ".",
  testMatch: "sheet-mask.playwright.ts",
  timeout: 180_000,
  workers: 1,
  outputDir: "test-results",
  use: {
    browserName: "chromium",
    headless: true,
    launchOptions: {
      args: ["--mute-audio", "--use-angle=metal", "--ignore-gpu-blocklist"],
    },
  },
});
