import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "@playwright/test";
import { startGalleryServer } from "../examples/server.mjs";
import {
  assertByteMapSetEqual,
  assertByteSequenceEqual,
  assertCuspAcceptance,
  assertGeometryAcceptance,
  assertMaterialAcceptance,
  assertTextureBindingAcceptance,
  assertUvAcceptance,
  byteMapSetsDiffer,
} from "./visual-acceptance.mjs";
import { assertBuildProof, snapshotCaptureInputs } from "./proof-inputs.mjs";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const output = join(
  root,
  process.env.PROCEDURAL_CAPTURE_OUTPUT ?? ".agent-state/evidence/procedural-gallery",
);
await mkdir(output, { recursive: true });
const buildProof = JSON.parse(await readFile(join(output, "build-inputs.json"), "utf8"));
await assertBuildProof(root, buildProof);
const captureInputs = await snapshotCaptureInputs(root);
if (process.env.HEAVY_BROWSER_MUTE === "0") throw new Error("Visual checks must remain muted");
const headless =
  process.env.HEAVY_BROWSER_HEADLESS === "1" ||
  process.env.PW_HEADLESS === "1" ||
  process.env.HEAVY_RENDER_HEADLESS === "1";
const gpu = process.env.HEAVY_BROWSER_GPU ?? (process.platform === "darwin" ? "metal" : "gl");
const angle = gpu.includes("metal") ? "metal" : gpu.includes("swiftshader") ? "swiftshader" : "gl";
const args = ["--mute-audio", `--use-angle=${angle}`, "--ignore-gpu-blocklist"];
const gallery = await startGalleryServer({ snapshot: true });
let browserServer;
let browser;
const errors = [];
const captures = [];
const hashBytes = (bytes) => createHash("sha256").update(bytes).digest("hex");
const byteReceipt = (maps) =>
  Object.fromEntries(
    Object.entries(maps).map(([name, bytes]) => [
      name,
      { bytes: bytes.length, sha256: hashBytes(bytes) },
    ]),
  );
