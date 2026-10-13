import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import {
  applyShaderPatches, bakeSurface, bakeUvAtlas, composeSurfaceLayers, createReskinPlan,
  createRevolvedMesh, createSheetMesh, createSweptMesh, createWearField,
} from '/lib/index.js';
import { createThreeMeshGeometry, createThreeSurfaceTextures } from '/lib/three.js';

const parameters = new URLSearchParams(location.search);
const canvas = document.querySelector('#view');
const renderer = new THREE.WebGLRenderer({ canvas, antialias:true, preserveDrawingBuffer:parameters.has('capture') });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.12;
const scene = new THREE.Scene();
scene.background = new THREE.Color('#111821');
const camera = new THREE.PerspectiveCamera(34, 1, .01, 100);
const controls = new OrbitControls(camera, canvas);
controls.enableDamping = false;
const environment = new RoomEnvironment();
const pmrem = new THREE.PMREMGenerator(renderer);
const environmentMap = pmrem.fromScene(environment, .04);
scene.environment = environmentMap.texture;
environment.dispose(); pmrem.dispose();
const key = new THREE.DirectionalLight('#ffead1', 3.1);
key.position.set(-3, 5, 5); scene.add(key);
const fill = new THREE.DirectionalLight('#bdd5ff', 1.5);
fill.position.set(4, 2, -2); scene.add(fill);
const floor = new THREE.Mesh(new THREE.PlaneGeometry(30,30), new THREE.MeshStandardMaterial({color:'#18222e',roughness:.92,metalness:.1}));
floor.rotation.x = -Math.PI/2; floor.position.y = -.06; scene.add(floor);
const content = new THREE.Group(); scene.add(content);
const owned = [];
let mode = 'materials'; let scale = 1; let seed = 'workshop-17';
let fieldOverride;
let defect;
let shaderCompileCount = 0;
let latestBakes={};
let boundTextureBindings={};

function bakeBytes(kind='material') {
  const bake=latestBakes[kind];
  if(!bake) throw new Error(`No ${kind} bake is active`);
  return {color:Array.from(bake.color),roughness:Array.from(bake.roughness),bump:Array.from(bake.bump),
    ...(bake.metalness?{metalness:Array.from(bake.metalness)}:{})};
}

function wearSampler(domainScale) {
  const field = fieldOverride ?? createWearField({seed,scale:domainScale,amount:1,edgeBias:.62,bottomBias:1});
  let lastU; let lastV; let last;
  const at = (u,v) => {
    if (u !== lastU || v !== lastV) {
      lastU=u; lastV=v;
      last=field.sample(u,defect==='inverted-gravity'?1-v:v);
    }
    return last;
  };
  const surface = (color,roughness,metalness,height) => ({ sample(u,v) {
    const value=at(u,v); const grain=.86+value.fine*.26;
    return {color:[...color.map((channel)=>Math.min(255,channel*grain)),255],roughness:Math.min(1,roughness+value.mid*.09),metalness,bump:(value.fine-.5)*height};
  }});
  const sampler=composeSurfaceLayers(surface([179,187,191],.55,0,.06),[
    {sampler:surface([113,124,133],.2,1,.16),mask:(u,v)=>at(u,v).chip},
    {sampler:surface([161,79,35],.73,0,.23),mask:(u,v)=>at(u,v).steel},
    {sampler:surface([57,34,25],.86,0,.28),mask:(u,v)=>defect==='missing-oxide'?0:at(u,v).oxide},
    {sampler:surface([64,47,35],.77,0,.11),mask:(u,v)=>at(u,v).drip*.22},
  ]);
  return sampler;
}

function textureMetadata(texture) {
  const data=texture.image?.data;
  const format=texture.format===THREE.RGBAFormat?'RGBAFormat':texture.format===THREE.RedFormat?'RedFormat':`unknown:${texture.format}`;
  return {width:texture.image?.width??0,height:texture.image?.height??0,bytes:data?.length??0,channels:format==='RGBAFormat'?4:format==='RedFormat'?1:0,format,colorSpace:texture.colorSpace,flipY:texture.flipY};
}

