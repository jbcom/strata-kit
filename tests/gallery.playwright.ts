import { execFileSync } from "node:child_process";
import { test } from "@playwright/test";

test("procedural gallery renders every public example silently", async () => {
  execFileSync("pnpm", ["run", "build"], { stdio: "inherit" });
  process.env.PROCEDURAL_CAPTURE_OUTPUT = "test-results/procedural-gallery";
  await import("../scripts/capture-visual.mjs");
});
