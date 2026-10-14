import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium, type Page, test } from "@playwright/test";
import { startGalleryServer } from "../examples/server.mjs";
import {
  assertEmbeddedSources,
  snapshotBuildInputs,
  snapshotBuiltArtifacts,
  snapshotCaptureInputs,
} from "../scripts/proof-inputs.mjs";

interface Demo {
  ready: boolean;
  muted: boolean;
  contextLost: boolean;
  seed: string;
  gpu: string;
  camera: { position: number[]; target: number[]; distance: number };
  resources: { geometries: number; textures: number; programs: number };
  readBakeBytes(): Record<string, number[]>;
}

async function ready(page: Page, seed?: string): Promise<void> {
  await page.waitForFunction((seed) => {
    const demo = (window as unknown as { __proceduralDemo: Demo }).__proceduralDemo;
    return demo?.ready && !demo.contextLost && (!seed || demo.seed === seed);
  }, seed);
}

async function capture(page: Page) {
  return page.evaluate(async () => {
    const demo = (window as unknown as { __proceduralDemo: Demo }).__proceduralDemo;
    const canvas = document.querySelector<HTMLCanvasElement>("#view");
    if (!canvas) throw new Error("Gallery canvas missing");
    const maps: Record<string, string> = {};
    for (const [name, bytes] of Object.entries(demo.readBakeBytes())) {
      const digest = new Uint8Array(await crypto.subtle.digest("SHA-256", Uint8Array.from(bytes)));
      maps[name] = Array.from(digest, (byte) => byte.toString(16).padStart(2, "0")).join("");
    }
    return {
      png: canvas.toDataURL("image/png"),
      maps,
      seed: demo.seed,
      camera: demo.camera,
      resources: demo.resources,
      gpu: demo.gpu,
      muted: demo.muted,
      contextLost: demo.contextLost,
    };
  });
}