function boundTextureMetadata(key) {
  const bound=boundTextureBindings[key];
  if(!bound) throw new Error(`No ${key} texture binding is active`);
  const {material,textures}=bound;
  const sceneBound=bound.object?.parent===content&&bound.object.visible&&bound.object.material===material;
  return {sceneBound,bindings:{color:material.map===textures.map,roughness:material.roughnessMap===textures.roughnessMap,bump:material.bumpMap===textures.bumpMap,metalness:material.metalnessMap===textures.metalnessMap},textures:{color:textureMetadata(textures.map),roughness:textureMetadata(textures.roughnessMap),bump:textureMetadata(textures.bumpMap),metalness:textures.metalnessMap?textureMetadata(textures.metalnessMap):undefined}};
}

function bytesToBase64(bytes) {
  let text='';
  for(let offset=0;offset<bytes.length;offset+=0x8000) text+=String.fromCharCode(...bytes.subarray(offset,Math.min(bytes.length,offset+0x8000)));
  return btoa(text);
}

function boundTextureChunk(key,map,offset=0,length=65536) {
  const bound=boundTextureBindings[key];
  const texture=bound?.textures[`${map}Map`]??(map==='color'?bound?.textures.map:undefined);
  const bytes=texture?.image?.data;
  if(!(bytes instanceof Uint8Array)) throw new Error(`No ${map} bytes are bound for ${key}`);
  if(!Number.isInteger(offset)||!Number.isInteger(length)||offset<0||length<0||length>65536||offset>bytes.length) throw new Error('Texture chunk range is invalid');
  const end=Math.min(bytes.length,offset+length);
  return {offset,totalBytes:bytes.length,data:bytesToBase64(bytes.subarray(offset,end))};
}

function material(bake, bumpScale=.025, textureKey) {
  const textures=createThreeSurfaceTextures(bake);
  const result=new THREE.MeshStandardMaterial({map:textures.map,roughnessMap:textures.roughnessMap,bumpMap:textures.bumpMap,metalnessMap:textures.metalnessMap,metalness:1,roughness:1,bumpScale,side:THREE.DoubleSide});
  if(textureKey) { boundTextureBindings[textureKey]={material:result,textures}; result.userData.textureEvidenceKey=textureKey; }
  owned.push(textures,result);
  return result;
}

function cuspMaterial() {
  const result=new THREE.MeshStandardMaterial({color:'#b7bdc5',metalness:.25,roughness:.38,side:THREE.DoubleSide});
  owned.push(result);
  return result;
}

function add(geometry, surface, position, rotation=0, acceptanceKey) {
  const mesh=new THREE.Mesh(geometry,surface);
  if(surface.userData.textureEvidenceKey) boundTextureBindings[surface.userData.textureEvidenceKey].object=mesh;
  if(acceptanceKey) mesh.userData.acceptanceKey=acceptanceKey;
  mesh.position.set(...position); mesh.rotation.y=rotation;
  owned.push(geometry); content.add(mesh); return mesh;
}

function renderedGeometryEvidence() {
  const result={};
  content.traverse((object)=>{
    const key=object.userData?.acceptanceKey;
    if(!key || !object.isMesh) return;
    const position=object.geometry.getAttribute('position');
    const normal=object.geometry.getAttribute('normal');
    const uv=object.geometry.getAttribute('uv');
    const index=object.geometry.index;
    let finite=Boolean(position); let unitNormals=Boolean(normal); let normalizedUvs=Boolean(uv); let validIndices=Boolean(index); let outwardNormals=Boolean(index&&position&&normal);
    if(position) for(const value of position.array) finite&&=Number.isFinite(value);
    if(normal) for(let vertex=0;vertex<normal.count;vertex++) unitNormals&&=Math.abs(Math.hypot(normal.getX(vertex),normal.getY(vertex),normal.getZ(vertex))-1)<1e-4;
    if(uv) for(const value of uv.array) normalizedUvs&&=Number.isFinite(value)&&value>=0&&value<=1;
    if(index&&position) for(const value of index.array) validIndices&&=value<position.count;
    if(index&&position&&normal) for(let offset=0;offset<index.count;offset+=3) {
      const a=index.getX(offset); const b=index.getX(offset+1); const c=index.getX(offset+2);
      const abx=position.getX(b)-position.getX(a); const aby=position.getY(b)-position.getY(a); const abz=position.getZ(b)-position.getZ(a);
      const acx=position.getX(c)-position.getX(a); const acy=position.getY(c)-position.getY(a); const acz=position.getZ(c)-position.getZ(a);
      const x=aby*acz-abz*acy; const y=abz*acx-abx*acz; const z=abx*acy-aby*acx;
      for(const vertex of [a,b,c]) outwardNormals&&=x*normal.getX(vertex)+y*normal.getY(vertex)+z*normal.getZ(vertex)>0;
    }
    result[key]={vertices:position?.count??0,triangles:index?index.count/3:position?position.count/3:0,finite,unitNormals,normalizedUvs,validIndices,outwardNormals};
  });
  return result;
}

