import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { readFileSync, readdirSync } from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
import { createServer } from "node:http";
import path from "node:path";
import { chromium, test } from "@playwright/test";
import {
  assertEmbeddedSources,
  snapshotBuildInputs,
  snapshotBuiltArtifacts,
} from "../scripts/proof-inputs.mjs";

const hash = (bytes: Buffer | string) => createHash("sha256").update(bytes).digest("hex");

test("factory shaders preserve projections, linear coverage, scalar channels and native bump", async () => {
  const root = process.cwd();
  const fixtureNames = [
    "tests/three-triplanar-material.playwright.ts",
    "tests/playwright.three-triplanar-material.config.ts",
  ];
  const fixtures = Object.fromEntries(
    fixtureNames.map((name) => [name, hash(readFileSync(path.join(root, name)))]),
  );
  const inputs = await snapshotBuildInputs(root);
  assert("src/threeTriplanar.ts" in inputs.files);
  execFileSync("pnpm", ["run", "build"], { cwd: root, stdio: "inherit" });
  await assertEmbeddedSources(root, inputs);
  const artifacts = await snapshotBuiltArtifacts(root);
  const threeBuild = path.resolve(
    process.env.STRATA_PROOF_THREE_BUILD ?? "node_modules/three/build",
  );
  const routes = new Map<string, Buffer>();
  for (const file of readdirSync(path.join(root, "dist")))
    if (file.endsWith(".js"))
      routes.set(`/dist/${file}`, readFileSync(path.join(root, "dist", file)));
  for (const file of readdirSync(threeBuild))
    if (file.endsWith(".js")) routes.set(`/${file}`, readFileSync(path.join(threeBuild, file)));
  routes.set(
    "/",
    Buffer.from(`<!doctype html><meta charset="utf-8"><canvas></canvas>
<script type="importmap">{"imports":{"three":"/three.module.js","strata-procedural/three":"/dist/three.js"}}</script>
<script type="module">
import * as T from 'three';
import { createThreeTriplanarMaterial } from 'strata-procedural/three';
const canvas=document.querySelector('canvas');
const kind=${JSON.stringify(process.env.STRATA_PROOF_GL ?? "webgl2")};
const context=canvas.getContext(kind,{alpha:true,antialias:false,preserveDrawingBuffer:true});
if(!context) throw Error('Requested GL context unavailable: '+kind);
const renderer=new T.WebGLRenderer({canvas,context,antialias:false,preserveDrawingBuffer:true});
renderer.setSize(65,65,false);renderer.setPixelRatio(1);renderer.setClearColor(0,0);
if("useLegacyLights" in renderer)renderer.useLegacyLights=false;
renderer.outputColorSpace=T.LinearSRGBColorSpace;renderer.toneMapping=T.NoToneMapping;
const gl=renderer.getContext(),dbg=gl.getExtension('WEBGL_debug_renderer_info');
const camera=new T.OrthographicCamera(-1,1,1,-1,.1,10);camera.position.z=3;
const scene=new T.Scene(); scene.add(new T.AmbientLight(0xffffff,.3));
const light=new T.DirectionalLight(0xffffff,2);light.position.set(-2,3,4);scene.add(light);
const color=[],rough=[],bump=[],metal=[];
for(let y=0;y<4;y++)for(let x=0;x<4;x++){
 color.push(40+x*45,30+y*50,35+(x+y)*20,32+(x+2*y)*24);
 rough.push(0,25+x*30+y*12,0,255);bump.push(20+x*35+y*16,0,0,255);metal.push(0,0,10+x*20+y*22,255);
}
function tex(data,srgb=false){const t=new T.DataTexture(new Uint8Array(data),4,4,T.RGBAFormat,T.UnsignedByteType);t.colorSpace=srgb?T.SRGBColorSpace:T.NoColorSpace;t.minFilter=t.magFilter=T.NearestFilter;t.generateMipmaps=false;t.needsUpdate=true;return t;}
const maps={map:tex(color,true),roughnessMap:tex(rough),bumpMap:tex(bump),metalnessMap:tex(metal)};
const captures={},records=[],compiled=[],ownedCopies=[];
function freshMaps(source){return Object.fromEntries(Object.entries(source).map(([name,t])=>{const copy=new T.DataTexture(t.image.data.slice(),t.image.width,t.image.height,T.RGBAFormat,T.UnsignedByteType);copy.colorSpace=t.colorSpace;copy.minFilter=copy.magFilter=t.magFilter;copy.generateMipmaps=false;copy.needsUpdate=true;ownedCopies.push(copy);return [name,copy];}));}
function capture(name,material,normal=[0,0,1],back=false){
 const geo=new T.PlaneGeometry(2,2);geo.deleteAttribute('uv');
 const a=geo.getAttribute('normal');for(let i=0;i<a.count;i++)a.setXYZ(i,...normal);
 const mesh=new T.Mesh(geo,material);if(back)mesh.rotation.y=Math.PI;scene.add(mesh);
 renderer.render(scene,camera);
 const pixel=new Uint8Array(4);gl.readPixels(32,32,1,1,gl.RGBA,gl.UNSIGNED_BYTE,pixel);
 const bytes=new Uint8Array(65*65*4);gl.readPixels(0,0,65,65,gl.RGBA,gl.UNSIGNED_BYTE,bytes);
 if(gl.getError()!==gl.NO_ERROR)throw Error('GL error '+name);
 captures[name]=canvas.toDataURL('image/png');scene.remove(mesh);geo.dispose();material.dispose();return {pixel:Array.from(pixel),bytes:Array.from(bytes)};
}
function diagnostic(name,normal,transform,flip,mode){
 const material=createThreeTriplanarMaterial(freshMaps(maps),{fieldTransform:transform,flipV:flip,sharpness:2,roughness:.8,metalness:.6,bumpScale:0});
 const factory=material.onBeforeCompile;material.customProgramCacheKey=()=>name;
 material.onBeforeCompile=(s,r)=>{factory(s,r);compiled.push({name,vertex:s.vertexShader,fragment:s.fragmentShader});
 const output=mode==='weights'?'vec4(strataW,1.0)':mode==='scalars'?'vec4(roughnessFactor,metalnessFactor,strataTriHeight(strataW,strataX,strataY,strataZ),1.0)':'vec4(diffuseColor.rgb,strataAlpha)';
 s.fragmentShader=s.fragmentShader.replace('#include <dithering_fragment>','#include <dithering_fragment>\\ngl_FragColor = '+output+';');};
 return capture(name,material,normal).pixel;
}
function linear(v){v/=255;return v<=.04045?v/12.92:Math.pow((v+.055)/1.055,2.4);}
function expected(normal,scale,flip,mode){
 const n=normal.map((v,i)=>Math.abs(v/scale[i])),max=Math.max(...n),w=n.map(v=>(v/max)**2),sum=w.reduce((a,b)=>a+b);for(let i=0;i<3;i++)w[i]/=sum;
 if(mode==='weights')return [...w,1].map(v=>Math.round(v*255));
 const p=[.2,.6,.85],uv=[[p[2],p[1]],[p[0],p[2]],[p[0],p[1]]];
 const indices=uv.map(([u,v])=>4*(Math.min(3,Math.floor((flip?1-v:v)*4))*4+Math.min(3,Math.floor(u*4))));
 const alpha=indices.map((j,i)=>color[j+3]/255*w[i]),coverage=alpha.reduce((a,b)=>a+b),covered=alpha.map(v=>v/coverage);
 if(mode==='scalars')return [.8*indices.reduce((v,j,i)=>v+rough[j+1]/255*covered[i],0),.6*indices.reduce((v,j,i)=>v+metal[j+2]/255*covered[i],0),indices.reduce((v,j,i)=>v+bump[j]/255*covered[i],0),1].map(v=>Math.round(v*255));
 return [0,1,2].map(c=>Math.round(indices.reduce((v,j,i)=>v+linear(color[j+c])*covered[i],0)*255)).concat(Math.round(coverage*255));
}
window.runProof=()=>{
 if(kind==='webgl'&&!gl.getExtension('EXT_sRGB'))throw Error('WebGL1 minimum proof requires EXT_sRGB');
 for(const [label,normal,scale] of [['x',[1,0,0],[1,1,1]],['y',[0,1,0],[1,1,1]],['z',[0,0,1],[1,1,1]],['mixed',[1,2,3],[1,1,1]],['reflected',[1,2,3],[-2,.5,3]]]){
 for(const flip of [false,true])for(const mode of ['color','scalars','weights']){
 const m=new T.Matrix4().makeScale(...scale);m.setPosition(.2,.6,.85);const name=label+'-'+flip+'-'+mode;
 records.push({name,actual:diagnostic(name,normal,m,flip,mode),expected:expected(normal,scale,flip,mode)});
 }}
 const savedAlpha=maps.map.image.data.slice();for(let i=3;i<maps.map.image.data.length;i+=4)maps.map.image.data[i]=0;maps.map.needsUpdate=true;
 records.push({name:'zero-coverage-scalars',actual:diagnostic('zero-coverage-scalars',[1,2,3],new T.Matrix4().setPosition(.2,.6,.85),false,'scalars'),expected:[0,0,128,255]});
 maps.map.image.data.set(savedAlpha);maps.map.needsUpdate=true;
 records.push({name:'extreme-scale',actual:diagnostic('extreme-scale',[1,2,3],new T.Matrix4().makeScale(1e30,1e30,1e30),false,'weights'),expected:expected([1,2,3],[1,1,1],false,'weights')});
 // Native bump parity uses a controlled pure-Z projection and identical UVs.
 const ramp=[];for(let y=0;y<64;y++)for(let x=0;x<64;x++)ramp.push(Math.round(127.5+110*Math.sin(x/63*Math.PI*4)),0,0,255);
 const height=new T.DataTexture(new Uint8Array(ramp),64,64);height.colorSpace=T.NoColorSpace;height.minFilter=height.magFilter=T.LinearFilter;height.needsUpdate=true;
 const white=tex(Array(16).fill([255,255,255,255]).flat(),true),scalar=tex(Array(16).fill([255,255,255,255]).flat());
 const lit=[];
 for(const back of [false,true]){
 const side=back?T.BackSide:T.FrontSide,transform=new T.Matrix4().makeScale(.5,.5,1);transform.setPosition(.5,.5,0);
 const tri=createThreeTriplanarMaterial(freshMaps({map:white,roughnessMap:scalar,bumpMap:height}),{fieldTransform:transform,flipV:false,roughness:.8,bumpScale:3,side});
 const baseline=capture('lit-triplanar-'+back,tri,[0,0,1],back);
 const uv=new T.MeshStandardMaterial({map:white,roughnessMap:scalar,bumpMap:height,roughness:.8,bumpScale:3,side});
 // capture() removes UVs deliberately, so use a separate native UV surface here.
 const g=new T.PlaneGeometry(2,2),mesh=new T.Mesh(g,uv);if(back)mesh.rotation.y=Math.PI;scene.add(mesh);renderer.render(scene,camera);
 const bytes=new Uint8Array(65*65*4);gl.readPixels(0,0,65,65,gl.RGBA,gl.UNSIGNED_BYTE,bytes);captures['lit-native-uv-'+back]=canvas.toDataURL('image/png');scene.remove(mesh);g.dispose();uv.dispose();
 const flat=createThreeTriplanarMaterial(freshMaps({map:white,roughnessMap:scalar,bumpMap:height}),{fieldTransform:transform,flipV:false,roughness:.8,bumpScale:0,side});
 const off=capture('lit-bump-off-'+back,flat,[0,0,1],back);
 let delta=0,error=0,count=0;for(let y=8;y<57;y++)for(let x=8;x<57;x++)for(let c=0;c<3;c++){const i=(y*65+x)*4+c;delta+=Math.abs(baseline.bytes[i]-off.bytes[i]);error+=Math.abs(baseline.bytes[i]-bytes[i]);count++;}
 lit.push({back,bumpDelta:delta/count,nativeMeanError:error/count});
 }
 // Reuse the exact caller textures AFTER their first real native upload.
 const reuseMaps=freshMaps(maps),reuseTransform=new T.Matrix4().makeScale(.3,.3,.3);reuseTransform.setPosition(.2,.6,.85);
 const reuseOptions={fieldTransform:reuseTransform,flipV:false,roughness:.8,metalness:.6,bumpScale:.2};
 const metadata=t=>({format:t.format,type:t.type,colorSpace:t.colorSpace,minFilter:t.minFilter,magFilter:t.magFilter,generateMipmaps:t.generateMipmaps,internalFormat:t.internalFormat,version:t.version,offset:t.offset.toArray(),repeat:t.repeat.toArray(),center:t.center.toArray(),rotation:t.rotation,matrix:t.matrix.toArray()});
 let borrowedDisposals=0;for(const t of Object.values(reuseMaps))t.addEventListener('dispose',()=>borrowedDisposals++);
 const beforeUpload=metadata(reuseMaps.map),reuseFirst=createThreeTriplanarMaterial(reuseMaps,reuseOptions);
 const reuseBaseline=capture('reuse-before',reuseFirst,[1,2,3]),afterUpload=metadata(reuseMaps.map);
 let reuseError=null,reuseMatches=false,factoryPreservesMetadata=false,reuseBindings=false;
 try {
  const reused=createThreeTriplanarMaterial(reuseMaps,reuseOptions);
  factoryPreservesMetadata=JSON.stringify(metadata(reuseMaps.map))===JSON.stringify(afterUpload);
  reuseBindings=reused.map===reuseMaps.map&&reused.roughnessMap===reuseMaps.roughnessMap&&reused.bumpMap===reuseMaps.bumpMap&&reused.metalnessMap===reuseMaps.metalnessMap;
  const result=capture('reuse-after',reused,[1,2,3]);reuseMatches=JSON.stringify(reuseBaseline.bytes)===JSON.stringify(result.bytes);
 }catch(error){reuseError=String(error.message);}
 const reuse={beforeUpload,afterUpload,error:reuseError,pixelsMatch:reuseMatches,factoryPreservesMetadata,bindingsPreserved:reuseBindings,borrowedDisposalsBeforeCaller:borrowedDisposals,nativeLegacyFormat:T._SRGBAFormat??null};
 const first=createThreeTriplanarMaterial(freshMaps(maps),{flipV:false}),second=createThreeTriplanarMaterial(freshMaps(maps),{flipV:true});
 const a=capture('instance-a',first,[0,0,1]),b=capture('instance-b',second,[0,0,1]);
 for(const t of [...Object.values(maps),height,white,scalar,...ownedCopies])t.dispose();
 return {revision:T.REVISION,kind,renderer:String(gl.getParameter(dbg?dbg.UNMASKED_RENDERER_WEBGL:gl.RENDERER)),version:String(gl.getParameter(gl.VERSION)),srgb:!!gl.getExtension('EXT_sRGB'),records,lit,reuse,instancesDifferent:JSON.stringify(a.bytes)!==JSON.stringify(b.bytes),geometries:renderer.info.memory.geometries,captures,compiled};
};
</script>`),
  );
  const served = Object.fromEntries([...routes].map(([url, bytes]) => [url, hash(bytes)]));
  const server = createServer((req, res) => {
    const bytes = routes.get(new URL(req.url ?? "/", "http://localhost").pathname);
    res.writeHead(bytes ? 200 : 404, {
      "Content-Type": req.url === "/" ? "text/html" : "application/javascript",
      "Cache-Control": "no-store",
    });
    res.end(bytes ?? "Missing fixture");
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  assert(address && typeof address !== "string");
  const browser = await chromium.launch({
    headless: true,
    args: ["--mute-audio", "--use-angle=metal", "--ignore-gpu-blocklist"],
  });
  try {
    const page = await browser.newPage();
    const errors: string[] = [];
    page.on("pageerror", (e) => errors.push(e.message));
    page.on("console", (m) => {
      if (m.type() === "error") errors.push(m.text());
    });
    await page.goto(`http://127.0.0.1:${address.port}/`, { waitUntil: "networkidle" });
    await page.waitForFunction(
      () => typeof (window as unknown as { runProof?: unknown }).runProof === "function",
    );
    const result = await page.evaluate(() =>
      (
        window as unknown as {
          runProof: () => {
            revision: string;
            kind: string;
            renderer: string;
            version: string;
            srgb: boolean;
            records: { name: string; actual: number[]; expected: number[] }[];
            lit: { back: boolean; bumpDelta: number; nativeMeanError: number }[];
            instancesDifferent: boolean;
            geometries: number;
            reuse: {
              error: string | null;
              pixelsMatch: boolean;
              factoryPreservesMetadata: boolean;
              bindingsPreserved: boolean;
              borrowedDisposalsBeforeCaller: number;
              beforeUpload: { format: number };
              afterUpload: { format: number; minFilter: number; generateMipmaps: boolean };
              nativeLegacyFormat: number | null;
            };
            captures: Record<string, string>;
            compiled: unknown[];
          };
        }
      ).runProof(),
    );
    const directory = path.join(root, "test-results", "three-triplanar-material");
    await mkdir(directory, { recursive: true });
    for (const [name, url] of Object.entries(result.captures))
      await writeFile(
        path.join(directory, `${name}.png`),
        Buffer.from(url.split(",")[1], "base64"),
      );
    await writeFile(
      path.join(directory, "receipt.json"),
      JSON.stringify(
        {
          schema: 1,
          muted: true,
          inputs,
          artifacts,
          fixtures,
          served,
          ...result,
          captures: Object.fromEntries(
            Object.entries(result.captures).map(([name, url]) => [
              name,
              hash(Buffer.from(url.split(",")[1], "base64")),
            ]),
          ),
        },
        null,
        2,
      ),
    );
    assert.match(result.renderer, /metal/i);
    assert.doesNotMatch(result.renderer, /swiftshader|llvmpipe/i);
    assert.equal(result.kind, process.env.STRATA_PROOF_GL ?? "webgl2");
    if (result.kind === "webgl") {
      assert.match(result.version, /WebGL 1/);
      assert(result.srgb);
    } else assert.match(result.version, /WebGL 2/);
    for (const row of result.records)
      for (let c = 0; c < 4; c++)
        assert(
          Math.abs(row.actual[c] - row.expected[c]) <= 3,
          `${row.name} channel ${c}: ${row.actual} expected ${row.expected}`,
        );
    for (const row of result.lit) {
      assert(row.bumpDelta > 1, `native bump must alter lighting: ${JSON.stringify(row)}`);
      assert(row.nativeMeanError < 1.5, `native UV parity: ${JSON.stringify(row)}`);
    }
    assert.equal(
      result.reuse.error,
      null,
      "new factory material must reuse the renderer-uploaded caller textures",
    );
    assert(result.reuse.pixelsMatch, "post-upload reuse must render identical real lit pixels");
    assert(
      result.reuse.factoryPreservesMetadata,
      "factory must preserve actual uploaded texture metadata",
    );
    assert(result.reuse.bindingsPreserved, "factory must borrow the exact uploaded textures");
    assert.equal(
      result.reuse.borrowedDisposalsBeforeCaller,
      0,
      "materials must not dispose caller textures",
    );
    if (result.kind === "webgl") {
      assert.notEqual(
        result.reuse.beforeUpload.format,
        result.reuse.afterUpload.format,
        "r152 EXT_sRGB must have actually uploaded the legacy representation",
      );
      assert.equal(result.reuse.afterUpload.format, result.reuse.nativeLegacyFormat);
      assert.equal(result.reuse.afterUpload.minFilter, 1006);
      assert.equal(result.reuse.afterUpload.generateMipmaps, false);
    }
    assert(result.instancesDifferent, "per-instance uniforms must affect rendered pixels");
    assert.equal(result.geometries, 0);
    assert.deepEqual(errors, []);
    assert.deepEqual(await snapshotBuildInputs(root), inputs);
    assert.deepEqual(await snapshotBuiltArtifacts(root), artifacts);
    assert.deepEqual(
      Object.fromEntries(
        fixtureNames.map((name) => [name, hash(readFileSync(path.join(root, name)))]),
      ),
      fixtures,
    );
  } finally {
    await browser.close();
    await new Promise<void>((resolve, reject) => server.close((e) => (e ? reject(e) : resolve())));
  }
});
