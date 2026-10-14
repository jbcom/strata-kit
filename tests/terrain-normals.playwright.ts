import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { readFileSync, readdirSync } from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
import { createServer } from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium, test } from "@playwright/test";
import {
  assertEmbeddedSources,
  hashBytes,
  snapshotBuildInputs,
  snapshotBuiltArtifacts,
} from "../scripts/proof-inputs.mjs";

const fixture = {
  seed: "normal-audit",
  width: 17,
  depth: 17,
  cellSize: 0.25,
  biomes: [
    { type: "forest", center: [0, 0] as [number, number], radius: 0.1 },
    { type: "desert", center: [0, 0] as [number, number], radius: 100 },
  ],
};

type View = "normal" | "lit";

interface ViewCapture {
  readonly image: string;
  readonly visiblePixels: number;
  readonly drawCalls: number;
}

interface BrowserProof {
  readonly baseline: Record<View, ViewCapture>;
  readonly fault: Record<View, ViewCapture>;
  readonly restored: Record<View, ViewCapture>;
  readonly rejected: boolean;
  readonly restoredBytes: boolean;
  readonly renderer: string;
  readonly vertices: number;
  readonly triangles: number;
  readonly repaired: number;
  readonly geometriesAfterDispose: number;
}

function sourceHash(root: string, file: string): string {
  return hashBytes(readFileSync(path.join(root, file)));
}

function legacyNormals(
  heightAt: (x: number, z: number) => number,
  options: Pick<typeof fixture, "width" | "depth" | "cellSize">,
): Float32Array {
  const normals = new Float32Array(options.width * options.depth * 3);
  for (let z = 0; z < options.depth; z += 1) {
    for (let x = 0; x < options.width; x += 1) {
      const offset = (z * options.width + x) * 3;
      const worldX = (x - (options.width - 1) / 2) * options.cellSize;
      const worldZ = (z - (options.depth - 1) / 2) * options.cellSize;
      const slopeX =
        heightAt(worldX + options.cellSize, worldZ) - heightAt(worldX - options.cellSize, worldZ);
      const slopeZ =
        heightAt(worldX, worldZ + options.cellSize) - heightAt(worldX, worldZ - options.cellSize);
      const inverseLength = 1 / Math.hypot(-slopeX, 2 * options.cellSize, -slopeZ);
      normals.set(
        [-slopeX * inverseLength, 2 * options.cellSize * inverseLength, -slopeZ * inverseLength],
        offset,
      );
    }
  }
  return normals;
}

function hashesForCapture(capture: Record<View, ViewCapture>): Record<View, string> {
  return Object.fromEntries(
    (Object.keys(capture) as View[]).map((view) => [
      view,
      createHash("sha256")
        .update(Buffer.from(capture[view].image.split(",")[1]!, "base64"))
        .digest("hex"),
    ]),
  ) as Record<View, string>;
}

