import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "@playwright/test";
import { startGalleryServer } from "../examples/server.mjs";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const output = join(root, process.env.PROCEDURAL_CAPTURE_OUTPUT ?? ".agent-state/evidence/procedural-gallery");
await mkdir(output, { recursive: true });
if (process.env.HEAVY_BROWSER_MUTE === "0") throw new Error("Visual checks must remain muted");
const headless =
  process.env.HEAVY_BROWSER_HEADLESS === "1" ||
  process.env.PW_HEADLESS === "1" ||
  process.env.HEAVY_RENDER_HEADLESS === "1";
const gpu = process.env.HEAVY_BROWSER_GPU ?? (process.platform === "darwin" ? "metal" : "gl");
const angle = gpu.includes("metal") ? "metal" : gpu.includes("swiftshader") ? "swiftshader" : "gl";
const args = ["--mute-audio", `--use-angle=${angle}`, "--ignore-gpu-blocklist"];
const gallery = await startGalleryServer();
let browserServer;
let browser;
const errors = [];
const captures = [];
try {
  browserServer = await chromium.launchServer({
    channel: process.env.PW_CHANNEL ?? (headless ? undefined : "chrome"),
    headless,
    args,
  });
  const command = execFileSync(
    "ps",
    ["-p", String(browserServer.process().pid), "-o", "command="],
    { encoding: "utf8" },
  ).trim();
  assert(command.includes("--mute-audio"), "Browser process must be muted");
  if (!headless)
    assert(!command.includes("--headless"), "Headed acceptance cannot launch headless");
  browser = await chromium.connect(browserServer.wsEndpoint());
  const context = await browser.newContext({
    viewport: { width: 1440, height: 920 },
    deviceScaleFactor: 1,
  });
  const page = await context.newPage();
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(message.text());
  });
  page.on("response", (response) => {
    if (response.status() >= 400)
      errors.push(`HTTP ${response.status()} ${new URL(response.url()).pathname}`);
  });
  await page.goto(`${gallery.url}/?muted=1&capture=1`, { waitUntil: "networkidle" });
  async function ready(mode, scale) {
    await page.waitForFunction(
      ([mode, scale]) =>
        window.__proceduralDemo?.ready &&
        window.__proceduralDemo.mode === mode &&
        window.__proceduralDemo.scale === scale &&
        window.__proceduralDemo.triangles > 0 &&
        !window.__proceduralDemo.contextLost,
      [mode, scale],
    );
    const state = await page.evaluate(() => ({
      ready: window.__proceduralDemo.ready,
      muted: window.__proceduralDemo.muted,
      mode: window.__proceduralDemo.mode,
      scale: window.__proceduralDemo.scale,
      seed: window.__proceduralDemo.seed,
      gpu: window.__proceduralDemo.gpu,
      triangles: window.__proceduralDemo.triangles,
      drawCalls: window.__proceduralDemo.drawCalls,
      shaderCompileCount: window.__proceduralDemo.shaderCompileCount,
      physicalBounds: window.__proceduralDemo.physicalBounds,
    }));
    assert(
      state.muted && state.shaderCompileCount > 0,
      "Mute and scoped shader assembly must be proven",
    );
    if (!headless && process.platform === "darwin")
      assert(
        /metal/i.test(state.gpu) && !/swiftshader|llvmpipe/i.test(state.gpu),
        "Headed Mac proof requires hardware Metal",
      );
    return state;
  }
  async function capture(name, mode, scale) {
    const state = await ready(mode, scale);
    await page.evaluate(async () => {
      await document.fonts.ready;
    });
    const filename = `${name}.png`;
    await page.screenshot({ path: join(output, filename) });
    captures.push({ filename, ...state });
    return state;
  }
  const one = await capture("materials-desktop-1m", "materials", 1);
  await page.getByRole("button", { name: "Scale: 1 m", exact: true }).click();
  const ten = await capture("materials-desktop-10m", "materials", 10);
  for (let axis = 0; axis < 3; axis++)
    assert(
      Math.abs(ten.physicalBounds[axis] / one.physicalBounds[axis] - 10) < 1e-6,
      "Scale must change physical geometry, not only a recipe",
    );
  await page.getByRole("button", { name: "Scale: 10 m", exact: true }).click();
  await ready("materials", 1);
  for (const [mode, label] of [
    ["geometry", "Geometry"],
    ["atlas", "UV atlas"],
  ]) {
    await page.getByRole("button", { name: label, exact: true }).click();
    await capture(`${mode}-desktop`, mode, 1);
  }
  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByRole("button", { name: "Layered surfaces", exact: true }).click();
  await capture("materials-mobile", "materials", 1);
  assert.deepEqual(errors, [], "Rendered routes must have no console/page/network failures");
  const sourceHashes = {};
  const artifactHashes = {};
  for (const filename of (await readdir(join(root, "src")))
    .filter((file) => /\.tsx?$/.test(file))
    .sort())
    sourceHashes[`src/${filename}`] = createHash("sha256")
      .update(await readFile(join(root, "src", filename)))
      .digest("hex");
  for (const filename of ["index.js", "materials.js", "mesh.js", "three.js", "shaders.js"])
    artifactHashes[`dist/${filename}`] = createHash("sha256")
      .update(await readFile(join(root, "dist", filename)))
      .digest("hex");
  const receipt = {
    schema: 1,
    kind: headless ? "headless-diagnostic" : "headed-hardware-capture",
    muted: true,
    headless,
    sourceHashes,
    artifactHashes,
    captures,
    errors,
    browserCommand: command,
  };
  await writeFile(join(output, "receipt.json"), `${JSON.stringify(receipt, null, 2)}\n`);
  console.log(
    JSON.stringify({
      kind: receipt.kind,
      captures: captures.map((capture) => capture.filename),
      gpu: one.gpu,
      output,
    }),
  );
} finally {
  await browser?.close();
  await browserServer?.close();
  await gallery.close();
}
