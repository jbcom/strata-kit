import { defineConfig } from "@playwright/test";

if (process.platform === "darwin" && process.env.HEAVY_RENDER_HEADLESS !== "1") {
  throw new Error("Rest-bound surface diagnostics on macOS use the muted render pool");
}

export default defineConfig({
  testDir: ".",
  testMatch: "rest-bound-surface-layers.playwright.ts",
  timeout: 180_000,
  workers: 1,
  outputDir: "test-results",
});