test("heightfield incident normal fallback renders, rejects old normals, and restores exactly", async () => {
  const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
  const inputs = await snapshotBuildInputs(root);
  execFileSync("pnpm", ["run", "build"], { cwd: root, stdio: "inherit" });
  assert.deepEqual(await snapshotBuildInputs(root), inputs);
  await assertEmbeddedSources(root, inputs);
  const artifacts = await snapshotBuiltArtifacts(root);
  const { createSeededTerrainField } = await import("../dist/terrain.js");
  const field = createSeededTerrainField({ seed: fixture.seed, biomes: fixture.biomes });
  const mesh = field.createHeightfield(fixture);
  const oldNormals = legacyNormals(field.heightAt, fixture);
  const repaired: number[] = [];
  for (let offset = 0; offset < mesh.normals.length; offset += 3) {
    if (
      !Object.is(mesh.normals[offset], oldNormals[offset]) ||
      !Object.is(mesh.normals[offset + 1], oldNormals[offset + 1]) ||
      !Object.is(mesh.normals[offset + 2], oldNormals[offset + 2])
    ) {
      repaired.push(offset / 3);
    }
  }
  assert(repaired.length > 0, "The fixed sharp terrain fixture must exercise the fallback");

  const scene = Buffer.from(
    JSON.stringify({
      mesh: {
        positions: Array.from(mesh.positions),
        normals: Array.from(mesh.normals),
        indices: Array.from(mesh.indices),
        width: mesh.width,
        depth: mesh.depth,
      },
      oldNormals: Array.from(oldNormals),
      repaired,
    }),
  );
  const routes = new Map<string, Buffer>();
  for (const file of readdirSync(path.join(root, "dist"))) {
    if (file.endsWith(".js"))
      routes.set(`/dist/${file}`, readFileSync(path.join(root, "dist", file)));
  }
  for (const file of ["three.module.js", "three.core.js"]) {
    routes.set(`/${file}`, readFileSync(path.join(root, "node_modules/three/build", file)));
  }
  routes.set("/scene.json", scene);
  routes.set(
    "/",
    Buffer.from(`<!doctype html><meta charset="utf-8">
<style>html,body,canvas{margin:0;width:100%;height:100%;display:block;background:#15191d}</style>
<canvas></canvas><script type="importmap">{"imports":{"three":"/three.module.js"}}</script>
<script type="module">
  import * as THREE from "three";
  import { createThreeHeightfieldGeometry } from "/dist/three.js";
  const fixture = await (await fetch("/scene.json")).json();
  const mesh = {
    ...fixture.mesh,
    positions: Float32Array.from(fixture.mesh.positions),
    normals: Float32Array.from(fixture.mesh.normals),
    indices: Uint32Array.from(fixture.mesh.indices),
  };
  const canvas = document.querySelector("canvas");
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, preserveDrawingBuffer: true });
  renderer.setSize(1120, 760, false);
  renderer.setPixelRatio(1);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.setClearColor(0x15191d, 1);
  const gl = renderer.getContext();
  const debug = gl.getExtension("WEBGL_debug_renderer_info");
  const rendererName = String(gl.getParameter(debug ? debug.UNMASKED_RENDERER_WEBGL : gl.RENDERER));
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(32, 1120 / 760, 0.01, 100);
  camera.position.set(3.4, 1.9, 3.7);
  camera.lookAt(0, 0, 0);
  const geometry = createThreeHeightfieldGeometry(mesh);
  const normalMaterial = new THREE.MeshNormalMaterial({ flatShading: false });
  const litMaterial = new THREE.MeshStandardMaterial({ color: 0x9da3a6, roughness: 0.82, metalness: 0 });
  const surface = new THREE.Mesh(geometry, normalMaterial);
  scene.add(surface);
  scene.add(new THREE.HemisphereLight(0xe9eff4, 0x26313a, 2.4));
  const key = new THREE.DirectionalLight(0xffffff, 2.2);
  key.position.set(3, 5, 4);
  scene.add(key);
  function verifyIncidentNormals() {
    const positions = geometry.getAttribute("position");
    const normals = geometry.getAttribute("normal");
    const indices = geometry.getIndex();
    for (let triangle = 0; triangle < indices.count; triangle += 3) {
      const a = new THREE.Vector3().fromBufferAttribute(positions, indices.getX(triangle));
      const b = new THREE.Vector3().fromBufferAttribute(positions, indices.getX(triangle + 1));
      const c = new THREE.Vector3().fromBufferAttribute(positions, indices.getX(triangle + 2));
      const face = b.sub(a).cross(c.sub(a));
      if (!(face.lengthSq() > 0)) throw new Error("zero area");
      face.normalize();
      for (let corner = 0; corner < 3; corner += 1) {
        const normal = new THREE.Vector3().fromBufferAttribute(normals, indices.getX(triangle + corner));
        if (Math.abs(normal.length() - 1) > 1e-6 || !(face.dot(normal) > 0)) {
          throw new Error("incident corner behind face");
        }
      }
    }
  }
  function capture(material) {
    surface.material = material;
    renderer.render(scene, camera);
    if (gl.getError() !== gl.NO_ERROR) throw new Error("GL error");
    const pixels = new Uint8Array(1120 * 760 * 4);
    gl.readPixels(0, 0, 1120, 760, gl.RGBA, gl.UNSIGNED_BYTE, pixels);
    let visiblePixels = 0;
    for (let pixel = 0; pixel < pixels.length; pixel += 4) {
      if (pixels[pixel] !== 21 || pixels[pixel + 1] !== 25 || pixels[pixel + 2] !== 29) visiblePixels += 1;
    }
    return { image: canvas.toDataURL("image/png"), visiblePixels, drawCalls: renderer.info.render.calls };
  }
  window.runTerrainNormalsProof = () => {
    const normals = geometry.getAttribute("normal");
    const saved = normals.array.slice();
    verifyIncidentNormals();
    const baseline = { normal: capture(normalMaterial), lit: capture(litMaterial) };
    for (const vertex of fixture.repaired) {
      normals.array.set(fixture.oldNormals.slice(vertex * 3, vertex * 3 + 3), vertex * 3);
    }
    normals.needsUpdate = true;
    let rejected = false;
    try { verifyIncidentNormals(); } catch (error) { rejected = error.message === "incident corner behind face"; }
    const fault = { normal: capture(normalMaterial), lit: capture(litMaterial) };
    normals.array.set(saved);
    normals.needsUpdate = true;
    verifyIncidentNormals();
    const restored = { normal: capture(normalMaterial), lit: capture(litMaterial) };
    const restoredBytes = normals.array.every((value, index) => Object.is(value, saved[index]));
    scene.remove(surface);
    geometry.dispose();
    normalMaterial.dispose();
    litMaterial.dispose();
    return {
      baseline, fault, restored, rejected, restoredBytes, renderer: rendererName,
      vertices: positionsCount(), triangles: fixture.mesh.indices.length / 3,
      repaired: fixture.repaired.length, geometriesAfterDispose: renderer.info.memory.geometries,
    };
  };
  function positionsCount() { return fixture.mesh.positions.length / 3; }
</script>`),
  );

  const server = createServer((request, response) => {
    const bytes = routes.get(new URL(request.url ?? "/", "http://localhost").pathname);
    response.writeHead(bytes ? 200 : 404, {
      "Content-Type":
        request.url === "/scene.json"
          ? "application/json"
          : request.url === "/"
            ? "text/html"
            : "application/javascript",
      "Cache-Control": "no-store",
    });
    response.end(bytes ?? "Missing fixture");
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  assert(address && typeof address !== "string");
  const gpu = process.platform === "darwin" ? "metal" : "swiftshader";
  const browser = await chromium.launch({
    headless: true,
    args: ["--mute-audio", `--use-angle=${gpu}`, "--ignore-gpu-blocklist"],
  });
  try {
    const page = await browser.newPage({
      viewport: { width: 1120, height: 760 },
      deviceScaleFactor: 1,
    });
    const errors: string[] = [];
    page.on("pageerror", (error) => errors.push(error.message));
    await page.goto(`http://127.0.0.1:${address.port}/`, { waitUntil: "networkidle" });
    await page.waitForFunction(
      () =>
        typeof (window as unknown as { runTerrainNormalsProof?: unknown })
          .runTerrainNormalsProof === "function",
    );
    const result = await page.evaluate(() =>
      (
        window as unknown as {
          runTerrainNormalsProof: () => BrowserProof;
        }
      ).runTerrainNormalsProof(),
    );
    assert(
      result.rejected,
      "Restoring the central-difference normals must fail the actual incident predicate",
    );
    assert(result.restoredBytes, "The repaired normal buffer must restore byte-for-byte");
    assert.equal(result.geometriesAfterDispose, 0, "The adapter-owned geometry must be disposed");
    for (const view of ["normal", "lit"] as const) {
      assert(
        result.baseline[view].visiblePixels > 1000,
        `${view} capture must contain visible geometry`,
      );
      assert(result.baseline[view].drawCalls > 0, `${view} capture must submit geometry`);
      assert.notEqual(
        result.baseline[view].image,
        result.fault[view].image,
        `${view} view must visibly change when the fallback is omitted`,
      );
      assert.equal(
        result.baseline[view].image,
        result.restored[view].image,
        `${view} view must restore exactly`,
      );
    }
    if (gpu === "metal") {
      assert.match(result.renderer, /metal/i, "macOS proof requires the observed Metal renderer");
      assert.doesNotMatch(result.renderer, /swiftshader|llvmpipe/i);
    }
    assert.deepEqual(errors, []);
    assert.deepEqual(await snapshotBuildInputs(root), inputs);
    assert.deepEqual(await snapshotBuiltArtifacts(root), artifacts);

    const directory = path.join(root, "test-results/terrain-normals");
    await mkdir(directory, { recursive: true });
    for (const state of ["baseline", "fault", "restored"] as const) {
      for (const view of ["normal", "lit"] as const) {
        await writeFile(
          path.join(directory, `${view}-${state}.png`),
          Buffer.from(result[state][view].image.split(",")[1]!, "base64"),
        );
      }
    }
    await writeFile(
      path.join(directory, "receipt.json"),
      JSON.stringify(
        {
          schema: 1,
          muted: true,
          gpu,
          inputs,
          artifacts,
          fixture: { ...fixture, oldNormals: hashBytes(oldNormals), repaired },
          fixtureFiles: {
            "tests/terrain-normals.playwright.ts": sourceHash(
              root,
              "tests/terrain-normals.playwright.ts",
            ),
            "tests/playwright.terrain-normals.config.ts": sourceHash(
              root,
              "tests/playwright.terrain-normals.config.ts",
            ),
          },
          scene: hashBytes(scene),
          captures: {
            baseline: hashesForCapture(result.baseline),
            fault: hashesForCapture(result.fault),
            restored: hashesForCapture(result.restored),
          },
          renderer: result.renderer,
          vertices: result.vertices,
          triangles: result.triangles,
          repaired: result.repaired,
        },
        null,
        2,
      ),
    );
  } finally {
    await browser.close();
    await new Promise<void>((resolve, reject) =>
      server.close((error) => (error ? reject(error) : resolve())),
    );
  }
});
