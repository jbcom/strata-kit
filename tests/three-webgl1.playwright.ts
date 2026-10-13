import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { createServer } from "node:http";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { expect, test } from "@playwright/test";

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const npm = process.platform === "win32" ? "npm.cmd" : "npm";

interface PackedFixture {
  readonly directory: string;
  readonly close: () => void;
}

interface RenderResult {
  readonly available: boolean;
  readonly version?: string;
  readonly glError?: number;
  readonly thrown?: string;
  readonly pixels?: number[];
  readonly png?: string;
}

interface ThreeWebgl1AvailableResult {
  readonly available: true;
  readonly revision: string;
  readonly availabilityVersion: string;
  readonly wrong: { readonly format: number; readonly render: RenderResult };
  readonly restored: {
    readonly format: number;
    readonly beforeBytes: number[];
    readonly bytes: number[];
    readonly render: RenderResult;
  };
}

interface ThreeWebgl1UnavailableResult {
  readonly available: false;
  readonly reason: string;
}

type ThreeWebgl1Result = ThreeWebgl1AvailableResult | ThreeWebgl1UnavailableResult;

declare global {
  interface Window {
    __threeWebgl1?: ThreeWebgl1Result;
  }
}

function command(commandName: string, args: string[], cwd: string): string {
  try {
    return execFileSync(commandName, args, {
      cwd,
      encoding: "utf8",
      stdio: "pipe",
      env: {
        ...Object.fromEntries(
          Object.entries(process.env).filter(
            ([key]) => !key.toLowerCase().startsWith("npm_config_"),
          ),
        ),
      },
    });
  } catch (error) {
    const failure = error as { stderr?: string; stdout?: string; message: string };
    throw new Error(
      `${commandName} ${args.join(" ")} failed: ${failure.stderr ?? failure.stdout ?? failure.message}`,
    );
  }
}

function createPackedR152Fixture(): PackedFixture {
  command("pnpm", ["run", "build"], root);
  const packDirectory = mkdtempSync(path.join(tmpdir(), "strata-procedural-webgl1-pack-"));
  const fixtureDirectory = mkdtempSync(path.join(tmpdir(), "strata-procedural-webgl1-r152-"));
  try {
    const output = command(
      npm,
      ["pack", "--ignore-scripts", "--json", "--pack-destination", packDirectory],
      root,
    );
    const [manifest] = JSON.parse(output) as Array<{ filename?: string }>;
    assert(manifest?.filename, "npm pack did not produce a package archive");
    const tarball = path.join(packDirectory, manifest.filename);
    writeFileSync(
      path.join(fixtureDirectory, "package.json"),
      '{"private":true,"type":"module"}\n',
    );
    command(
      npm,
      [
        "install",
        "--no-audit",
        "--no-fund",
        "--omit=optional",
        tarball,
        "three@0.152.0",
      ],
      fixtureDirectory,
    );
    return {
      directory: fixtureDirectory,
      close: () => {
        rmSync(packDirectory, { recursive: true, force: true });
        rmSync(fixtureDirectory, { recursive: true, force: true });
      },
    };
  } catch (error) {
    rmSync(packDirectory, { recursive: true, force: true });
    rmSync(fixtureDirectory, { recursive: true, force: true });
    throw error;
  }
}

