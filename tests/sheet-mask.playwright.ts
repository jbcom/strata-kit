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
  // @ts-expect-error The shared ESM receipt helper has no declaration file.
} from "../scripts/proof-inputs.mjs";

const selectedIndices = [0, 4, 1, 1, 4, 5, 2, 6, 3, 3, 6, 7, 5, 9, 6, 6, 9, 10];

function pngBytes(dataUrl: string): Buffer {
  return Buffer.from(dataUrl.slice(dataUrl.indexOf(",") + 1), "base64");
}

function assertRetainedIndices(indices: readonly number[]): void {
  assert.deepEqual(indices, selectedIndices, "Selected cells must retain exact row-major indices");
}

function assertGeometryMemoryRestored(baseline: number, actual: number): void {
  assert.equal(actual, baseline, "Disposal must restore renderer geometry memory");
}

test("sampled sheet openings reject ignored masks and undisposed Three geometry", async () => {
  const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
  const fixtureInputs = Object.fromEntries(
    ["tests/sheet-mask.playwright.ts", "tests/playwright.sheet-mask.config.ts"].map((file) => [
      file,
      createHash("sha256")
        .update(readFileSync(path.join(root, file)))
        .digest("hex"),
    ]),
  );
  const inputs = await snapshotBuildInputs(root);
  assert("src/mesh.ts" in inputs.files, "Build receipt must bind the sheet source");
  assert("src/three.ts" in inputs.files, "Build receipt must bind the Three adapter source");
  execFileSync("pnpm", ["run", "build"], { cwd: root, stdio: "inherit" });
  assert.deepEqual(await snapshotBuildInputs(root), inputs);
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
<style>body{margin:0;background:#17202b}canvas{display:block}</style>
<script type="importmap">{"imports":{"three":"/three.module.js"}}</script>
<script type="module">
import * as THREE from 'three';
import {createSheetMesh} from '/dist/index.js';
import {createThreeMeshGeometry} from '/dist/three.js';

const selected=(column,row)=>(column===0&&row===0)||(column===2&&row===0)||(column===1&&row===1);
const renderer=new THREE.WebGLRenderer({antialias:false,preserveDrawingBuffer:true});
const context=renderer.getContext(),debug=context.getExtension('WEBGL_debug_renderer_info');
const observedRenderer=String(context.getParameter(debug?debug.UNMASKED_RENDERER_WEBGL:context.RENDERER));
renderer.setSize(640,480);renderer.setClearColor('#17202b');document.body.append(renderer.domElement);
const scene=new THREE.Scene();const camera=new THREE.PerspectiveCamera(35,640/480,.001,1000);
camera.position.set(0,10,0);camera.up.set(0,0,-1);camera.lookAt(0,0,0);camera.updateProjectionMatrix();
const material=()=>new THREE.MeshNormalMaterial({side:THREE.DoubleSide});
function capture(mesh){
  renderer.info.reset();scene.add(mesh);renderer.render(scene,camera);scene.remove(mesh);
  const error=context.getError();if(error)throw Error('GL error '+error);
  return {png:renderer.domElement.toDataURL('image/png'),calls:renderer.info.render.calls,triangles:renderer.info.render.triangles};
}
function disposeEvents(geometry,meshMaterial){
  const events={geometry:false,material:false};
  geometry.addEventListener('dispose',()=>events.geometry=true);
  meshMaterial.addEventListener('dispose',()=>events.material=true);
  return events;
}
window.runSheetMaskProof=()=>{
  const clear=capture(new THREE.Group());
  const sampleOptions={width:6,height:4,columns:4,rows:3,heightAt:(u,v)=>.2*Math.sin(u*Math.PI)*Math.cos(v*Math.PI),includeCell:selected};
  const sampled=createSheetMesh(sampleOptions);
  const full=createSheetMesh({...sampleOptions,includeCell:()=>true});
  const empty=createSheetMesh({...sampleOptions,includeCell:()=>false});
  const geometry=createThreeMeshGeometry(sampled),selectedMaterial=material(),mesh=new THREE.Mesh(geometry,selectedMaterial);
  const selectedEvents=disposeEvents(geometry,selectedMaterial);
  const baseline=capture(mesh);
  const baselineGeometries=renderer.info.memory.geometries;
  const faultData={positions:sampled.positions,normals:sampled.normals,uvs:sampled.uvs,indices:full.indices};
  const faultGeometry=createThreeMeshGeometry(faultData),faultMaterial=material(),faultMesh=new THREE.Mesh(faultGeometry,faultMaterial);
  const maskFault=capture(faultMesh);faultGeometry.dispose();faultMaterial.dispose();
  const restored=capture(mesh);
  const emptyGeometry=createThreeMeshGeometry(empty),emptyMaterial=material(),emptyMesh=new THREE.Mesh(emptyGeometry,emptyMaterial);
  const emptyEvents=disposeEvents(emptyGeometry,emptyMaterial);
  const emptyRender=capture(emptyMesh);emptyGeometry.dispose();emptyMaterial.dispose();
  const leakGeometry=createThreeMeshGeometry(sampled),leakMaterial=material(),leakMesh=new THREE.Mesh(leakGeometry,leakMaterial);
  const leakEvents=disposeEvents(leakGeometry,leakMaterial);
  capture(leakMesh);const geometriesWithoutDispose=renderer.info.memory.geometries,leakBeforeDispose={...leakEvents};
  leakGeometry.dispose();leakMaterial.dispose();const geometriesAfterLeakRestore=renderer.info.memory.geometries;
  geometry.dispose();selectedMaterial.dispose();
  return {
    baseline,maskFault,restored,emptyRender,clear,
    indices:Array.from(sampled.indices),maskFaultIndices:Array.from(faultData.indices),fullIndexCount:full.indices.length,
    sampledVertices:sampled.positions.length/3,emptyIndexCount:empty.indices.length,
    emptyPositionCount:emptyGeometry.getAttribute('position').count,emptyNormalCount:emptyGeometry.getAttribute('normal').count,emptyUvCount:emptyGeometry.getAttribute('uv').count,
    selectedEvents,emptyEvents,leakEvents,leakBeforeDispose,baselineGeometries,geometriesWithoutDispose,geometriesAfterLeakRestore,
    geometriesAfterDispose:renderer.info.memory.geometries,observedRenderer,
  };
};
</script>`),
  );

  const server = createServer((request, response) => {
    const bytes = routes.get(request.url ?? "");
    response.writeHead(bytes ? 200 : 404, {
      "Content-Type": request.url === "/" ? "text/html" : "application/javascript",
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
    const page = await browser.newPage();
    const errors: string[] = [];
    page.on("pageerror", (error) => errors.push(error.message));
    await page.goto(`http://127.0.0.1:${address.port}/`);
    await page.waitForFunction(
      () =>
        typeof (window as unknown as { runSheetMaskProof?: unknown }).runSheetMaskProof ===
        "function",
    );
    const result = await page.evaluate(() =>
      (
        window as unknown as {
          runSheetMaskProof: () => {
            baseline: { png: string; calls: number; triangles: number };
            maskFault: { png: string; calls: number; triangles: number };
            restored: { png: string; calls: number; triangles: number };
            emptyRender: { png: string; calls: number; triangles: number };
            clear: { png: string; calls: number; triangles: number };
            indices: number[];
            maskFaultIndices: number[];
            fullIndexCount: number;
            sampledVertices: number;
            emptyIndexCount: number;
            emptyPositionCount: number;
            emptyNormalCount: number;
            emptyUvCount: number;
            selectedEvents: { geometry: boolean; material: boolean };
            emptyEvents: { geometry: boolean; material: boolean };
            leakEvents: { geometry: boolean; material: boolean };
            leakBeforeDispose: { geometry: boolean; material: boolean };
            baselineGeometries: number;
            geometriesWithoutDispose: number;
            geometriesAfterLeakRestore: number;
            geometriesAfterDispose: number;
            observedRenderer: string;
          };
        }
      ).runSheetMaskProof(),
    );
    assertRetainedIndices(result.indices);
    assert.equal(result.sampledVertices, 12, "Cell selection must retain all sampled vertices");
    assert.equal(result.fullIndexCount, 36, "Mask-ignored control must restore every cell index");
    assert.equal(
      result.baseline.triangles,
      6,
      "Selected cells must render their six retained triangles",
    );
    assert.equal(
      result.maskFault.triangles,
      12,
      "Mask-ignored control must render all grid triangles",
    );
    let maskFaultRejection = "";
    try {
      assertRetainedIndices(result.maskFaultIndices);
    } catch (error) {
      maskFaultRejection = error instanceof Error ? error.message : String(error);
    }
    assert(maskFaultRejection, "Mask-ignored control must fail retained-index acceptance");
    assert.notEqual(
      result.baseline.png,
      result.maskFault.png,
      "Mask-ignored fault must alter the canvas",
    );
    assert.equal(
      result.baseline.png,
      result.restored.png,
      "Opening render must restore byte-for-byte",
    );
    assert.equal(result.emptyIndexCount, 0, "All-false mask must retain an empty index buffer");
    assert.equal(result.emptyPositionCount, 12);
    assert.equal(result.emptyNormalCount, 12);
    assert.equal(result.emptyUvCount, 12);
    // Three may submit a zero-count draw; the surface must emit no primitives or pixels.
    assert.equal(
      result.emptyRender.png,
      result.clear.png,
      "All-false surface must leave the clear canvas unchanged",
    );
    assert.equal(result.emptyRender.triangles, 0, "All-false geometry must draw no triangles");
    assert.deepEqual(result.selectedEvents, { geometry: true, material: true });
    assert.deepEqual(result.emptyEvents, { geometry: true, material: true });
    let disposalFaultRejection = "";
    try {
      assertGeometryMemoryRestored(result.baselineGeometries, result.geometriesWithoutDispose);
    } catch (error) {
      disposalFaultRejection = error instanceof Error ? error.message : String(error);
    }
    assert(disposalFaultRejection, "Omitted disposal must fail resource acceptance");
    assert.deepEqual(result.leakBeforeDispose, { geometry: false, material: false });
    assert.deepEqual(result.leakEvents, { geometry: true, material: true });
    assertGeometryMemoryRestored(result.baselineGeometries, result.geometriesAfterLeakRestore);
    assert.equal(result.geometriesAfterDispose, 0, "All uploaded geometry must be disposed");
    if (gpu === "metal") {
      assert.match(result.observedRenderer, /metal/i, "Observed renderer must be Metal on macOS");
      assert.doesNotMatch(result.observedRenderer, /swiftshader|llvmpipe/i);
    } else {
      assert.match(result.observedRenderer, /swiftshader/i, "Linux fixture must use SwiftShader");
    }
    assert.deepEqual(errors, [], "Fixture must have no page errors");

    const directory = path.join(root, "test-results", "sheet-mask");
    await mkdir(directory, { recursive: true });
    const hashes: Record<string, string> = {};
    for (const [name, image] of Object.entries({
      baseline: result.baseline.png,
      "mask-ignored": result.maskFault.png,
      restored: result.restored.png,
      empty: result.emptyRender.png,
    })) {
      const bytes = pngBytes(image);
      await writeFile(path.join(directory, `${name}.png`), bytes);
      hashes[name] = createHash("sha256").update(bytes).digest("hex");
    }
    assert.deepEqual(await snapshotBuildInputs(root), inputs);
    assert.deepEqual(await snapshotBuiltArtifacts(root), artifacts);
    assert.deepEqual(
      Object.fromEntries(
        Object.keys(fixtureInputs).map((file) => [
          file,
          createHash("sha256")
            .update(readFileSync(path.join(root, file)))
            .digest("hex"),
        ]),
      ),
      fixtureInputs,
      "Fixture inputs changed during proof",
    );
    await writeFile(
      path.join(directory, "receipt.json"),
      JSON.stringify(
        {
          schema: 1,
          muted: true,
          kind: "headless-sampled-sheet-opening-proof",
          gpu,
          candidate: {
            meshSourceSha256: inputs.files["src/mesh.ts"],
            threeAdapterSourceSha256: inputs.files["src/three.ts"],
          },
          inputs,
          fixtureInputs,
          artifacts,
          retainedIndices: result.indices,
          empty: {
            indexCount: result.emptyIndexCount,
            vertexCount: result.emptyPositionCount,
            calls: result.emptyRender.calls,
            triangles: result.emptyRender.triangles,
          },
          controls: {
            maskIgnoredRejected: maskFaultRejection,
            disposalFaultRejected: disposalFaultRejection,
          },
          restored: {
            canvasHash: hashes.restored,
            geometriesAfterDispose: result.geometriesAfterDispose,
          },
          observedRenderer: result.observedRenderer,
          captures: hashes,
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
