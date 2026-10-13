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
  return composeSurfaceLayers(surface([179,187,191],.55,0,.06),[
    {sampler:surface([113,124,133],.2,1,.16),mask:(u,v)=>at(u,v).chip},
    {sampler:surface([161,79,35],.73,0,.23),mask:(u,v)=>at(u,v).steel},
    {sampler:surface([57,34,25],.86,0,.28),mask:(u,v)=>defect==='missing-oxide'?0:at(u,v).oxide},
    {sampler:surface([64,47,35],.77,0,.11),mask:(u,v)=>at(u,v).drip*.22},
  ]);
}

function material(bake, bumpScale=.025) {
  const textures=createThreeSurfaceTextures(bake);
  const result=new THREE.MeshStandardMaterial({map:textures.map,roughnessMap:textures.roughnessMap,bumpMap:textures.bumpMap,metalnessMap:textures.metalnessMap,metalness:1,roughness:1,bumpScale,side:THREE.DoubleSide});
  owned.push(textures,result);
  return result;
}

function add(geometry, surface, position, rotation=0) {
  const mesh=new THREE.Mesh(geometry,surface);
  mesh.position.set(...position); mesh.rotation.y=rotation;
  owned.push(geometry); content.add(mesh); return mesh;
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
    shaderCompileCount,contextLost:gl.isContextLost(),physicalBounds:new THREE.Box3().setFromObject(content).getSize(new THREE.Vector3()).toArray()};
}

function resize() {
  const width=canvas.parentElement.clientWidth; const height=canvas.parentElement.clientHeight;
  renderer.setSize(width,height,false); camera.aspect=width/height;
  if(content.children.length) {
    const bounds=new THREE.Box3().setFromObject(content);
    const size=bounds.getSize(new THREE.Vector3()); const center=bounds.getCenter(new THREE.Vector3());
    const vertical=THREE.MathUtils.degToRad(camera.fov/2);
    const horizontal=Math.atan(Math.tan(vertical)*camera.aspect);
    const distance=1.18*Math.max(size.x/(2*Math.tan(horizontal)),size.y/(2*Math.tan(vertical)))+size.z*.8;
    controls.target.copy(center);
    camera.position.copy(center).add(new THREE.Vector3(.42,.3,.86).normalize().multiplyScalar(distance));
    controls.update();
  }
  camera.updateProjectionMatrix(); render();
}

function rebuild() {
  window.__proceduralDemo={...window.__proceduralDemo,ready:false};
  content.clear(); for(const resource of owned.splice(0))resource.dispose();
  const sampler=wearSampler(scale);
  const bake=bakeSurface(sampler,{width:256,height:256});
  if(mode==='materials') {
    const panel=add(new THREE.BoxGeometry(1.28,1.75,.075,1,1,1),material(bake),[-1.05,.88,0],-.08);
    add(new THREE.BoxGeometry(1.15,1.15,1.15),material(bake),[1.0,.58,0],-.4);
    panel.rotation.z=.025;
    document.querySelector('#caption').textContent='Coating → exposed metal → oxide · one coordinated field';
  } else if(mode==='geometry') {
    add(createThreeMeshGeometry(lathe()),material(bake),[-1.25,0,0]);
    const path=Array.from({length:44},(_,index)=>{
      const t=index/43; return {x:.45*Math.sin(t*Math.PI*2),y:.08+t*1.25,z:.25*Math.cos(t*Math.PI*2)};
    });
    add(createThreeMeshGeometry(createSweptMesh({path,radius:(t)=>.095+.055*Math.sin(t*Math.PI),radialSegments:20})),material(bake),[.1,0,0]);
    const sheet=createSheetMesh({width:1.0,height:1.4,columns:50,rows:50,heightAt:(u,v)=>.065*Math.sin(u*Math.PI*10)*Math.sin(v*Math.PI)});
    const object=add(createThreeMeshGeometry(sheet),material(bake),[1.5,.7,0]); object.rotation.x=Math.PI/2;
    document.querySelector('#caption').textContent='Revolve · parallel-transport sweep · corrugated sheet';
  } else {
    const data=lathe();
    const plan=createReskinPlan(data);
    const worldSampler={sample(u,v){return sampler.sample(u+.5,.5-v);}};
    const atlas=bakeUvAtlas(data,worldSampler,{width:512,height:512,padding:2,scale:1,sharpness:4});
    add(createThreeMeshGeometry(data),material(atlas),[-.85,0,0]);
    const previewTextures=createThreeSurfaceTextures(atlas);
    const plane=add(new THREE.PlaneGeometry(1.6,1.6),new THREE.MeshBasicMaterial({map:previewTextures.map,side:THREE.DoubleSide}),[1.0,.9,0]);
    owned.push(previewTextures,plane.material);
    document.querySelector('#caption').textContent=`Surface-sampled UV bake · ${Math.round(atlas.covered*100)}% texel coverage · ${plan.projection} planning`;
  }
  const patched=new THREE.MeshStandardMaterial({color:'#bea371',metalness:.8,roughness:.32});
  patched.onBeforeCompile=(shader)=>{
    shader.vertexShader=applyShaderPatches(shader.vertexShader,[{anchor:'#include <begin_vertex>',replacement:'#include <begin_vertex>\ntransformed += normal * (0.012 * sin(position.x * 22.0) * sin(position.y * 18.0));'}]);
    shaderCompileCount+=1;
  };
  patched.customProgramCacheKey=()=> 'procedural-gallery-relief-v1';
  owned.push(patched);
  add(new THREE.SphereGeometry(.17,40,24),patched,[0,.2,1.12]);
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
  setDefect(value){defect=value; rebuild();},
  restore(){fieldOverride=undefined; defect=undefined; rebuild();},
};
rebuild();