async function startFixtureServer(
  fixture: PackedFixture,
): Promise<{ url: string; close: () => Promise<void> }> {
  const threeModule = path.join(
    fixture.directory,
    "node_modules",
    "three",
    "build",
    "three.module.js",
  );
  const adapterModule = path.join(
    fixture.directory,
    "node_modules",
    "strata-procedural",
    "dist",
    "three.js",
  );
  const html = `<!doctype html>
<meta charset="utf-8">
<script type="importmap">{"imports":{"three":"/three.module.js"}}</script>
<script type="module">
  import * as THREE from "/three.module.js";
  import { createThreeSurfaceTextures } from "/strata-three.js";

  const bake = {
    width: 2,
    height: 2,
    color: new Uint8Array([220, 120, 40, 255, 180, 90, 20, 255, 40, 80, 160, 255, 20, 40, 80, 255]),
    roughness: new Uint8Array([96, 128, 160, 192]),
    bump: new Uint8Array([16, 80, 176, 240]),
    metalness: new Uint8Array([0, 64, 128, 255]),
  };

  function render(texture, retainCanvas = false) {
    const canvas = document.createElement("canvas");
    canvas.width = 64;
    canvas.height = 64;
    document.body.append(canvas);
    const gl = canvas.getContext("webgl", { antialias: false, preserveDrawingBuffer: true });
    if (!gl) return { available: false };
    const renderer = new THREE.WebGLRenderer({ canvas, context: gl, antialias: false });
    if (renderer.capabilities.isWebGL2) throw new Error("The regression must use a forced WebGL1 context");
    renderer.setClearColor(0x000000, 1);
    const scene = new THREE.Scene();
    scene.add(new THREE.HemisphereLight(0xffffff, 0x202020, 2));
    const camera = new THREE.PerspectiveCamera(45, 1, 0.1, 10);
    camera.position.set(0, 0, 2);
    camera.lookAt(0, 0, 0);
    const material = new THREE.MeshStandardMaterial({
      color: 0xffffff,
      map: texture.map,
      roughnessMap: texture.roughnessMap,
      roughness: 0.5,
      bumpMap: texture.bumpMap,
      bumpScale: 0.2,
      metalnessMap: texture.metalnessMap,
      metalness: 0.5,
    });
    const geometry = new THREE.PlaneGeometry(1.6, 1.6, 2, 2);
    scene.add(new THREE.Mesh(geometry, material));
    let thrown;
    try {
      renderer.render(scene, camera);
    } catch (error) {
      thrown = String(error);
    }
    const glError = gl.getError();
    const pixels = new Uint8Array(canvas.width * canvas.height * 4);
    if (!thrown && glError === gl.NO_ERROR) gl.readPixels(0, 0, canvas.width, canvas.height, gl.RGBA, gl.UNSIGNED_BYTE, pixels);
    const png = !thrown && glError === gl.NO_ERROR ? canvas.toDataURL("image/png") : undefined;
    geometry.dispose();
    material.dispose();
    renderer.dispose();
    if (!retainCanvas) canvas.remove();
    return {
      available: true,
      version: gl.getParameter(gl.VERSION),
      glError,
      thrown,
      pixels: Array.from(pixels),
      png,
    };
  }

  const availabilityCanvas = document.createElement("canvas");
  const availability = availabilityCanvas.getContext("webgl", { antialias: false, preserveDrawingBuffer: true });
  if (!availability) {
    window.__threeWebgl1 = { available: false, reason: "canvas.getContext(webgl) returned null" };
  } else {
    const restored = createThreeSurfaceTextures(bake);
    const originalBumpBytes = Uint8Array.from(restored.bumpMap.image.data);
    const originalFormat = restored.bumpMap.format;
    // This is the exact old adapter representation: a one-channel RedFormat texture.
    restored.bumpMap.format = THREE.RedFormat;
    restored.bumpMap.image.data = Uint8Array.from(bake.bump);
    restored.bumpMap.needsUpdate = true;
    const wrongFormat = restored.bumpMap.format;
    const wrong = render(restored);
    // Recover the packed adapter result byte-for-byte before the proving render.
    restored.bumpMap.format = originalFormat;
    restored.bumpMap.image.data = originalBumpBytes;
    restored.bumpMap.needsUpdate = true;
    const correct = render(restored, true);
    const restoredBumpBytes = Array.from(restored.bumpMap.image.data);
    const restoredFormat = restored.bumpMap.format;
    restored.dispose();
    window.__threeWebgl1 = {
      available: true,
      revision: THREE.REVISION,
      availabilityVersion: availability.getParameter(availability.VERSION),
      wrong: { format: wrongFormat, render: wrong },
      restored: {
        format: restoredFormat,
        beforeBytes: Array.from(originalBumpBytes),
        bytes: restoredBumpBytes,
        render: correct,
      },
    };
  }
</script>`;
  const server = createServer((request, response) => {
    const pathname = new URL(request.url ?? "/", "http://localhost").pathname;
    if (pathname === "/") {
      response.writeHead(200, {
        "Content-Type": "text/html; charset=utf-8",
        "Cache-Control": "no-store",
      });
      response.end(html);
      return;
    }
    const file =
      pathname === "/three.module.js"
        ? threeModule
        : pathname === "/strata-three.js"
          ? adapterModule
          : undefined;
    if (!file) {
      response.writeHead(404).end("Not found");
      return;
    }
    response.writeHead(200, {
      "Content-Type": "text/javascript; charset=utf-8",
      "Cache-Control": "no-store",
    });
    response.end(readFileSync(file));
  });
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  const address = server.address();
  assert(address && typeof address !== "string", "fixture server did not expose a TCP address");
  return {
    url: `http://127.0.0.1:${address.port}`,
    close: () =>
      new Promise((resolve, reject) =>
        server.close((error) => (error ? reject(error) : resolve())),
      ),
  };
}

