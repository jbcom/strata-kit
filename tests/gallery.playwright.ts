import { execFileSync } from "node:child_process";
import assert from "node:assert/strict";
import { mkdir, rm, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "@playwright/test";
import {
  assertEmbeddedSources,
  snapshotBuildInputs,
  snapshotBuiltArtifacts,
} from "../scripts/proof-inputs.mjs";

test("procedural gallery renders every public example silently", async () => {
  const root = dirname(dirname(fileURLToPath(import.meta.url)));
  process.env.PROCEDURAL_CAPTURE_OUTPUT ??= "test-results/procedural-gallery";
  const output = join(root, process.env.PROCEDURAL_CAPTURE_OUTPUT);
  await mkdir(output, { recursive: true });
  await rm(join(output, "receipt.json"), { force: true });
  await rm(join(output, "build-inputs.json"), { force: true });
  const inputs = await snapshotBuildInputs(root);
  execFileSync("pnpm", ["run", "build"], { stdio: "inherit" });
  assert.deepEqual(await snapshotBuildInputs(root), inputs, "Compiler inputs changed during build");
  await assertEmbeddedSources(root, inputs);
  await writeFile(
    join(output, "build-inputs.json"),
    `${JSON.stringify(
      {
        schema: 1,
        inputs,
        artifacts: await snapshotBuiltArtifacts(root),
        runtime: { node: process.version, v8: process.versions.v8 },
      },
      null,
      2,
    )}\n`,
  );
  await import("../scripts/capture-visual.mjs");
});
