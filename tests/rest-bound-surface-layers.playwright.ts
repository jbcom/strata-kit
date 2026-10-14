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
  readonly readback: string;
  readonly maps: Record<string, { color: string; roughness: string }>;
  readonly resources: { geometries: number; textures: number; programs: number };
}

interface Proof {
  readonly baseline: Capture;
  readonly changed: Capture;
  readonly restored: Capture;
  readonly independent: boolean;
  readonly flatRelief: boolean;
  readonly noMetalness: boolean;
  readonly seam: boolean;
  readonly coverage: number;
  readonly renderer: string;
  readonly resourcesBefore: { geometries: number; textures: number; programs: number };
  readonly resourcesAfterDispose: { geometries: number; textures: number; programs: number };
  readonly finalGlError: number;
}

function pngBytes(dataUrl: string): Buffer {
  return Buffer.from(dataUrl.slice(dataUrl.indexOf(",") + 1), "base64");
}

test("rest-bound UV surface maps remain isolated across posed meshes and restore exact rendered output", async () => {
  const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
  const fixtureFiles = [
    "tests/rest-bound-surface-layers.playwright.ts",
    "tests/playwright.rest-bound-surface-layers.config.ts",
  ];
  const hash = (value: Buffer) => createHash("sha256").update(value).digest("hex");
  const fixtureInputs = Object.fromEntries(
    fixtureFiles.map((file) => [file, hash(readFileSync(path.join(root, file)))]),
  );
  const inputs = await snapshotBuildInputs(root);
  execFileSync("pnpm", ["run", "build"], { cwd: root, stdio: "inherit" });
  assert.deepEqual(await snapshotBuildInputs(root), inputs);
  await assertEmbeddedSources(root, inputs);
  const artifacts = await snapshotBuiltArtifacts(root);
  const routes = new Map<string, Buffer>();
  for (const file of readdirSync(path.join(root, "dist")))
    if (file.endsWith(".js"))
      routes.set(`/dist/${file}`, readFileSync(path.join(root, "dist", file)));
  for (const file of ["three.module.js", "three.core.js"])
    routes.set(`/${file}`, readFileSync(path.join(root, "node_modules/three/build", file)));
  routes.set(
    "/",
    Buffer.from(`<!doctype html><meta charset="utf-8"><style>html,body,canvas{margin:0;width:100%;height:100%;display:block;background:#10151d}</style><canvas></canvas><script type="importmap">{"imports":{"three":"/three.module.js"}}</script><script type="module">
import * as THREE from "three";
import {bakeUvAtlas,composeSurfaceLayers,createSeededNoise} from "/dist/index.js";
import {createThreeSurfaceTextures} from "/dist/three.js";
const canvas=document.querySelector("canvas"),renderer=new THREE.WebGLRenderer({canvas,antialias:true,preserveDrawingBuffer:true});
renderer.setSize(960,720,false);renderer.setPixelRatio(1);renderer.setClearColor(0x10151d,1);renderer.outputColorSpace=THREE.SRGBColorSpace;
const gl=renderer.getContext(),debug=gl.getExtension("WEBGL_debug_renderer_info"),rendererName=String(gl.getParameter(debug?debug.UNMASKED_RENDERER_WEBGL:gl.RENDERER));
const scene=new THREE.Scene(),camera=new THREE.PerspectiveCamera(40,960/720,.01,100);camera.position.set(0,2.7,12.5);camera.lookAt(0,0,0);
scene.add(new THREE.HemisphereLight(0xdce8ff,0x1e2530,2.2));const key=new THREE.DirectionalLight(0xffe1bb,3.6);key.position.set(3,5,6);scene.add(key);
function restMesh(){return {positions:new Float32Array([0,0,0,1,0,0,1,1,0,0,1,0,1,0,0,2,0,0,2,1,0,1,1,0]),uvs:new Float32Array([0,0,.45,0,.45,1,0,1,.55,0,1,0,1,1,.55,1]),indices:new Uint16Array([0,1,2,0,2,3,4,5,6,4,6,7])};}
function pose(points,kind){const out=new Float32Array(points.length);for(let i=0;i<points.length;i+=3){const x=points[i],y=points[i+1],z=points[i+2];if(kind===1)out.set([x*.72+y*.32,y*1.08+Math.sin(x)*.22,z+x*.5],i);else out.set([x*1.1-y*.28,y*.74+.25,z-x*.48],i);}return out;}
function sampler(seed){const grain=createSeededNoise(seed+":grain"),dust=createSeededNoise(seed+":dust");const base={sample(u,v){const n=grain(u*1.7,v*1.7,3)*.5+.5;return {color:[72+n*58,88+n*42,108+n*35,255],roughness:.24+n*.5,bump:0};}};const layer={sample(u,v){const n=dust(u*3.2+7,v*2.3-5,11)*.5+.5;return {color:[138+n*45,123+n*38,104+n*32,180],roughness:.56+n*.32,bump:0};}};return composeSurfaceLayers(base,[{sampler:layer,mask(u,v){return Math.min(1,Math.max(0,dust(u*4.7-2,v*3.9+13,19)*.5+.5));}}]);}
function mapForBake(rest,rendered,space){const bakePositions=space==="rest"?new Float32Array(rest.positions):rendered;return {positions:bakePositions,uvs:new Float32Array(rest.uvs),indices:new Uint16Array(rest.indices)};}
function digest(bytes){let h=2166136261;for(const value of bytes){h^=value;h=Math.imul(h,16777619);}return (h>>>0).toString(16).padStart(8,"0");}
function geometry(data,positions){const value=new THREE.BufferGeometry();value.setAttribute("position",new THREE.BufferAttribute(new Float32Array(positions),3));value.setAttribute("uv",new THREE.BufferAttribute(new Float32Array(data.uvs),2));value.setIndex(new THREE.BufferAttribute(new Uint16Array(data.indices),1));value.computeVertexNormals();return value;}
function resources(){return {geometries:renderer.info.memory.geometries,textures:renderer.info.memory.textures,programs:renderer.info.programs.length};}
function capture(state){renderer.render(scene,camera);if(gl.getError()!==gl.NO_ERROR)throw Error("GL error");const pixels=new Uint8Array(960*720*4);gl.readPixels(0,0,960,720,gl.RGBA,gl.UNSIGNED_BYTE,pixels);const maps={};for(const item of state.items)maps[item.name]={color:digest(item.bake.color),roughness:digest(item.bake.roughness)};return {png:canvas.toDataURL("image/png"),readback:digest(pixels),maps,resources:resources()};}
function dispose(state){if(!state)return;for(const item of state.items){scene.remove(item.mesh);item.geometry.dispose();item.material.dispose();item.textures.dispose();}}
function warmRenderer(){const g=new THREE.PlaneGeometry(1,1),m=new THREE.MeshStandardMaterial(),mesh=new THREE.Mesh(g,m);scene.add(mesh);renderer.render(scene,camera);scene.remove(mesh);g.dispose();m.dispose();renderer.render(scene,camera);}
function build(seed,space){const rest=restMesh(),positions=[new Float32Array(rest.positions),pose(rest.positions,1),pose(rest.positions,2)],names=["rest","pose-a","pose-b"],source=sampler(seed),items=[];for(let i=0;i<3;i++){const bake=bakeUvAtlas(mapForBake(rest,positions[i],space),source,{width:64,height:64,padding:1}),textures=createThreeSurfaceTextures(bake),material=new THREE.MeshStandardMaterial({map:textures.map,roughnessMap:textures.roughnessMap,roughness:1,metalness:0,side:THREE.DoubleSide}),mesh=new THREE.Mesh(geometry(rest,positions[i]),material);mesh.position.x=(i-1)*2.75;mesh.position.y=-.5;scene.add(mesh);items.push({name:names[i],bake,textures,material,geometry:mesh.geometry,mesh});}const a=items[0].bake.color[0],b=items[0].bake.roughness[0],other=items.slice(1).map(item=>({color:new Uint8Array(item.bake.color),roughness:new Uint8Array(item.bake.roughness)}));items[0].bake.color[0]^=255;items[0].bake.roughness[0]^=255;const independent=items.slice(1).every((item,i)=>item.bake.color.every((value,pixel)=>value===other[i].color[pixel])&&item.bake.roughness.every((value,pixel)=>value===other[i].roughness[pixel]));items[0].bake.color[0]=a;items[0].bake.roughness[0]=b;const flatRelief=items.every(item=>!item.bake.metalness&&item.bake.bump.every((value,pixel)=>value===((item.bake.color[pixel*4+3]===0)?0:128)));return {items,independent,flatRelief,seam:rest.uvs[2]!==rest.uvs[8]&&rest.uvs[4]!==rest.uvs[14],coverage:items[0].bake.covered};}
window.runRestBoundProof=async()=>{warmRenderer();const resourcesBefore=resources();let active=build("rest-visual-30","rest");const baseline=capture(active),independent=active.independent,flatRelief=active.flatRelief,seam=active.seam,coverage=active.coverage,noMetalness=active.items.every(item=>!item.bake.metalness);dispose(active);active=build("rest-visual-other","rest");const changed=capture(active);dispose(active);active=build("rest-visual-30","rest");const restored=capture(active);dispose(active);renderer.render(scene,camera);const finalGlError=gl.getError();return {baseline,changed,restored,independent,flatRelief,noMetalness,seam,coverage,renderer:rendererName,resourcesBefore,resourcesAfterDispose:resources(),finalGlError};};
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
    page.on("console", (message) => {
      if (message.type() === "error") errors.push(message.text());
    });
    await page.goto(`http://127.0.0.1:${address.port}/`, { waitUntil: "networkidle" });
    const result = await page.evaluate(async () =>
      (window as unknown as { runRestBoundProof: () => Promise<Proof> }).runRestBoundProof(),
    );
    assert(result.independent, "Each instance must own independent color and roughness buffers");
    assert(result.flatRelief && result.noMetalness, "Pilot maps must remain color/roughness-only");
    assert(
      result.seam && result.coverage > 0.8 && result.coverage < 1,
      "UV seam coverage must be honest",
    );
    assert.deepEqual(result.baseline.maps.rest, result.baseline.maps["pose-a"]);
    assert.deepEqual(result.baseline.maps.rest, result.baseline.maps["pose-b"]);
    assert.notDeepEqual(
      result.baseline.maps.rest,
      result.changed.maps.rest,
      "Seed must alter baked maps",
    );
    assert.notEqual(result.baseline.png, result.changed.png, "Seed must alter rendered pixels");
    assert.notEqual(
      result.baseline.readback,
      result.changed.readback,
      "Seed must alter WebGL readback",
    );
    assert.deepEqual(result.baseline.maps, result.restored.maps);
    assert.equal(
      result.baseline.png,
      result.restored.png,
      "Restoring the seed must restore the canvas",
    );
    assert.equal(
      result.baseline.readback,
      result.restored.readback,
      "Restoring the seed must restore readback",
    );
    assert.deepEqual(result.baseline.resources, result.changed.resources);
    assert.deepEqual(result.baseline.resources, result.restored.resources);
    assert.deepEqual(result.resourcesAfterDispose, result.resourcesBefore);
    assert.equal(result.finalGlError, 0, "Disposal render must leave WebGL error state clear");
    if (gpu === "metal") {
      assert.match(result.renderer, /metal/i);
      assert.doesNotMatch(result.renderer, /swiftshader|llvmpipe/i);
    } else assert.match(result.renderer, /swiftshader/i);
    assert.deepEqual(errors, []);
    const directory = path.join(root, "test-results", "rest-bound-surface-layers");
    await mkdir(directory, { recursive: true });
    const hashes: Record<string, string> = {};
    for (const [name, png] of Object.entries({
      baseline: result.baseline.png,
      changed: result.changed.png,
      restored: result.restored.png,
    })) {
      const bytes = pngBytes(png);
      await writeFile(path.join(directory, `${name}.png`), bytes);
      hashes[name] = hash(bytes);
    }
    assert.deepEqual(await snapshotBuildInputs(root), inputs);
    assert.deepEqual(await snapshotBuiltArtifacts(root), artifacts);
    assert.deepEqual(
      Object.fromEntries(
        fixtureFiles.map((file) => [file, hash(readFileSync(path.join(root, file)))]),
      ),
      fixtureInputs,
    );
    await writeFile(
      path.join(directory, "receipt.json"),
      JSON.stringify(
        {
          schema: 1,
          kind: "rest-bound-surface-layers",
          muted: true,
          gpu,
          inputs,
          artifacts,
          fixtureInputs,
          hashes,
          renderer: result.renderer,
          coverage: result.coverage,
          resourcesBefore: result.resourcesBefore,
          resourcesAfterDispose: result.resourcesAfterDispose,
          finalGlError: result.finalGlError,
          baseline: result.baseline,
          changed: result.changed,
          restored: result.restored,
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
