import { defineConfig } from "@playwright/test";

if (process.env.HEAVY_RENDER_HEADLESS !== "1") {
  throw new Error(
    "The Three r152 WebGL1 regression must run through the muted remote render broker",
  );
}

export default defineConfig({
  testDir: ".",
  testMatch: "three-webgl1.playwright.ts",
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