function lathe() {
  return createRevolvedMesh({profile:[
    {radius:0,height:0},{radius:.48,height:.04},{radius:.49,height:.1},
    {radius:.28,height:.38},{radius:.4,height:.66},{radius:.3,height:1},
    {radius:.14,height:1.15},{radius:0,height:1.22},
  ],segments:64});
}

function render() {
  renderer.render(scene,camera);
  const gl=renderer.getContext(); const extension=gl.getExtension('WEBGL_debug_renderer_info');
  window.__proceduralDemo={...window.__proceduralDemo,ready:true,muted:true,mode,scale,seed,
    gpu:extension?gl.getParameter(extension.UNMASKED_RENDERER_WEBGL):gl.getParameter(gl.RENDERER),
    triangles:renderer.info.render.triangles,drawCalls:renderer.info.render.calls,
    shaderCompileCount,contextLost:gl.isContextLost(),physicalBounds:new THREE.Box3().setFromObject(content).getSize(new THREE.Vector3()).toArray(),
    proceduralGeometry:renderedGeometryEvidence(),readBakeBytes:bakeBytes,readBoundTextureMetadata:boundTextureMetadata,readBoundTextureChunk:boundTextureChunk};
}

function resize() {
  const width=canvas.parentElement.clientWidth; const height=canvas.parentElement.clientHeight;
  renderer.setSize(width,height,false); camera.aspect=width/height;
  if(content.children.length) {
    const bounds=new THREE.Box3().setFromObject(content);
    const size=bounds.getSize(new THREE.Vector3()); const center=bounds.getCenter(new THREE.Vector3());
    const vertical=THREE.MathUtils.degToRad(camera.fov/2);
    const horizontal=Math.atan(Math.tan(vertical)*camera.aspect);
    controls.target.copy(center);
    if(mode==='cusp') {
      const distance=1.18*Math.max(size.x,size.z)/(2*Math.tan(horizontal));
      camera.position.copy(center).add(new THREE.Vector3(.8,.06,.55).normalize().multiplyScalar(distance));
    } else {
      const distance=1.18*Math.max(size.x/(2*Math.tan(horizontal)),size.y/(2*Math.tan(vertical)))+size.z*.8;
      camera.position.copy(center).add(new THREE.Vector3(.42,.3,.86).normalize().multiplyScalar(distance));
    }
    controls.update();
  }
  camera.updateProjectionMatrix(); render();
}

