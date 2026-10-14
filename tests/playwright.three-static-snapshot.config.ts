import { defineConfig } from "@playwright/test";

if (process.platform === "darwin" && process.env.HEAVY_RENDER_HEADLESS !== "1") {
  throw new Error(
    "The static Three snapshot proof must run through the muted remote render broker",
  );
}

export default defineConfig({
  testDir: ".",
  testMatch: "three-static-snapshot.playwright.ts",
  timeout: 180_000,
  workers: 1,
  outputDir: "test-results",
});