test("real seed and pointer inputs change the gallery and restore deterministic output", async () => {
  const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
  const inputs = await snapshotBuildInputs(root);
  const captureInputs = await snapshotCaptureInputs(root);
  const fixtureFiles = [
    "tests/gallery-interactions.playwright.ts",
    "tests/playwright.gallery-interactions.config.ts",
  ];
  const hash = (bytes: Uint8Array | string) => createHash("sha256").update(bytes).digest("hex");
  const fixtureInputs = Object.fromEntries(
    await Promise.all(
      fixtureFiles.map(async (file) => [file, hash(await readFile(path.join(root, file)))]),
    ),
  );
  execFileSync("pnpm", ["run", "build"], { cwd: root, stdio: "inherit" });
  assert.deepEqual(await snapshotBuildInputs(root), inputs);
  await assertEmbeddedSources(root, inputs);
  const artifacts = await snapshotBuiltArtifacts(root);
  const gallery = await startGalleryServer({ snapshot: true });
  assert.equal(gallery.servedHashes["/gallery.mjs"], captureInputs["examples/gallery.mjs"]);
  assert.equal(gallery.servedHashes["/"], captureInputs["examples/gallery.html"]);
  for (const [file, checksum] of Object.entries(artifacts))
    if (file.endsWith(".js")) {
      assert.equal(gallery.servedHashes[`/lib/${file.slice(5)}`], checksum);
    }
  const gpu = process.platform === "darwin" ? "metal" : "swiftshader";
  const browser = await chromium.launch({
    headless: true,
    args: ["--mute-audio", `--use-angle=${gpu}`, "--ignore-gpu-blocklist"],
  });
  const errors: string[] = [];
  const screenshots: Record<string, string> = {};
  const output = path.join(root, "test-results/gallery-interactions");
  await mkdir(output, { recursive: true });
  const observe = (page: Page) => {
    page.on("pageerror", (error) => errors.push(error.message));
    page.on("console", (message) => {
      if (message.type() === "error") errors.push(message.text());
    });
    page.on("response", (response) => {
      if (response.status() >= 400)
        errors.push(`HTTP ${response.status()} ${new URL(response.url()).pathname}`);
    });
  };
  const save = async (name: string, value: Awaited<ReturnType<typeof capture>>) => {
    const bytes = Buffer.from(value.png.slice(value.png.indexOf(",") + 1), "base64");
    screenshots[name] = hash(bytes);
    await writeFile(path.join(output, `${name}.png`), bytes);
  };
  try {
    const desktop = await browser.newContext({
      viewport: { width: 1440, height: 920 },
      deviceScaleFactor: 1,
    });
    const page = await desktop.newPage();
    observe(page);
    await page.goto(`${gallery.url}/?muted=1&capture=1`, { waitUntil: "networkidle" });
    await ready(page, "workshop-17");
    await page.evaluate(() => document.fonts.ready);
    const baseline = await capture(page);
    await save("seed-baseline", baseline);
    assert(baseline.muted && !baseline.contextLost);
    assert.match(baseline.gpu, gpu === "metal" ? /metal/i : /swiftshader/i);
    await page.locator("#seed").fill("gallery-roundtrip-28");
    await page.locator("#seed").press("Tab");
    await ready(page, "gallery-roundtrip-28");
    const changed = await capture(page);
    await save("seed-changed", changed);
    assert.notDeepEqual(
      changed.maps,
      baseline.maps,
      "Actual seed input must change generated maps",
    );
    assert.notEqual(changed.png, baseline.png, "Actual seed input must change rendered pixels");
    assert.deepEqual(changed.camera, baseline.camera, "Seed comparison must keep the camera fixed");
    await page.locator("#seed").fill("workshop-17");
    await page.locator("#seed").press("Tab");
    await ready(page, "workshop-17");
    const restored = await capture(page);
    await save("seed-restored", restored);
    assert.deepEqual(restored.maps, baseline.maps);
    assert.equal(restored.png, baseline.png, "Restoring seed must restore exact canvas pixels");
    assert.deepEqual(
      restored.resources,
      baseline.resources,
      "Rebuilds must dispose prior resources",
    );
    const bounds = await page.locator("#view").boundingBox();
    assert(bounds);
    const x = bounds.x + bounds.width * 0.5,
      y = bounds.y + bounds.height * 0.5;
    await page.mouse.move(x, y);
    await page.mouse.down();
    await page.mouse.move(x + bounds.width * 0.16, y + bounds.height * 0.06, { steps: 8 });
    await page.mouse.up();
    const rotated = await capture(page);
    await save("mouse-orbit", rotated);
    assert.notDeepEqual(rotated.camera.position, restored.camera.position);
    assert.notEqual(rotated.png, restored.png, "Mouse orbit must change actual rendered pixels");
    await page.mouse.wheel(0, -220);
    await page.waitForFunction((distance) => {
      const demo = (window as unknown as { __proceduralDemo: Demo }).__proceduralDemo;
      return Math.abs(demo.camera.distance - distance) > 0.001;
    }, rotated.camera.distance);
    const zoomed = await capture(page);
    await save("mouse-zoom", zoomed);
    assert.notEqual(zoomed.png, rotated.png);
    assert.deepEqual(zoomed.resources, baseline.resources);
    await desktop.close();

    const mobile = await browser.newContext({
      viewport: { width: 390, height: 844 },
      deviceScaleFactor: 1,
      isMobile: true,
      hasTouch: true,
    });
    const touchPage = await mobile.newPage();
    observe(touchPage);
    await touchPage.goto(`${gallery.url}/?muted=1&capture=1`, { waitUntil: "networkidle" });
    await ready(touchPage, "workshop-17");
    await touchPage.locator("#view").scrollIntoViewIfNeeded();
    const touchBaseline = await capture(touchPage);
    await save("touch-baseline", touchBaseline);
    const touchBounds = await touchPage.locator("#view").boundingBox();
    assert(touchBounds);
    const tx = touchBounds.x + touchBounds.width * 0.45,
      ty = touchBounds.y + touchBounds.height * 0.5;
    await touchPage.evaluate(() => {
      const events: Array<{ pointerType: string; trusted: boolean }> = [];
      (window as unknown as { __touchProof: typeof events }).__touchProof = events;
      document.querySelector("#view")?.addEventListener("pointerdown", (event) => {
        const pointer = event as PointerEvent;
        events.push({ pointerType: pointer.pointerType, trusted: pointer.isTrusted });
      });
    });
    const cdp = await mobile.newCDPSession(touchPage);
    const point = (id: number, x: number, y: number) => ({
      id,
      x,
      y,
      radiusX: 1,
      radiusY: 1,
      force: 1,
    });
    await cdp.send("Input.dispatchTouchEvent", {
      type: "touchStart",
      touchPoints: [point(1, tx, ty)],
    });
    await cdp.send("Input.dispatchTouchEvent", {
      type: "touchMove",
      touchPoints: [point(1, tx + touchBounds.width * 0.18, ty + touchBounds.height * 0.04)],
    });
    await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
    const touchOrbit = await capture(touchPage);
    await save("touch-orbit", touchOrbit);
    assert.notDeepEqual(touchOrbit.camera.position, touchBaseline.camera.position);
    assert.notEqual(touchOrbit.png, touchBaseline.png);
    await cdp.send("Input.dispatchTouchEvent", {
      type: "touchStart",
      touchPoints: [point(2, tx - 25, ty), point(3, tx + 25, ty)],
    });
    await cdp.send("Input.dispatchTouchEvent", {
      type: "touchMove",
      touchPoints: [point(2, tx - 45, ty), point(3, tx + 45, ty)],
    });
    await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
    const touchZoom = await capture(touchPage);
    await save("touch-zoom", touchZoom);
    assert(Math.abs(touchZoom.camera.distance - touchOrbit.camera.distance) > 0.001);
    assert.notEqual(touchZoom.png, touchOrbit.png);
    assert.deepEqual(touchZoom.resources, touchBaseline.resources);
    const trustedTouch = await touchPage.evaluate(
      () =>
        (window as unknown as { __touchProof: Array<{ pointerType: string; trusted: boolean }> })
          .__touchProof,
    );
    assert(
      trustedTouch.length >= 3 &&
        trustedTouch.every((event) => event.pointerType === "touch" && event.trusted),
    );
    await mobile.close();
    assert.deepEqual(errors, []);
    assert.deepEqual(await snapshotBuildInputs(root), inputs);
    assert.deepEqual(await snapshotCaptureInputs(root), captureInputs);
    assert.deepEqual(await snapshotBuiltArtifacts(root), artifacts);
    assert.deepEqual(
      Object.fromEntries(
        await Promise.all(
          fixtureFiles.map(async (file) => [file, hash(await readFile(path.join(root, file)))]),
        ),
      ),
      fixtureInputs,
    );
    await writeFile(
      path.join(output, "receipt.json"),
      JSON.stringify(
        {
          schema: 1,
          kind: "headless-interaction-diagnostic",
          muted: true,
          gpu: baseline.gpu,
          inputs,
          captureInputs,
          fixtureInputs,
          artifacts,
          screenshots,
          seed: { baseline: baseline.maps, changed: changed.maps, restored: restored.maps },
          cameras: {
            baseline: baseline.camera,
            mouseOrbit: rotated.camera,
            mouseZoom: zoomed.camera,
            touchBaseline: touchBaseline.camera,
            touchOrbit: touchOrbit.camera,
            touchZoom: touchZoom.camera,
          },
          resources: {
            baseline: baseline.resources,
            restored: restored.resources,
            touchBaseline: touchBaseline.resources,
            touchZoom: touchZoom.resources,
          },
          trustedTouch,
        },
        null,
        2,
      ),
    );
  } finally {
    await browser.close();
    await gallery.close();
  }
});