try {
  assert.equal(
    gallery.servedHashes["/"],
    captureInputs["examples/gallery.html"],
    "Served HTML must match captured source",
  );
  assert.equal(
    gallery.servedHashes["/gallery.mjs"],
    captureInputs["examples/gallery.mjs"],
    "Served gallery must match captured source",
  );
  for (const [name, hash] of Object.entries(buildProof.artifacts))
    if (name.endsWith(".js"))
      assert.equal(
        gallery.servedHashes[`/lib/${name.slice(5)}`],
        hash,
        "Served bundle must match build proof",
      );
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
      proceduralGeometry: window.__proceduralDemo.proceduralGeometry,
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
  async function bakeMaps(kind) {
    const maps = await page.evaluate(
      (activeKind) => window.__proceduralDemo.readBakeBytes(activeKind),
      kind,
    );
    return Object.fromEntries(
      Object.entries(maps).map(([name, values]) => [name, Uint8Array.from(values)]),
    );
  }
  async function canvasReadback() {
    const encoded = await page.evaluate(() =>
      document.querySelector("#view").toDataURL("image/png"),
    );
    return Buffer.from(encoded.slice(encoded.indexOf(",") + 1), "base64");
  }
  async function boundTextures(key, bake) {
    const metadata = await page.evaluate(
      (key) => window.__proceduralDemo.readBoundTextureMetadata(key),
      key,
    );
    const bytes = {};
    for (const [name, texture] of Object.entries(metadata.textures)) {
      assert(
        Number.isSafeInteger(texture.bytes) && texture.bytes > 0 && texture.bytes <= 4_194_304,
        "Texture evidence must be bounded",
      );
      const array = new Uint8Array(texture.bytes);
      for (let offset = 0; offset < array.length; offset += 65_536) {
        const chunk = await page.evaluate(
          ([key, name, offset]) =>
            window.__proceduralDemo.readBoundTextureChunk(key, name, offset, 65_536),
          [key, name, offset],
        );
        assert.equal(chunk.offset, offset, "Texture chunk must use its requested offset");
        assert.equal(
          chunk.totalBytes,
          array.length,
          "Texture chunk must retain its declared length",
        );
        const decoded = Buffer.from(chunk.data, "base64");
        assert.equal(
          decoded.length,
          Math.min(65_536, array.length - offset),
          "Texture chunk must be complete",
        );
        array.set(decoded, offset);
      }
      bytes[name] = array;
    }
    assertTextureBindingAcceptance(metadata, bytes, bake, key);
    return { metadata, bytes: byteReceipt(bytes) };
  }
  async function capture(name, mode, scale) {
    const state = await ready(mode, scale);
    await page.evaluate(async () => {
      await document.fonts.ready;
    });
    const filename = `${name}.png`;
    await page.screenshot({ path: join(output, filename) });
    const render = await canvasReadback();
    captures.push({ filename, render: byteReceipt({ canvas: render }).canvas, ...state });
    return { state, render };
  }
  const one = await capture("materials-desktop-1m", "materials", 1);
  await page.getByRole("button", { name: "Scale: 1 m", exact: true }).click();
  const ten = await capture("materials-desktop-10m", "materials", 10);
  for (let axis = 0; axis < 3; axis++)
    assert(
      Math.abs(ten.state.physicalBounds[axis] / one.state.physicalBounds[axis] - 10) < 1e-6,
      "Scale must change physical geometry, not only a recipe",
    );
  await page.getByRole("button", { name: "Scale: 10 m", exact: true }).click();
  await ready("materials", 1);
  // This captures a static 1 m state. Every defect and restoration comparison below
  // keeps seed, viewport, camera, mode, and scale fixed.
  const baseline = await capture("materials-baseline-desktop-1m", "materials", 1);
  const baselineMaps = await bakeMaps("material");
  const materialSignal = assertMaterialAcceptance(baseline.state, baselineMaps);
  const textureBindings = {
    panel: await boundTextures("materials-panel", { width: 256, height: 256, ...baselineMaps }),
    cube: await boundTextures("materials-cube", { width: 256, height: 256, ...baselineMaps }),
  };
  const rejectedDefects = [];
  for (const defect of ["inverted-gravity", "missing-oxide"]) {
    await page.evaluate((value) => window.__proceduralDemo.setDefect(value), defect);
    const injected = await capture(`materials-defect-${defect}-desktop-1m`, "materials", 1);
    const injectedMaps = await bakeMaps("material");
    let rejection;
    try {
      assertMaterialAcceptance(injected.state, injectedMaps);
    } catch (error) {
      rejection = error instanceof Error ? error.message : String(error);
    }
    assert(rejection, `${defect} must be rejected by the same normal material oracle as baseline`);
    assert(
      byteMapSetsDiffer(injectedMaps, baselineMaps),
      `${defect} must change actual baked material maps`,
    );
    assert.notEqual(
      hashBytes(injected.render),
      hashBytes(baseline.render),
      `${defect} must change the actual canvas readback`,
    );
    rejectedDefects.push({
      defect,
      rejection,
      bake: byteReceipt(injectedMaps),
      render: byteReceipt({ canvas: injected.render }).canvas,
    });
    await page.evaluate(() => window.__proceduralDemo.restore());
  }
  const restored = await capture("materials-restored-desktop-1m", "materials", 1);
  const restoredMaps = await bakeMaps("material");
  assertMaterialAcceptance(restored.state, restoredMaps);
  assertByteMapSetEqual(
    restoredMaps,
    baselineMaps,
    "restoration must recover every original material byte",
  );
  assertByteSequenceEqual(
    restored.render,
    baseline.render,
    "restoration must recover the exact static canvas readback",
  );
  await page.getByRole("button", { name: "Geometry", exact: true }).click();
  const geometry = await capture("geometry-desktop", "geometry", 1);
  const geometryInvariants = assertGeometryAcceptance(geometry.state);
  await page.evaluate(() => window.__proceduralDemo.setMode("cusp"));
  const cusp = await capture("swept-radius-cusp-desktop", "cusp", 1);
  const cuspInvariants = assertCuspAcceptance(cusp.state);
  await page.getByRole("button", { name: "UV atlas", exact: true }).click();
  const atlas = await capture("atlas-desktop", "atlas", 1);
  const atlasMaps = await bakeMaps("atlas");
  const expectedAtlas = assertUvAcceptance(atlas.state, atlasMaps);
  textureBindings.atlas = await boundTextures("atlas-model", expectedAtlas);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByRole("button", { name: "Layered surfaces", exact: true }).click();
  const mobile = await capture("materials-mobile", "materials", 1);
  const mobileMaps = await bakeMaps("material");
  assertMaterialAcceptance(mobile.state, mobileMaps);
  assert.deepEqual(errors, [], "Rendered routes must have no console/page/network failures");
  await assertBuildProof(root, buildProof);
  assert.deepEqual(
    await snapshotCaptureInputs(root),
    captureInputs,
    "Capture inputs changed during rendering",
  );
  const sourceHashes = {};
  const artifactHashes = {};
  for (const filename of (await readdir(join(root, "src")))
    .filter((file) => /\.tsx?$/.test(file))
    .sort())
    sourceHashes[`src/${filename}`] = createHash("sha256")
      .update(await readFile(join(root, "src", filename)))
      .digest("hex");
  for (const filename of (await readdir(join(root, "dist")))
    .filter((file) => file.endsWith(".js"))
    .sort())
    artifactHashes[`dist/${filename}`] = createHash("sha256")
      .update(await readFile(join(root, "dist", filename)))
      .digest("hex");
  for (const filename of [
    "examples/gallery.mjs",
    "scripts/capture-visual.mjs",
    "scripts/visual-acceptance.mjs",
  ])
    sourceHashes[filename] = createHash("sha256")
      .update(await readFile(join(root, filename)))
      .digest("hex");
  Object.assign(sourceHashes, captureInputs);
  const receipt = {
    schema: 2,
    kind: headless ? "headless-diagnostic" : "headed-hardware-capture",
    muted: true,
    headless,
    sourceHashes,
    artifactHashes,
    buildProof,
    servedAssets: gallery.servedHashes,
    captures,
    acceptance: {
      materialOracle: "fixed-orientation, full RGBA8/R8 channel equality",
      materialSignal,
      baseline: {
        bake: byteReceipt(baselineMaps),
        render: byteReceipt({ canvas: baseline.render }).canvas,
      },
      rejectedDefects,
      restored: {
        bake: byteReceipt(restoredMaps),
        render: byteReceipt({ canvas: restored.render }).canvas,
      },
      geometry: geometryInvariants,
      cusp: cuspInvariants,
      atlas: byteReceipt(atlasMaps),
      textureBindings,
    },
    errors,
    browserCommand: command,
  };
  await writeFile(join(output, "receipt.json"), `${JSON.stringify(receipt, null, 2)}\n`);
  console.log(
    JSON.stringify({
      kind: receipt.kind,
      captures: captures.map((capture) => capture.filename),
      gpu: one.state.gpu,
      output,
    }),
  );
} finally {
  await browser?.close();
  await browserServer?.close();
  await gallery.close();
}
