import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: ".",
  testMatch: "gallery.playwright.ts",
  timeout: 180_000,
  workers: 1,
  outputDir: "test-results",
});
