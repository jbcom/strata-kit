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

test("sheet incident normals reject visible defects and restore exact buffers", async () => {
  const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
  const inputs = await snapshotBuildInputs(root);
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
    <style>body{margin:0;background:#17202b;color:white;font:16px sans-serif}canvas{display:block}</style>
    <script type="importmap">{"imports":{"three":"/three.module.js"}}</script>
    <script type="module">
    import * as THREE from 'three';
    import {createSheetMesh} from '/dist/index.js';
    import {createThreeMeshGeometry} from '/dist/three.js';
    const renderer=new THREE.WebGLRenderer({antialias:false,preserveDrawingBuffer:true});
    const context=renderer.getContext(),debug=context.getExtension('WEBGL_debug_renderer_info');
    const observedRenderer=String(context.getParameter(debug?debug.UNMASKED_RENDERER_WEBGL:context.RENDERER));
    renderer.setSize(640,480);renderer.setClearColor('#17202b');document.body.append(renderer.domElement);
    const scene=new THREE.Scene();const camera=new THREE.PerspectiveCamera(35,640/480,.001,1000);
    function verify(geometry){
      const p=geometry.getAttribute('position'),n=geometry.getAttribute('normal'),idx=geometry.index;
      for(let t=0;t<idx.count;t+=3){
        const a=new THREE.Vector3().fromBufferAttribute(p,idx.getX(t));
        const b=new THREE.Vector3().fromBufferAttribute(p,idx.getX(t+1));
        const c=new THREE.Vector3().fromBufferAttribute(p,idx.getX(t+2));
        const face=b.sub(a).cross(c.sub(a)).normalize();
        if(!face.length())throw Error('zero area');
        for(let j=0;j<3;j++){
          const normal=new THREE.Vector3().fromBufferAttribute(n,idx.getX(t+j));
          if(Math.abs(normal.length()-1)>1e-6||face.dot(normal)<=0)throw Error('incident corner behind face');
        }
      }
    }
    window.runSheetProof=(kind)=>{
      const data=createSheetMesh(kind==='ridge'
        ?{width:.2,height:1,columns:3,rows:2,heightAt:u=>u<=.5?6*u:3-.4*(u-.5)}
        :{width:1,height:1,columns:2,rows:2,heightAt:(u,v)=>3*u+3*v-36*u*v});
      const geometry=createThreeMeshGeometry(data),material=new THREE.MeshNormalMaterial({side:THREE.DoubleSide});
      const mesh=new THREE.Mesh(geometry,material);mesh.scale.y=kind==='saddle'?.1:1;
      scene.add(mesh);const box=new THREE.Box3().setFromObject(mesh),center=box.getCenter(new THREE.Vector3());
      const radius=box.getSize(new THREE.Vector3()).length()/2;
      camera.position.copy(center).add(new THREE.Vector3(1.6,1.2,2).normalize().multiplyScalar(radius/Math.sin(35*Math.PI/360)*1.2));
      camera.lookAt(center);camera.updateProjectionMatrix();
      const normals=geometry.getAttribute('normal'),saved=normals.array.slice();
      const capture=()=>{renderer.render(scene,camera);if(renderer.getContext().getError())throw Error('GL error');return renderer.domElement.toDataURL('image/png');};
      verify(geometry);const baseline=capture();
      for(let i=0;i<normals.array.length;i++)normals.array[i]=-normals.array[i];normals.needsUpdate=true;
      let rejected=false;try{verify(geometry);}catch(e){rejected=e.message==='incident corner behind face';}
      const fault=capture();normals.array.set(saved);normals.needsUpdate=true;verify(geometry);
      const restored=capture(),bytesRestored=normals.array.every((value,i)=>Object.is(value,saved[i]));
      scene.remove(mesh);geometry.dispose();material.dispose();
      return {baseline,fault,restored,rejected,bytesRestored,observedRenderer,geometriesAfterDispose:renderer.info.memory.geometries,vertices:data.positions.length/3,triangles:data.indices.length/3};
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
      () => typeof (window as unknown as { runSheetProof?: unknown }).runSheetProof === "function",
    );
    const directory = path.join(root, "test-results/sheet-cusp");
    await mkdir(directory, { recursive: true });
    const cases = [];
    for (const kind of ["ridge", "saddle"]) {
      const result = await page.evaluate(
        (kind) =>
          (
            window as unknown as {
              runSheetProof: (kind: string) => {
                baseline: string;
                fault: string;
                restored: string;
                rejected: boolean;
                bytesRestored: boolean;
                observedRenderer: string;
                geometriesAfterDispose: number;
                vertices: number;
                triangles: number;
              };
            }
          ).runSheetProof(kind),
        kind,
      );
      assert(result.rejected, "Injected visible normals must be rejected");
      assert(result.bytesRestored, "Normal buffers must restore byte-for-byte");
      assert.equal(result.geometriesAfterDispose, 0, "Uploaded geometry must be disposed");
      if (gpu === "metal") {
        assert.match(
          result.observedRenderer,
          /metal/i,
          "Hardware proof needs the observed Metal renderer",
        );
        assert.doesNotMatch(result.observedRenderer, /swiftshader|llvmpipe/i);
      }
      assert.equal(result.baseline, result.restored, "Canvas must restore exactly");
      assert.notEqual(
        result.baseline,
        result.fault,
        "Injected normals must affect the rendered mesh",
      );
      const hashes: Record<string, string> = {};
      for (const mode of ["baseline", "fault", "restored"] as const) {
        const bytes = Buffer.from(result[mode].split(",")[1]!, "base64");
        await writeFile(path.join(directory, `${kind}-${mode}.png`), bytes);
        hashes[mode] = createHash("sha256").update(bytes).digest("hex");
      }
      cases.push({
        kind,
        hashes,
        observedRenderer: result.observedRenderer,
        vertices: result.vertices,
        triangles: result.triangles,
      });
    }
    assert.deepEqual(errors, []);
    assert.deepEqual(await snapshotBuildInputs(root), inputs);
    assert.deepEqual(await snapshotBuiltArtifacts(root), artifacts);
    await writeFile(
      path.join(directory, "receipt.json"),
      JSON.stringify(
        {
          schema: 1,
          muted: true,
          kind: "headless-incident-normal-proof",
          gpu,
          inputs,
          artifacts,
          cases,
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
