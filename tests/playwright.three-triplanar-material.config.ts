import { defineConfig } from "@playwright/test";

if (process.env.HEAVY_RENDER_HEADLESS !== "1") {
  throw new Error("Triplanar GPU proof requires the muted Metal render broker");
}
export default defineConfig({
  testDir: ".",
  testMatch: "three-triplanar-material.playwright.ts",
  timeout: 180_000,
  workers: 1,
  outputDir: "test-results",
});
