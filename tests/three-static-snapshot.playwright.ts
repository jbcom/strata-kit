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
  snapshotBuildInputs,
  snapshotBuiltArtifacts,
} from "../scripts/proof-inputs.mjs";

interface Capture {
  readonly png: string;
  readonly calls: number;
  readonly triangles: number;
}

interface BrowserProof {
  readonly baseline: Capture;
  readonly normalFault: Capture;
  readonly reflectionFault: Capture;
  readonly restored: Capture;
  readonly inverseTransposeRejected: boolean;
  readonly reflectionRejected: boolean;
  readonly restoredBytes: boolean;
  readonly atlasCoverage: number;
  readonly uvVertices: number;
  readonly renderer: string;
  readonly geometriesAfterDispose: number;
}

function pngBytes(dataUrl: string): Buffer {
  return Buffer.from(dataUrl.slice(dataUrl.indexOf(",") + 1), "base64");
}

test("static Three snapshots render transformed normals, reflections, and a baked UV atlas", async () => {
  const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
  const fixtureFiles = [
    "tests/three-static-snapshot.playwright.ts",
    "tests/playwright.three-static-snapshot.config.ts",
  ];
  const fixtureInputs = Object.fromEntries(
    fixtureFiles.map((file) => [
      file,
      createHash("sha256")
        .update(readFileSync(path.join(root, file)))
        .digest("hex"),
    ]),
  );
  const inputs = await snapshotBuildInputs(root);
  assert("src/threeSnapshot.ts" in inputs.files, "Proof must bind the static snapshot source");
  execFileSync("pnpm", ["run", "build"], { cwd: root, stdio: "inherit" });
  assert.deepEqual(await snapshotBuildInputs(root), inputs, "Build must not modify its inputs");
  await assertEmbeddedSources(root, inputs);
  const artifacts = await snapshotBuiltArtifacts(root);
  const routes = new Map<string, Buffer>();
  for (const file of readdirSync(path.join(root, "dist"))) {
    if (file.endsWith(".js"))
      routes.set(`/dist/${file}`, readFileSync(path.join(root, "dist", file)));
  }
  for (const file of ["three.module.js", "three.core.js"]) {
    routes.set(`/${file}`, readFileSync(path.join(root, "node_modules/three/build", file)));
  }
  routes.set(
    "/",
    Buffer.from(`<!doctype html><meta charset="utf-8">
<style>html,body,canvas{margin:0;width:100%;height:100%;display:block;background:#10151d}</style>
<canvas></canvas><script type="importmap">{"imports":{"three":"/three.module.js"}}</script>
<script type="module">
  import * as THREE from "three";
  import { snapshotThreeStaticMeshes, createThreeMeshGeometry } from "/dist/three.js";
  import { bakeUvAtlas } from "/dist/index.js";
  const canvas = document.querySelector("canvas");
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, preserveDrawingBuffer: true });
  renderer.setSize(960, 720, false); renderer.setPixelRatio(1); renderer.setClearColor(0x10151d, 1);
  const gl = renderer.getContext(), debug = gl.getExtension("WEBGL_debug_renderer_info");
  const rendererName = String(gl.getParameter(debug ? debug.UNMASKED_RENDERER_WEBGL : gl.RENDERER));
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(35, 960 / 720, 0.01, 100);
  camera.position.set(0, 0, 7); camera.lookAt(0, 0, 0);
  function geometry(positions, indices, normals, uvs) {
    const value = new THREE.BufferGeometry();
    value.setAttribute("position", new THREE.BufferAttribute(new Float32Array(positions), 3));
    if (normals) value.setAttribute("normal", new THREE.BufferAttribute(new Float32Array(normals), 3));
    if (uvs) value.setAttribute("uv", new THREE.BufferAttribute(new Float32Array(uvs), 2));
    value.setIndex(new THREE.BufferAttribute(new Uint16Array(indices), 1)); return value;
  }
  function crossZ(snapshot) {
    const i = snapshot.indices, p = snapshot.positions, a = i[0] * 3, b = i[1] * 3, c = i[2] * 3;
    return (p[b] - p[a]) * (p[c + 1] - p[a + 1]) - (p[b + 1] - p[a + 1]) * (p[c] - p[a]);
  }
  function capture() {
    renderer.render(scene, camera); if (gl.getError() !== gl.NO_ERROR) throw Error("GL error");
    return { png: canvas.toDataURL("image/png"), calls: renderer.info.render.calls, triangles: renderer.info.render.triangles };
  }
  window.runStaticSnapshotProof = () => {
    const source = new THREE.Group(); source.position.set(11, -4, 3); source.rotation.z = 0.17;
    const normalGroup = new THREE.Group(); normalGroup.position.set(-1.5, .65, 0); normalGroup.rotation.z = .55; normalGroup.scale.set(1.7, .55, 1);
    const authoredNormal = new THREE.Vector3(Math.SQRT1_2, Math.SQRT1_2, 0);
    const normalMesh = new THREE.Mesh(geometry([-1,-.8,0, 1,-.8,0, 0,1,0], [0,1,2], [authoredNormal.x,authoredNormal.y,0, authoredNormal.x,authoredNormal.y,0, authoredNormal.x,authoredNormal.y,0]), new THREE.MeshBasicMaterial());
    normalMesh.name = "inverse-transpose"; normalGroup.add(normalMesh); source.add(normalGroup);
    const reflected = new THREE.Mesh(geometry([-0.7,-.7,0, .7,-.7,0, 0,.8,0], [0,1,2]), new THREE.MeshBasicMaterial());
    reflected.name = "reflected"; reflected.position.set(1.55, .75, 0); reflected.scale.set(-1, 1, 1); source.add(reflected);
    const atlasPositions = [-1,-.7,0, 0,-.7,0, 0,.7,0, -1,.7,0, 0,-.7,0, 1,-.7,0, 1,.7,0, 0,.7,0];
    const atlasMesh = new THREE.Mesh(geometry(atlasPositions, [0,1,2,0,2,3,4,5,6,4,6,7], undefined, [0,0,.5,0,.5,1,0,1,.5,0,1,0,1,1,.5,1]), new THREE.MeshBasicMaterial());
    atlasMesh.name = "atlas-seam"; atlasMesh.position.set(0, -1.35, 0); source.add(atlasMesh);
    source.updateWorldMatrix(true, true);
    const snapshots = snapshotThreeStaticMeshes(source);
    const byName = new Map(snapshots.map((entry) => [entry.name, entry]));
    const transformed = byName.get("inverse-transpose"), reflection = byName.get("reflected"), atlas = byName.get("atlas-seam");
    if (!transformed || !reflection || !atlas || !atlas.uvs) throw Error("snapshot contents missing");
    const expectedNormal = authoredNormal.clone().applyMatrix3(new THREE.Matrix3().getNormalMatrix(normalGroup.matrix)).normalize();
    const verifyInverseTranspose = () => {
      const actual = new THREE.Vector3(transformed.normals[0], transformed.normals[1], transformed.normals[2]);
      if (Math.abs(actual.length() - 1) > 1e-6 || actual.dot(expectedNormal) < .999999) throw Error("inverse transpose mismatch");
    };
    const verifyReflection = () => { if (!(crossZ(reflection) > 0)) throw Error("reflected winding faces away"); };
    verifyInverseTranspose(); verifyReflection();
    const atlasBake = bakeUvAtlas(atlas, { sample: (u, v) => ({ color: u < 0 ? [55, 125, 245, 255] : [238, 106, 54, 255], roughness: .76, bump: 0 }) }, { width: 64, height: 64, padding: 1 });
    const texture = new THREE.DataTexture(atlasBake.color, atlasBake.width, atlasBake.height, THREE.RGBAFormat, THREE.UnsignedByteType);
    texture.colorSpace = THREE.SRGBColorSpace; texture.needsUpdate = true;
    const normalGeometry = createThreeMeshGeometry(transformed), reflectionGeometry = createThreeMeshGeometry(reflection), atlasGeometry = createThreeMeshGeometry(atlas);
    const normalMaterial = new THREE.MeshNormalMaterial(), reflectionMaterial = new THREE.MeshBasicMaterial({ color: 0xff7d50 }), atlasMaterial = new THREE.MeshBasicMaterial({ map: texture });
    const normalSurface = new THREE.Mesh(normalGeometry, normalMaterial), reflectionSurface = new THREE.Mesh(reflectionGeometry, reflectionMaterial), atlasSurface = new THREE.Mesh(atlasGeometry, atlasMaterial);
    scene.add(normalSurface, reflectionSurface, atlasSurface);
    const events = { normal: false, reflection: false, atlas: false };
    normalGeometry.addEventListener("dispose", () => events.normal = true); reflectionGeometry.addEventListener("dispose", () => events.reflection = true); atlasGeometry.addEventListener("dispose", () => events.atlas = true);
    const savedNormals = transformed.normals.slice(), savedReflection = reflection.indices.slice();
    const baseline = capture();
    const naive = authoredNormal.clone().applyMatrix3(new THREE.Matrix3().setFromMatrix4(normalGroup.matrix)).normalize();
    for (let offset = 0; offset < transformed.normals.length; offset += 3) transformed.normals.set([naive.x, naive.y, naive.z], offset);
    normalGeometry.getAttribute("normal").needsUpdate = true;
    let inverseTransposeRejected = false;
    try { verifyInverseTranspose(); } catch (error) { inverseTransposeRejected = error.message === "inverse transpose mismatch"; }
    const normalFault = capture();
    transformed.normals.set(savedNormals); normalGeometry.getAttribute("normal").needsUpdate = true; verifyInverseTranspose();
    [reflection.indices[1], reflection.indices[2]] = [reflection.indices[2], reflection.indices[1]];
    reflectionGeometry.getIndex().needsUpdate = true;
    let reflectionRejected = false;
    try { verifyReflection(); } catch (error) { reflectionRejected = error.message === "reflected winding faces away"; }
    const reflectionFault = capture();
    reflection.indices.set(savedReflection); reflectionGeometry.getIndex().needsUpdate = true;
    verifyInverseTranspose(); verifyReflection();
    const restored = capture();
    const restoredBytes = transformed.normals.every((value, index) => Object.is(value, savedNormals[index])) && reflection.indices.every((value, index) => value === savedReflection[index]);
    scene.remove(normalSurface, reflectionSurface, atlasSurface);
    normalGeometry.dispose(); reflectionGeometry.dispose(); atlasGeometry.dispose(); normalMaterial.dispose(); reflectionMaterial.dispose(); atlasMaterial.dispose(); texture.dispose();
    return { baseline, normalFault, reflectionFault, restored, inverseTransposeRejected, reflectionRejected, restoredBytes, atlasCoverage: atlasBake.covered, uvVertices: atlas.uvs.length / 2, renderer: rendererName, geometriesAfterDispose: renderer.info.memory.geometries, events };
  };
</script>`),
  );
  const server = createServer((request, response) => {
    const bytes = routes.get(new URL(request.url ?? "/", "http://localhost").pathname);
    response.writeHead(bytes ? 200 : 404, {
      "Content-Type": request.url === "/" ? "text/html" : "application/javascript",
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
      viewport: { width: 960, height: 720 },
      deviceScaleFactor: 1,
    });
    const errors: string[] = [];
    page.on("pageerror", (error) => errors.push(error.message));
    await page.goto(`http://127.0.0.1:${address.port}/`, { waitUntil: "networkidle" });
    await page.waitForFunction(
      () =>
        typeof (window as unknown as { runStaticSnapshotProof?: unknown })
          .runStaticSnapshotProof === "function",
    );
    const result = await page.evaluate(() =>
      (
        window as unknown as { runStaticSnapshotProof: () => BrowserProof }
      ).runStaticSnapshotProof(),
    );
    assert(
      result.inverseTransposeRejected,
      "Naive transformed normals must fail the inverse-transpose predicate",
    );
    assert(
      result.reflectionRejected,
      "Uncorrected reflected winding must fail the outward-face predicate",
    );
    assert(
      result.restoredBytes,
      "Snapshot copies must restore byte-for-byte after injected defects",
    );
    assert(result.atlasCoverage > 0.9, "Snapshot UVs must produce a substantial baked atlas");
    assert.equal(result.uvVertices, 8, "The UV seam must retain split atlas vertices");
    assert.equal(result.baseline.calls, 3, "Every snapshot surface must render");
    assert.notEqual(
      result.baseline.png,
      result.normalFault.png,
      "Injected normal transform defect must alter the canvas",
    );
    assert.notEqual(
      result.baseline.png,
      result.reflectionFault.png,
      "Injected reflected winding defect must alter the canvas",
    );
    assert.equal(
      result.normalFault.calls,
      result.baseline.calls,
      "Normal fault must not hide other snapshots",
    );
    assert.equal(
      result.baseline.png,
      result.restored.png,
      "Restored snapshot buffers must restore the canvas exactly",
    );
    assert.equal(result.geometriesAfterDispose, 0, "Adapter-created geometries must be disposed");
    if (gpu === "metal") {
      assert.match(result.renderer, /metal/i, "macOS proof requires observed Metal");
      assert.doesNotMatch(result.renderer, /swiftshader|llvmpipe/i);
    } else
      assert.match(result.renderer, /swiftshader/i, "Linux proof must use explicit SwiftShader");
    assert.deepEqual(errors, []);
    const directory = path.join(root, "test-results", "three-static-snapshot");
    await mkdir(directory, { recursive: true });
    const hashes: Record<string, string> = {};
    for (const [name, png] of Object.entries({
      baseline: result.baseline.png,
      "normal-fault": result.normalFault.png,
      "reflection-fault": result.reflectionFault.png,
      restored: result.restored.png,
    })) {
      const bytes = pngBytes(png);
      await writeFile(path.join(directory, `${name}.png`), bytes);
      hashes[name] = createHash("sha256").update(bytes).digest("hex");
    }
    assert.deepEqual(await snapshotBuildInputs(root), inputs);
    assert.deepEqual(await snapshotBuiltArtifacts(root), artifacts);
    assert.deepEqual(
      Object.fromEntries(
        fixtureFiles.map((file) => [
          file,
          createHash("sha256")
            .update(readFileSync(path.join(root, file)))
            .digest("hex"),
        ]),
      ),
      fixtureInputs,
    );
    await writeFile(
      path.join(directory, "receipt.json"),
      JSON.stringify(
        {
          schema: 1,
          muted: true,
          kind: "static-three-snapshot",
          gpu,
          inputs,
          artifacts,
          hashes,
          renderer: result.renderer,
          atlasCoverage: result.atlasCoverage,
          uvVertices: result.uvVertices,
          triangles: result.baseline.triangles,
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
