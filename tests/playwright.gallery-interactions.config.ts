import { defineConfig } from "@playwright/test";

if (process.platform === "darwin" && process.env.HEAVY_RENDER_HEADLESS !== "1") {
  throw new Error("Gallery interaction diagnostics on macOS use the muted render pool");
}

export default defineConfig({
  testDir: ".",
  testMatch: "gallery-interactions.playwright.ts",
  timeout: 240_000,
  workers: 1,
  outputDir: "test-results",
});