function rebuild() {
  window.__proceduralDemo={...window.__proceduralDemo,ready:false};
  content.clear(); for(const resource of owned.splice(0))resource.dispose(); boundTextureBindings={};
  const sampler=wearSampler(scale);
  const bake=bakeSurface(sampler,{width:256,height:256});
  latestBakes={material:bake};
  if(mode==='materials') {
    const panel=add(new THREE.BoxGeometry(1.28,1.75,.075,1,1,1),material(bake,.025,'materials-panel'),[-1.05,.88,0],-.08);
    add(new THREE.BoxGeometry(1.15,1.15,1.15),material(bake,.025,'materials-cube'),[1.0,.58,0],-.4);
    panel.rotation.z=.025;
    document.querySelector('#caption').textContent='Coating → exposed metal → oxide · one coordinated field';
  } else if(mode==='geometry') {
    const revolved=lathe(); add(createThreeMeshGeometry(revolved),material(bake),[-1.25,0,0],0,'revolved');
    const path=Array.from({length:44},(_,index)=>{
      const t=index/43; return {x:.45*Math.sin(t*Math.PI*2),y:.08+t*1.25,z:.25*Math.cos(t*Math.PI*2)};
    });
    const swept=createSweptMesh({path,radius:(t)=>.095+.055*Math.sin(t*Math.PI),radialSegments:20});
    add(createThreeMeshGeometry(swept),material(bake),[.1,0,0],0,'swept');
    const sheet=createSheetMesh({width:1.0,height:1.4,columns:50,rows:50,heightAt:(u,v)=>.065*Math.sin(u*Math.PI*10)*Math.sin(v*Math.PI)});
    const object=add(createThreeMeshGeometry(sheet),material(bake),[1.5,.7,0],0,'sheet'); object.rotation.x=Math.PI/2;
    document.querySelector('#caption').textContent='Revolve · parallel-transport sweep · corrugated sheet';
  } else if(mode==='cusp') {
    const cusp=createSweptMesh({
      path:[{x:0,y:0,z:0},{x:0,y:.1,z:0},{x:0,y:.11,z:0}],
      radius:(t)=>t===0?.1:t===1?.28:.3,radialSegments:6,
    });
    add(createThreeMeshGeometry(cusp),cuspMaterial(),[0,0,0],0,'cusp');
    document.querySelector('#caption').textContent='Sharp swept-radius cusp diagnostic';
  } else {
    const data=lathe();
    const plan=createReskinPlan(data);
    const worldSampler={sample(u,v){return sampler.sample(u+.5,.5-v);}};
    const atlas=bakeUvAtlas(data,worldSampler,{width:512,height:512,padding:2,scale:1,sharpness:4});
    latestBakes.atlas=atlas;
    add(createThreeMeshGeometry(data),material(atlas,.025,'atlas-model'),[-.85,0,0],0,'atlas');
    const previewTextures=createThreeSurfaceTextures(atlas);
    const plane=add(new THREE.PlaneGeometry(1.6,1.6),new THREE.MeshBasicMaterial({map:previewTextures.map,side:THREE.DoubleSide}),[1.0,.9,0]);
    owned.push(previewTextures,plane.material);
    document.querySelector('#caption').textContent=`Surface-sampled UV bake · ${Math.round(atlas.covered*100)}% texel coverage · ${plan.projection} planning`;
  }
  if(mode!=='cusp') {
    const patched=new THREE.MeshStandardMaterial({color:'#bea371',metalness:.8,roughness:.32});
    patched.onBeforeCompile=(shader)=>{
      shader.vertexShader=applyShaderPatches(shader.vertexShader,[{anchor:'#include <begin_vertex>',replacement:'#include <begin_vertex>\ntransformed += normal * (0.012 * sin(position.x * 22.0) * sin(position.y * 18.0));'}]);
      shaderCompileCount+=1;
    };
    patched.customProgramCacheKey=()=> 'procedural-gallery-relief-v1';
    owned.push(patched);
    add(new THREE.SphereGeometry(.17,40,24),patched,[0,.2,1.12]);
  }
  content.scale.setScalar(scale);
  floor.scale.setScalar(scale);
  key.position.set(-3*scale,5*scale,5*scale);
  fill.position.set(4*scale,2*scale,-2*scale);
  camera.near=.01*scale; camera.far=100*scale;
  document.querySelector('#status').textContent=`Seed ${seed} · ${scale} m domain · 256² coherent PBR bake`;
  requestAnimationFrame(resize);
}

for(const button of document.querySelectorAll('[data-mode]'))button.addEventListener('click',()=>{
  mode=button.dataset.mode;
  for(const sibling of document.querySelectorAll('[data-mode]'))sibling.setAttribute('aria-pressed',String(sibling===button));
  rebuild();
});
document.querySelector('#scale').addEventListener('click',()=>{
  scale=scale===1?10:1;
  document.querySelector('#scale').textContent=`Scale: ${scale} m`;
  document.querySelector('#scale').setAttribute('aria-pressed',String(scale===10)); rebuild();
});
document.querySelector('#seed').addEventListener('change',(event)=>{seed=event.target.value; rebuild();});
controls.addEventListener('change',render);
new ResizeObserver(resize).observe(canvas.parentElement);
window.__proceduralDemo={ready:false,muted:true,
  setField(field){fieldOverride=field; rebuild();},
  setMode(value){
    if(!['materials','geometry','atlas','cusp'].includes(value)) throw new Error(`Unsupported gallery mode: ${value}`);
    mode=value; rebuild();
  },
  setDefect(value){defect=value; rebuild();},
  restore(){fieldOverride=undefined; defect=undefined; rebuild();},
};
rebuild();