test("packed Three r152 adapter rejects WebGL1 RedFormat and restores RGBA bump rendering", async ({
  page,
}) => {
  const fixture = createPackedR152Fixture();
  const server = await startFixtureServer(fixture);
  try {
    await page.goto(server.url, { waitUntil: "networkidle" });
    await page.waitForFunction(() => "__threeWebgl1" in window);
    const result = await page.evaluate(async (): Promise<ThreeWebgl1Result> => {
      await new Promise((resolve) => requestAnimationFrame(resolve));
      if (!window.__threeWebgl1) throw new Error("WebGL1 fixture did not publish a result");
      return window.__threeWebgl1;
    });
    if (!result.available) throw new Error(result.reason);
    expect(result.revision).toBe("152");
    expect(result.availabilityVersion).toMatch(/^WebGL 1\.0/);
    expect(result.wrong.format).toBe(1028);
    expect(result.wrong.render.available).toBe(true);
    expect(result.wrong.render.version).toMatch(/^WebGL 1\.0/);
    expect(result.wrong.render.thrown || result.wrong.render.glError !== 0).toBeTruthy();
    expect(result.restored.format).toBe(1023);
    expect(result.restored.bytes).toEqual(result.restored.beforeBytes);
    expect(result.restored.bytes).toEqual([
      176, 176, 176, 255, 240, 240, 240, 255, 16, 16, 16, 255, 80, 80, 80, 255,
    ]);
    expect(result.restored.render.available).toBe(true);
    expect(result.restored.render.thrown).toBeUndefined();
    expect(result.restored.render.glError).toBe(0);
    const pixels = result.restored.render.pixels;
    if (!pixels) throw new Error("Corrected WebGL1 render did not return pixels");
    expect(pixels.some((value, index) => index % 4 < 3 && value > 0)).toBe(true);
    const png = result.restored.render.png;
    if (!png?.startsWith("data:image/png;base64,"))
      throw new Error("Corrected WebGL1 render did not return a PNG");
    const canvas = Buffer.from(png.slice(png.indexOf(",") + 1), "base64");
    const output = path.join(root, "test-results", "three-webgl1");
    mkdirSync(output, { recursive: true });
    writeFileSync(path.join(output, "corrected-r152-webgl1.png"), canvas);
    writeFileSync(
      path.join(output, "receipt.json"),
      `${JSON.stringify(
        {
          schema: 1,
          fixture: "packed strata-procedural consumer with three@0.152.0",
          context: result.availabilityVersion,
          rejected: {
            format: "RedFormat",
            failure: result.wrong.render.thrown ?? `GL error ${result.wrong.render.glError}`,
          },
          restored: {
            format: "RGBAFormat",
            bumpBytes: result.restored.bytes,
            canvas: {
              filename: "corrected-r152-webgl1.png",
              bytes: canvas.length,
              sha256: createHash("sha256").update(canvas).digest("hex"),
            },
          },
        },
        null,
        2,
      )}\n`,
    );
  } finally {
    await server.close();
    fixture.close();
  }
});
