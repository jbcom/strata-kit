import { createHash } from "node:crypto";
import { writeFile } from "node:fs/promises";
import { expect, type Page, test } from "@playwright/test";
import * as shaderExports from "../src/shaders.ts";

type Pair = readonly [number, number];
type Four = readonly [number, number, number, number];
interface Config {
  seedKey: number;
  tileScale: number;
  rotationStrength: number;
  offsetScale: number;
  luminanceInfluence: number;
  gainExponent: number;
  normalChannels: number;
  inputNormalYSign: number;
}
interface Plan {
  cell: Pair;
  base: number;
  uv: Pair;
  dx: Pair;
  dy: Pair;
  cs: Pair;
  coordinateError: number;
  gradientError: number;
}
interface Query {
  name: string;
  uv: Pair;
  dx: Pair;
  dy: Pair;
  cfg: Config;
  wrapper: number;
  layer: number;
  texture: "constant" | "mip" | "black" | "underflow";
  boundary: boolean;
}

const F = Math.fround,
  U = 2 ** -24,
  N = 2 ** -126,
  T = 2 ** -20,
  P = 2 ** -18;
const K = F(3.464101552963257),
  I = F(0.28867512941360474),
  PI = F(Math.PI),
  TAU = F(2 * Math.PI);
const LR = F(0.299),
  LG = F(0.587),
  LB = F(0.114);
const Te = T + 8 * U * PI;
const kernel = (shaderExports as unknown as { hexTilingGlsl?: string }).hexTilingGlsl;
const vertices = `#version 300 es
void main(){vec2 p=vec2(float((gl_VertexID<<1)&2),float(gl_VertexID&2));gl_Position=vec4(p*2.0-1.0,0,1);}`;
const hashVectors = [
  {
    key: 0,
    cell: [0, 0],
    hashes: [0x00000000, 0xc4ada425, 0x895a484a],
    low: [0, 11379749, 5916746],
  },
  {
    key: 1,
    cell: [0, 0],
    hashes: [0x4bf1d490, 0x109eef77, 0xd54cb53d],
    low: [15848592, 10415991, 5027133],
  },
  {
    key: 0xffffffff,
    cell: [-1, 1],
    hashes: [0x8cda1ff9, 0xdb5052fb, 0x94c106f2],
    low: [14295033, 5264123, 12650226],
  },
  {
    key: 0x80000000,
    cell: [4097, -4096],
    hashes: [0xad2351d9, 0xef6f4a1d, 0xbf27b0cd],
    low: [2314713, 7293469, 2601165],
  },
  {
    key: 0x7fffffff,
    cell: [-4096, 4097],
    hashes: [0xc2b33174, 0xd7669b29, 0x9740f397],
    low: [11743604, 6724393, 4256663],
  },
  {
    key: 0x12345678,
    cell: [-17, 31],
    hashes: [0xb9d5f2d6, 0x4d1be790, 0xbcaa00b9],
    low: [14021334, 1828752, 11141305],
  },
] as const;

// Independently specified BigInt arithmetic, rather than the implementation's
// imul/hash helper. Literal vectors above independently pin every domain.
function hash(cell: Pair, key: number, domain: number) {
  const mask = 0xffffffffn,
    low = (value: bigint) => value & mask;
  let h =
    BigInt(key) ^
    low(BigInt(cell[0]) * 374761393n) ^
    low(BigInt(domain) * 668265263n) ^
    low(BigInt(cell[1]) * 2147483647n);
  h = low((h ^ (h >> 13n)) * 1274126177n);
  return Number(low(h ^ (h >> 16n)));
}
function gain(x: number, exponent: number) {
  if (x <= 0) return 0;
  if (x >= 1) return 1;
  if (x === 0.5) return 0.5;
  return x < 0.5
    ? F(0.5 * F(F(2 * x) ** exponent))
    : F(1 - F(0.5 * F(F(2 * F(1 - x)) ** exponent)));
}
const rotate = ([a, b]: Pair, [c, s]: Pair): Pair => [
  F(F(a * c) - F(b * s)),
  F(F(a * s) + F(b * c)),
];
const rotationError = ([a, b]: Pair) =>
  (Math.abs(a) + Math.abs(b)) * Te + 32 * U * Math.max(1, Math.abs(a) + Math.abs(b));

function plans(query: Query) {
  const cfg = query.cfg,
    uv = query.uv.map(F) as unknown as Pair;
  const tu = F(uv[0] / cfg.tileScale),
    tv = F(uv[1] / cfg.tileScale);
  const gx = F(F(K * tu) - F(2 * tv)),
    gy = F(4 * tv);
  const ix = Math.floor(gx),
    iy = Math.floor(gy),
    fx = F(gx - ix),
    fy = F(gy - iy);
  const residual = F(F(1 - fx) - fy);
  const cells: Pair[] =
    residual > 0
      ? [
          [ix, iy],
          [ix, iy + 1],
          [ix + 1, iy],
        ]
      : [
          [ix + 1, iy + 1],
          [ix + 1, iy],
          [ix, iy + 1],
        ];
  const raw = residual > 0 ? [residual, fy, fx] : [F(-residual), F(1 - fy), F(1 - fx)];
  const sum = F(F(raw[0] + raw[1]) + raw[2]);
  const bgrid = 16 * U * Math.max(1, Math.abs(K * tu) + 2 * Math.abs(tv), 4 * Math.abs(tv));
  const bbase = 8 * bgrid + 64 * U;
  const margin = Math.min(fx, 1 - fx, fy, 1 - fy, Math.abs(residual));
  const result: Plan[] = cells.map((cell, index) => {
    const unit = (domain: number) => (hash(cell, cfg.seedKey, domain) & 0xffffff) / 16777216;
    const theta = F(F(F(unit(2) * TAU) - PI) * cfg.rotationStrength);
    const cs: Pair = [F(Math.cos(theta)), F(Math.sin(theta))];
    const centre: Pair = [
      F(F(F(cell[0] + F(0.5 * cell[1])) * I) * cfg.tileScale),
      F(F(0.25 * cell[1]) * cfg.tileScale),
    ];
    const amplitude = F(cfg.tileScale * cfg.offsetScale),
      offset: Pair = [F(unit(0) * amplitude), F(unit(1) * amplitude)];
    const relative: Pair = [F(uv[0] - centre[0]), F(uv[1] - centre[1])];
    const rotated = rotate(relative, cs);
    const coordinateError =
      rotationError(relative) +
      32 *
        U *
        Math.max(
          1,
          Math.abs(uv[0]) +
            Math.abs(uv[1]) +
            Math.abs(centre[0]) +
            Math.abs(centre[1]) +
            Math.abs(offset[0]) +
            Math.abs(offset[1]),
        );
    return {
      cell,
      base: F(raw[index] / sum),
      uv: [F(F(rotated[0] + centre[0]) + offset[0]), F(F(rotated[1] + centre[1]) + offset[1])],
      dx: rotate(query.dx, cs),
      dy: rotate(query.dy, cs),
      cs,
      coordinateError,
      gradientError: Math.max(rotationError(query.dx), rotationError(query.dy)),
    };
  });
  return { plans: result, bgrid, bbase, ordinary: margin > 4 * bgrid, margin, grid: [gx, gy] };
}

const mipColors: Four[][] = [
  [
    [0.125, 0.25, 0.375, 1],
    [0.75, 0.125, 0.25, 1],
    [0.125, 0.875, 0.25, 1],
    [0.25, 0.125, 0.875, 1],
    [0.875, 0.75, 0.125, 1],
  ],
  [
    [0.625, 0.25, 0.125, 1],
    [0.125, 0.625, 0.75, 1],
    [0.875, 0.125, 0.625, 1],
    [0.125, 0.875, 0.875, 1],
    [0.375, 0.125, 0.75, 1],
  ],
];
function texturePair(query: Query, plan: Plan) {
  const layer = query.layer;
  let surface: Four = layer === 0 ? [0.2, 0.4, 0.6, 0.8] : [0.7, 0.1, 0.3, 0.6];
  let lod = 0,
    lodStable = true;
  if (query.texture === "black") surface = [0, 0, 0, 0.75];
  if (query.texture === "underflow") surface = [1e-4, 1e-4, 1e-4, 0.75];
  if (query.texture === "mip") {
    const rho = Math.max(
      Math.hypot(16 * plan.dx[0], 4 * plan.dx[1]),
      Math.hypot(16 * plan.dy[0], 4 * plan.dy[1]),
    );
    const erho = Math.hypot(16 * plan.gradientError, 4 * plan.gradientError);
    const level = (value: number) =>
      Math.max(0, Math.min(4, Math.floor(Math.log2(Math.max(value, 2 ** -126)) + 0.5)));
    lod = level(rho);
    lodStable = level(Math.max(0, rho - erho)) === lod && level(rho + erho) === lod;
    surface = mipColors[layer][lod];
  }
  const slope: Pair = layer === 0 ? [1, 2] : [-2, 1],
    length = Math.sqrt(1 + slope[0] ** 2 + slope[1] ** 2);
  const nx = -slope[0] / length,
    ny = -slope[1] / length;
  const r = F(0.5 + nx * 0.5),
    y = F(0.5 + ny * query.cfg.inputNormalYSign * 0.5);
  const normal: Four = query.cfg.normalChannels === 0 ? [r, y, 0.125, 0.875] : [r, 0.875, 0.125, y];
  return { surface: surface.map(F) as unknown as Four, normal, lod, lodStable };
}
function reference(query: Query) {
  const plan = plans(query),
    cfg = query.cfg;
  const samples = plan.plans.map((p) => texturePair(query, p));
  const raw = samples.map(({ surface }, index) => {
    const lum = F(F(F(surface[0] * LR) + F(surface[1] * LG)) + F(surface[2] * LB));
    const factor = F(F(1 - cfg.luminanceInfluence) + F(F(2 * cfg.luminanceInfluence) * lum));
    return { x: F(plan.plans[index].base * factor), factor };
  });
  const gains = raw.map(({ x }) => gain(x, cfg.gainExponent)),
    sum = F(F(gains[0] + gains[1]) + gains[2]);
  const weights = sum > 0 ? gains.map((g) => F(g / sum)) : plan.plans.map((p) => p.base);
  const normals = samples.map(({ normal }, index) => {
    const nx = F(F(2 * normal[0]) - 1),
      ny = F(F(F(2 * normal[cfg.normalChannels === 0 ? 1 : 3]) - 1) * cfg.inputNormalYSign);
    const [c, s] = plan.plans[index].cs;
    return [F(F(c * nx) + F(s * ny)), F(F(-s * nx) + F(c * ny))];
  });
  const blend = (values: number[]) =>
    F(F(F(values[0] * weights[0]) + F(values[1] * weights[1])) + F(values[2] * weights[2]));
  const surface = [0, 1, 2, 3].map((channel) => blend(samples.map((s) => s.surface[channel])));
  const normal = [0, 1].map((channel) => blend(normals.map((n) => n[channel])));
  const gainErrors = raw.map(({ x, factor }, index) => {
    // Constant texels have UV Lipschitz0 and no spatial interpolation error.
    // Mip fixtures are admitted only if all perturbed gradients keep their LOD.
    const eLum = 8 * U,
      eFactor = 2 * cfg.luminanceInfluence * eLum + 8 * U;
    const ex =
      Math.abs(factor) * plan.bbase +
      Math.abs(plan.plans[index].base) * eFactor +
      plan.bbase * eFactor +
      8 * U;
    return (
      Math.max(
        Math.abs(gain(x + ex, cfg.gainExponent) - gains[index]),
        Math.abs(gains[index] - gain(Math.max(0, x - ex), cfg.gainExponent)),
      ) +
      (P + 8 * U) * gains[index] +
      8 * N
    );
  });
  const totalError = gainErrors.reduce((a, b) => a + b, 0);
  const degenerate = query.texture === "black" || query.texture === "underflow";
  const conditioned = sum > 2 * totalError;
  const weightErrors = degenerate
    ? weights.map(() => plan.bbase)
    : gainErrors.map(
        (error, index) => (error + weights[index] * totalError) / (sum - totalError) + 8 * U,
      );
  const surfaceErrors = [0, 1, 2, 3].map((channel) =>
    weightErrors.reduce(
      (s, error, index) => s + error * Math.abs(samples[index].surface[channel]),
      16 * U,
    ),
  );
  const normalErrors = [0, 1].map((channel) =>
    weightErrors.reduce(
      (s, error, index) =>
        s +
        error * Math.abs(normals[index][channel]) +
        weights[index] *
          (rotationError([
            F(2 * samples[index].normal[0] - 1),
            F(
              (2 * samples[index].normal[cfg.normalChannels === 0 ? 1 : 3] - 1) *
                cfg.inputNormalYSign,
            ),
          ]) +
            16 * U),
      16 * U,
    ),
  );
  return {
    ...plan,
    samples,
    weights,
    surface,
    normal,
    weightErrors,
    surfaceErrors,
    normalErrors,
    conditioned,
    degenerate,
    sum,
  };
}

const cfg = (patch: Partial<Config> = {}): Config => ({
  seedKey: 0x12345678,
  tileScale: 1,
  rotationStrength: 1,
  offsetScale: 3,
  luminanceInfluence: F(0.6),
  gainExponent: F(Math.log1p(-0.6) / Math.log(0.5)),
  normalChannels: 0,
  inputNormalYSign: 1,
  ...patch,
});
function corpus() {
  const ordinary: Query[] = [];
  let index = 0;
  for (const uv of [
    [0.137, 0.219],
    [-0.413, 0.367],
  ] as Pair[])
    for (const scale of [0.5, 1, 2])
      for (const rotation of [0, 0.5, 1])
        for (const influence of [0, F(0.6)])
          for (const exponent of [1, 2, cfg().gainExponent]) {
            const config = cfg({
              seedKey: index % 2 ? 0xffffffff : 0x12345678,
              tileScale: scale,
              rotationStrength: rotation,
              offsetScale: index % 2 ? 0 : 3,
              luminanceInfluence: influence,
              gainExponent: exponent,
              normalChannels: index % 2,
              inputNormalYSign: index % 3 ? 1 : -1,
            });
            for (const [wrapper, layer] of [
              [0, 0],
              [1, 0],
              [1, 1],
            ])
              ordinary.push({
                name: `ordinary-${index}-${wrapper}-${layer}`,
                uv: uv.map(F) as unknown as Pair,
                dx: [0.03125, 0.015625],
                dy: [-0.0078125, 0.0625],
                cfg: config,
                wrapper,
                layer,
                texture: "constant",
                boundary: false,
              });
            index++;
          }
  const targeted: Query[] = [];
  for (const wrapper of [0, 1])
    for (const texture of ["black", "underflow"] as const)
      for (const uv of [
        [0.137, 0.219],
        [0, 0],
      ] as Pair[])
        targeted.push({
          name: `${texture}-${wrapper}-${uv}`,
          uv,
          dx: [0.01, 0],
          dy: [0, 0.02],
          cfg: cfg({ luminanceInfluence: 1, gainExponent: texture === "underflow" ? 53 : 2 }),
          wrapper,
          layer: wrapper,
          texture,
          boundary: uv[0] === 0,
        });
  for (const wrapper of [0, 1])
    for (const uv of [
      [0, 0],
      [F(0.75 * I), 0.125],
      [F(0.75 * I - 2 ** -20), 0.125],
      [F(0.75 * I + 2 ** -20), 0.125],
      [F(4095.5 * I), 0],
      [F(-4095.5 * I), 0],
    ] as Pair[])
      targeted.push({
        name: `boundary-${wrapper}-${uv}`,
        uv,
        dx: [0.01, 0],
        dy: [0, 0.02],
        cfg: cfg({ offsetScale: 0, luminanceInfluence: 0, gainExponent: 1 }),
        wrapper,
        layer: 0,
        texture: "constant",
        boundary: true,
      });
  for (let i = 0; i < 12; i++) {
    const query: Query = {
      name: `mip-${i}`,
      uv: [F(0.137 + i * 0.021), F(0.219 - i * 0.013)],
      dx: [0.25, 0],
      dy: [0, 0.0625],
      cfg: cfg({
        tileScale: 2,
        rotationStrength: (i % 3) / 2,
        luminanceInfluence: 0,
        gainExponent: 1,
        normalChannels: i % 2,
        inputNormalYSign: -1,
      }),
      wrapper: i % 2,
      layer: i % 2,
      texture: "mip",
      boundary: false,
    };
    targeted.push(query);
  }
  return { ordinary, targeted };
}

function changeBody(source: string, name: string, make: (args: string[], body: string) => string) {
  const match = new RegExp(
    `\\b(?:highp\\s+)?(?:uint|vec2)\\s+${name}\\s*\\(([^)]*)\\)\\s*\\{`,
  ).exec(source);
  if (!match) throw new Error(`Required private shader test hook missing: ${name}`);
  const args = match[1]
    .split(",")
    .map((part) => part.trim().match(/([A-Za-z_]\w*)\s*$/)?.[1] ?? "");
  const begin = match.index + match[0].length;
  let end = begin,
    depth = 1;
  while (depth && end < source.length) {
    if (source[end] === "{") depth++;
    if (source[end] === "}") depth--;
    end++;
  }
  if (depth) throw new Error(`Unbalanced test hook ${name}`);
  return source.slice(0, begin) + make(args, source.slice(begin, end - 1)) + source.slice(end - 1);
}
function reuseHashDomain(source: string) {
  return changeBody(source, "strataHexHash", ([, , domain], body) => {
    const changed = body.replace(new RegExp(`\\b${domain}\\b`, "g"), "0u");
    if (changed === body) throw new Error("Hash domain mutation site missing");
    return changed;
  });
}
function instrument(source: string, defect = "") {
  let code = source;
  if (defect === "normal-forward")
    code = changeBody(
      code,
      "strataHexTransportNormal",
      ([row, cs]) => `return strataHexRotate(${row},${cs});`,
    );
  if (defect === "missing-sign") {
    const changed = code.replace(/\b[A-Za-z_]\w*\.inputNormalYSign\b/g, "1.0");
    if (changed === code) throw new Error("Input sign mutation site missing");
    code = changed;
  }
  if (defect === "domain-reuse") code = reuseHashDomain(code);
  const hashMatch = /\b(?:highp\s+)?uint\s+strataHexHash\s*\(([^)]*)\)\s*\{/.exec(code);
  if (!hashMatch) throw new Error("Integer hash hook missing");
  const names = hashMatch[1].split(",").map((part) => part.trim().match(/([A-Za-z_]\w*)\s*$/)?.[1]);
  const point = hashMatch.index + hashMatch[0].length;
  code =
    code.slice(0, point) +
    `if(${names[2]}==0u){bool seen=false;for(int i=0;i<3;i++){if(i<capturedCellsCount && all(equal(capturedCells[i],${names[0]})))seen=true;}if(!seen && capturedCellsCount<3)capturedCells[capturedCellsCount++]=${names[0]};}` +
    code.slice(point);
  code = code.replace(
    /\btextureGrad\s*\(/g,
    defect === "gradient-scale" ? "wrongTextureGrad(" : "observedTextureGrad(",
  );
  return code;
}

const declarations = `
uniform uint uKey; uniform vec2 uUv,uDx,uDy; uniform float uTileScale,uRotation,uOffset,uInfluence,uExponent,uSign;
uniform int uPacking,uLayer,uWrapper; uniform highp sampler2D uSurface,uNormal; uniform highp sampler2DArray uSurfaceArray,uNormalArray;
ivec2 capturedCells[3]; int capturedCellsCount=0; vec2 fetchUv[6],fetchDx[6],fetchDy[6];float fetchLayer[6];int fetchCount=0;
void recordFetch(vec2 uv,vec2 dx,vec2 dy,float layer){if(fetchCount<6){fetchUv[fetchCount]=uv;fetchDx[fetchCount]=dx;fetchDy[fetchCount]=dy;fetchLayer[fetchCount]=layer;fetchCount++;}}
vec4 observedTextureGrad(sampler2D t,vec2 uv,vec2 dx,vec2 dy){recordFetch(uv,dx,dy,-1.0);return textureGrad(t,uv,dx,dy);}
vec4 observedTextureGrad(sampler2DArray t,vec3 uv,vec2 dx,vec2 dy){recordFetch(uv.xy,dx,dy,uv.z);return textureGrad(t,uv,dx,dy);}
vec4 wrongTextureGrad(sampler2D t,vec2 uv,vec2 dx,vec2 dy){recordFetch(uv,dx/uTileScale,dy/uTileScale,-1.0);return textureGrad(t,uv,dx/uTileScale,dy/uTileScale);}
vec4 wrongTextureGrad(sampler2DArray t,vec3 uv,vec2 dx,vec2 dy){recordFetch(uv.xy,dx/uTileScale,dy/uTileScale,uv.z);return textureGrad(t,uv,dx/uTileScale,dy/uTileScale);}
`;
function wrapperFragment(source: string, defect = "") {
  return `#version 300 es
precision highp float;precision highp int;precision highp sampler2D;precision highp sampler2DArray;
${declarations}\n${instrument(source, defect)}
out vec4 outColor;
void main(){
StrataHexConfig cfg;cfg.seedKey=uKey;cfg.tileScale=uTileScale;cfg.rotationStrength=uRotation;cfg.offsetScale=uOffset;cfg.luminanceInfluence=uInfluence;cfg.gainExponent=uExponent;cfg.normalChannels=uPacking;cfg.inputNormalYSign=uSign;
StrataHexResult r;if(uWrapper==0)r=strataSampleHex2D(uSurface,uNormal,uUv,uDx,uDy,cfg);else r=strataSampleHexArray(uSurfaceArray,uNormalArray,uLayer,uUv,uDx,uDy,cfg);
int slot=int(gl_FragCoord.x);if(slot==0)outColor=r.surface;else if(slot==1)outColor=vec4(r.normalXY,r.weights.xy);else if(slot==2)outColor=vec4(r.weights.z,float(capturedCellsCount),float(fetchCount),1);else if(slot==3)outColor=vec4(vec2(capturedCells[0]),vec2(capturedCells[1]));else if(slot==4)outColor=vec4(vec2(capturedCells[2]),0,0);else if(slot<11){int i=slot-5;outColor=vec4(fetchUv[i],fetchLayer[i],0);}else{int i=slot-11;outColor=vec4(fetchDx[i],fetchDy[i]);}}
`;
}

async function readback(
  page: Page,
  source: string,
  queries: Query[],
  mode = "wrapper",
  defect = "",
) {
  const fragment =
    mode === "wrapper"
      ? wrapperFragment(source, defect)
      : `#version 300 es
precision highp float;precision highp int;precision highp sampler2D;precision highp sampler2DArray;
uniform uint uKey,uDomain;uniform ivec2 uCell;uniform vec2 uRow,uCs;uniform float uX,uExponent;uniform int uMode;
${source}
${mode === "integer" ? "layout(location=0)out highp uvec4 outputValue;void main(){uint h=strataHexHash(uCell,uKey,uDomain);outputValue=uvec4(h,h&0x00ffffffu,uDomain,uKey);}" : "out vec4 outputValue;void main(){if(uMode==0){uint h=strataHexHash(uCell,uKey,uDomain);outputValue=vec4(float(h&0x00ffffffu)/16777216.0,0,0,1);}else if(uMode==1)outputValue=vec4(strataHexGain(uX,uExponent),sin(uX),cos(uX),pow(uX,uExponent));else if(uMode==2)outputValue=vec4(strataHexRotate(uRow,uCs),strataHexTransportNormal(uRow,uCs));else outputValue=vec4(sin(uX),cos(uX),0,1);}"}`;
  return page.evaluate(
    ({ vertex, fragment, queries, mode, mipColors, hashVectors }) => {
      let audioGuardVerified = false;
      if (typeof AudioContext === "function") {
        Object.defineProperty(window, "AudioContext", {
          configurable: true,
          value: new Proxy(AudioContext, {
            construct() {
              throw new Error("Audio forbidden in hex GPU proof");
            },
          }),
        });
        try {
          new AudioContext();
        } catch (error) {
          audioGuardVerified =
            error instanceof Error && error.message === "Audio forbidden in hex GPU proof";
        }
      }
      if (!audioGuardVerified) throw new Error("Audio guard missing");
      const canvas = document.createElement("canvas");
      canvas.width = mode === "wrapper" ? 17 : 1;
      canvas.height = 1;
      const gl = canvas.getContext("webgl2", { antialias: false });
      if (!gl?.getExtension("EXT_color_buffer_float"))
        throw new Error("WebGL2 float targets required");
      const debug = gl.getExtension("WEBGL_debug_renderer_info");
      const hardware = {
        renderer: gl.getParameter(debug ? debug.UNMASKED_RENDERER_WEBGL : gl.RENDERER),
        precision: gl.getShaderPrecisionFormat(gl.FRAGMENT_SHADER, gl.HIGH_FLOAT)?.precision ?? 0,
      };
      if (hardware.precision < 23) throw new Error("highp Float32 required");
      const programs: WebGLProgram[] = [],
        shaders: WebGLShader[] = [],
        textures: WebGLTexture[] = [],
        framebuffers: WebGLFramebuffer[] = [],
        vaos: WebGLVertexArrayObject[] = [];
      const compile = (kind: number, text: string) => {
        const s = gl.createShader(kind);
        if (!s) throw new Error("Shader allocation");
        shaders.push(s);
        gl.shaderSource(s, text);
        gl.compileShader(s);
        if (!gl.getShaderParameter(s, gl.COMPILE_STATUS))
          throw new Error(gl.getShaderInfoLog(s) ?? "compile");
        return s;
      };
      const observations: { name: string; values: number[] }[] = [];
      try {
        const p = gl.createProgram(),
          fb = gl.createFramebuffer(),
          vao = gl.createVertexArray();
        if (!p || !fb || !vao) throw new Error("Allocation");
        programs.push(p);
        framebuffers.push(fb);
        vaos.push(vao);
        gl.attachShader(p, compile(gl.VERTEX_SHADER, vertex));
        gl.attachShader(p, compile(gl.FRAGMENT_SHADER, fragment));
        gl.linkProgram(p);
        if (!gl.getProgramParameter(p, gl.LINK_STATUS))
          throw new Error(gl.getProgramInfoLog(p) ?? "link");
        // biome-ignore lint/correctness/useHookAtTopLevel: WebGL program selection.
        gl.useProgram(p);
        gl.bindVertexArray(vao);
        gl.bindFramebuffer(gl.FRAMEBUFFER, fb);
        const output = gl.createTexture();
        if (!output) throw new Error("Output texture");
        textures.push(output);
        gl.bindTexture(gl.TEXTURE_2D, output);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
        gl.texImage2D(
          gl.TEXTURE_2D,
          0,
          mode === "integer" ? gl.RGBA32UI : gl.RGBA32F,
          canvas.width,
          1,
          0,
          mode === "integer" ? gl.RGBA_INTEGER : gl.RGBA,
          mode === "integer" ? gl.UNSIGNED_INT : gl.FLOAT,
          null,
        );
        gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, output, 0);
        if (gl.checkFramebufferStatus(gl.FRAMEBUFFER) !== gl.FRAMEBUFFER_COMPLETE)
          throw new Error("Framebuffer incomplete");
        const location = (name: string) => gl.getUniformLocation(p, name);
        const f1 = (name: string, value: number) => gl.uniform1f(location(name), value),
          i1 = (name: string, value: number) => gl.uniform1i(location(name), value),
          ui1 = (name: string, value: number) => gl.uniform1ui(location(name), value),
          f2 = (name: string, value: readonly number[]) =>
            gl.uniform2f(location(name), value[0], value[1]);
        const draw = (name: string) => {
          gl.drawArrays(gl.TRIANGLES, 0, 3);
          const out =
            mode === "integer"
              ? new Uint32Array(canvas.width * 4)
              : new Float32Array(canvas.width * 4);
          gl.readPixels(
            0,
            0,
            canvas.width,
            1,
            mode === "integer" ? gl.RGBA_INTEGER : gl.RGBA,
            mode === "integer" ? gl.UNSIGNED_INT : gl.FLOAT,
            out,
          );
          if (gl.getError() !== gl.NO_ERROR || [...out].some((v) => !Number.isFinite(v)))
            throw new Error("Invalid readback");
          observations.push({ name, values: [...out] });
        };
        gl.viewport(0, 0, canvas.width, 1);
        gl.disable(gl.DITHER);
        gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1);
        gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
        gl.pixelStorei(gl.UNPACK_COLORSPACE_CONVERSION_WEBGL, gl.NONE);
        if (mode !== "wrapper") {
          for (let row = 0; row < hashVectors.length; row++)
            for (let domain = 0; domain < 3; domain++) {
              const v = hashVectors[row];
              ui1("uKey", v.key);
              ui1("uDomain", domain);
              gl.uniform2i(location("uCell"), v.cell[0], v.cell[1]);
              i1("uMode", 0);
              draw(`hash-${row}-${domain}`);
            }
          if (mode === "primitive") {
            for (const exponent of [
              1,
              2,
              53,
              2 ** -126,
              Math.fround(Math.log1p(-0.6) / Math.log(0.5)),
            ])
              for (const x of [0, 0.125, 0.25, 0.5, 0.75, 1, 2]) {
                i1("uMode", 1);
                f1("uX", x);
                f1("uExponent", exponent);
                draw(`gain-${exponent}-${x}`);
              }
            for (const row of [
              [2, 3],
              [-5, 7],
              [-1 / Math.sqrt(2), 0],
              [0, -1 / Math.sqrt(2)],
              [-1 / Math.sqrt(6), -2 / Math.sqrt(6)],
            ])
              for (const cs of [
                [0, 1],
                [0, -1],
                [1, 0],
                [Math.fround(Math.cos(0.37)), Math.fround(Math.sin(0.37))],
              ]) {
                i1("uMode", 2);
                f2("uRow", row);
                f2("uCs", cs);
                draw(`rotation-${row.join(",")}-${cs.join(",")}`);
              }
            for (const theta of [-Math.PI, -Math.PI / 2, -0.37, 0, 0.37, Math.PI / 2, Math.PI]) {
              i1("uMode", 3);
              f1("uX", Math.fround(theta));
              draw(`trig-${theta}`);
            }
          }
        } else {
          const inputTextures: WebGLTexture[] = [];
          for (let unit = 0; unit < 4; unit++) {
            const t = gl.createTexture();
            if (!t) throw new Error("Input texture");
            textures.push(t);
            inputTextures.push(t);
            gl.activeTexture(gl.TEXTURE0 + unit);
            gl.bindTexture(unit < 2 ? gl.TEXTURE_2D : gl.TEXTURE_2D_ARRAY, t);
            gl.texParameteri(
              unit < 2 ? gl.TEXTURE_2D : gl.TEXTURE_2D_ARRAY,
              gl.TEXTURE_MIN_FILTER,
              gl.NEAREST,
            );
            gl.texParameteri(
              unit < 2 ? gl.TEXTURE_2D : gl.TEXTURE_2D_ARRAY,
              gl.TEXTURE_MAG_FILTER,
              gl.NEAREST,
            );
            gl.texParameteri(
              unit < 2 ? gl.TEXTURE_2D : gl.TEXTURE_2D_ARRAY,
              gl.TEXTURE_WRAP_S,
              gl.REPEAT,
            );
            gl.texParameteri(
              unit < 2 ? gl.TEXTURE_2D : gl.TEXTURE_2D_ARRAY,
              gl.TEXTURE_WRAP_T,
              gl.REPEAT,
            );
          }
          i1("uSurface", 0);
          i1("uNormal", 1);
          i1("uSurfaceArray", 2);
          i1("uNormalArray", 3);
          for (const query of queries) {
            for (let unit = 0; unit < 4; unit++) {
              const array = unit >= 2,
                normal = unit % 2 === 1,
                target = array ? gl.TEXTURE_2D_ARRAY : gl.TEXTURE_2D;
              gl.activeTexture(gl.TEXTURE0 + unit);
              gl.bindTexture(target, inputTextures[unit]);
              const mip = query.texture === "mip";
              gl.texParameteri(
                target,
                gl.TEXTURE_MIN_FILTER,
                mip ? gl.NEAREST_MIPMAP_NEAREST : gl.NEAREST,
              );
              gl.texParameteri(target, gl.TEXTURE_BASE_LEVEL, 0);
              gl.texParameteri(target, gl.TEXTURE_MAX_LEVEL, mip ? 4 : 0);
              for (let level = 0; level <= (mip ? 4 : 0); level++) {
                const width = mip ? Math.max(1, 16 >> level) : 1,
                  height = mip ? Math.max(1, 4 >> level) : 1,
                  depth = array ? 2 : 1;
                const data = new Float32Array(width * height * depth * 4);
                for (let layer = 0; layer < depth; layer++) {
                  const selected = array ? layer : query.layer;
                  const slope = selected === 0 ? [1, 2] : [-2, 1],
                    length = Math.sqrt(1 + slope[0] ** 2 + slope[1] ** 2);
                  const r = 0.5 - (slope[0] / length) * 0.5,
                    y = 0.5 - (slope[1] / length) * query.cfg.inputNormalYSign * 0.5;
                  let channels = normal
                    ? query.cfg.normalChannels === 0
                      ? [r, y, 0.125, 0.875]
                      : [r, 0.875, 0.125, y]
                    : selected === 0
                      ? [0.2, 0.4, 0.6, 0.8]
                      : [0.7, 0.1, 0.3, 0.6];
                  if (!normal && query.texture === "black") channels = [0, 0, 0, 0.75];
                  if (!normal && query.texture === "underflow") channels = [1e-4, 1e-4, 1e-4, 0.75];
                  if (!normal && mip) channels = mipColors[selected][level];
                  for (let pixel = 0; pixel < width * height; pixel++)
                    data.set(channels, (layer * width * height + pixel) * 4);
                }
                if (array)
                  gl.texImage3D(
                    target,
                    level,
                    gl.RGBA32F,
                    width,
                    height,
                    depth,
                    0,
                    gl.RGBA,
                    gl.FLOAT,
                    data,
                  );
                else
                  gl.texImage2D(
                    target,
                    level,
                    gl.RGBA32F,
                    width,
                    height,
                    0,
                    gl.RGBA,
                    gl.FLOAT,
                    data,
                  );
              }
            }
            ui1("uKey", query.cfg.seedKey);
            f1("uTileScale", query.cfg.tileScale);
            f1("uRotation", query.cfg.rotationStrength);
            f1("uOffset", query.cfg.offsetScale);
            f1("uInfluence", query.cfg.luminanceInfluence);
            f1("uExponent", query.cfg.gainExponent);
            f1("uSign", query.cfg.inputNormalYSign);
            i1("uPacking", query.cfg.normalChannels);
            i1("uLayer", query.layer);
            i1("uWrapper", query.wrapper);
            f2("uUv", query.uv);
            f2("uDx", query.dx);
            f2("uDy", query.dy);
            draw(query.name);
          }
        }
      } finally {
        gl.bindFramebuffer(gl.FRAMEBUFFER, null);
        gl.bindVertexArray(null);
        gl.useProgram(null);
        for (const o of framebuffers) gl.deleteFramebuffer(o);
        for (const o of textures) gl.deleteTexture(o);
        for (const o of vaos) gl.deleteVertexArray(o);
        for (const o of programs) gl.deleteProgram(o);
        for (const o of shaders) gl.deleteShader(o);
      }
      const deleted = {
        programs: programs.every((o) => !gl.isProgram(o)),
        shaders: shaders.every((o) => !gl.isShader(o)),
        textures: textures.every((o) => !gl.isTexture(o)),
        framebuffers: framebuffers.every((o) => !gl.isFramebuffer(o)),
        vaos: vaos.every((o) => !gl.isVertexArray(o)),
      };
      if (gl.getError() !== gl.NO_ERROR || Object.values(deleted).some((v) => !v))
        throw new Error("Cleanup incomplete");
      return {
        hardware,
        observations,
        deleted,
        audioGuardVerified,
        mediaElements: document.querySelectorAll("audio,video").length,
      };
    },
    { vertex: vertices, fragment, queries, mode, mipColors, hashVectors },
  );
}

function checkHardware(result: Awaited<ReturnType<typeof readback>>) {
  expect(result.hardware.renderer).toMatch(/Apple.*Metal|Metal.*Apple/i);
  expect(result.hardware.renderer).not.toMatch(/SwiftShader|llvmpipe|software/i);
  expect(result.audioGuardVerified).toBe(true);
  expect(result.mediaElements).toBe(0);
  expect(Object.values(result.deleted).every(Boolean)).toBe(true);
}
function evaluateWrapper(query: Query, actual: number[]) {
  const ref = reference(query),
    failures: string[] = [];
  const check = (value: number, expected: number, tolerance: number, name: string) => {
    if (!Number.isFinite(value) || Math.abs(value - expected) > tolerance)
      failures.push(`${name}:${value}/${expected} budget${tolerance}`);
  };
  if (actual[9] !== 3 || actual[10] !== 6)
    failures.push("three cells/six paired textureGrad reads required");
  const gpuCells = [
    [actual[12], actual[13]],
    [actual[14], actual[15]],
    [actual[16], actual[17]],
  ]
    .map((cell) => cell.join(","))
    .sort();
  if (
    !query.boundary &&
    gpuCells.join(";") !==
      ref.plans
        .map((p) => p.cell.join(","))
        .sort()
        .join(";")
  )
    failures.push("ordinary exact cell IDs");
  if (!query.boundary && !ref.ordinary)
    failures.push("ordinary fixture lacks declared address margin");
  if (!query.boundary && !ref.degenerate && !ref.conditioned)
    failures.push("unconditioned coupled gain fixture");
  if (ref.degenerate && ref.sum !== 0)
    failures.push("declared fallback fixture did not underflow to zero gain");
  if (query.texture === "mip" && !ref.samples.every((sample) => sample.lodStable))
    failures.push("mip fixture lacks predetermined LOD margin");
  const boundaryAllowance = query.boundary ? 8 * ref.bbase + 32 * U : 0;
  ref.surface.forEach((value, index) => {
    check(actual[index], value, ref.surfaceErrors[index] + boundaryAllowance, `surface${index}`);
  });
  ref.normal.forEach((value, index) => {
    check(actual[4 + index], value, ref.normalErrors[index] + boundaryAllowance, `normal${index}`);
  });
  if (!query.boundary)
    ref.weights.forEach((value, index) => {
      check(actual[index === 2 ? 8 : 6 + index], value, ref.weightErrors[index], `weight${index}`);
    });
  if (!query.boundary) {
    const choices: number[][] = [];
    for (let fetch = 0; fetch < 6; fetch++) {
      const uv = actual.slice((5 + fetch) * 4, (5 + fetch) * 4 + 2),
        grad = actual.slice((11 + fetch) * 4, (11 + fetch) * 4 + 4);
      const slots = ref.plans.flatMap((p, index) =>
        uv.every((v, i) => Math.abs(v - p.uv[i]) <= p.coordinateError) &&
        grad.every((v, i) => Math.abs(v - [...p.dx, ...p.dy][i]) <= p.gradientError)
          ? [2 * index, 2 * index + 1]
          : [],
      );
      choices.push(slots);
      if (slots.length === 0)
        failures.push("observed sample plan outside coordinate/gradient budget");
      if (actual[(5 + fetch) * 4 + 2] !== (query.wrapper === 0 ? -1 : query.layer))
        failures.push("array layer changed");
    }
    // Coincident plans are indistinguishable in the readback. Match the six
    // reads to two slots per plan rather than assigning ambiguous reads greedily.
    // There are at most 64 used-slot states and recursion is bounded by six.
    const rejected = new Set<number>();
    const assign = (fetch: number, used: number): boolean => {
      if (fetch === 6) return true;
      if (rejected.has(used)) return false;
      for (const slot of choices[fetch])
        if ((used & (1 << slot)) === 0 && assign(fetch + 1, used | (1 << slot))) return true;
      rejected.add(used);
      return false;
    };
    if (!assign(0, 0)) failures.push("each cell must feed both maps");
  }
  return { failures, ref };
}

test("integer-v1 hex kernels and both typed wrappers meet frozen independent readback budgets", async ({
  page,
}, info) => {
  test.setTimeout(120_000);
  expect(typeof kernel).toBe("string");
  if (typeof kernel !== "string") throw new Error("hexTilingGlsl export missing");
  const pageErrors: string[] = [],
    consoleErrors: string[] = [];
  page.on("pageerror", (error) => pageErrors.push(String(error)));
  page.on("console", (message) => {
    if (message.type() === "error") consoleErrors.push(message.text());
  });
  const integer = await readback(page, kernel, [], "integer");
  checkHardware(integer);
  for (let row = 0; row < hashVectors.length; row++)
    for (let domain = 0; domain < 3; domain++) {
      const v = hashVectors[row],
        got = integer.observations[row * 3 + domain].values;
      expect(got).toEqual([v.hashes[domain], v.low[domain], domain, v.key]);
      expect(hash(v.cell, v.key, domain)).toBe(v.hashes[domain]);
    }
  const primitives = await readback(page, kernel, [], "primitive");
  checkHardware(primitives);
  for (let row = 0; row < hashVectors.length; row++)
    for (let domain = 0; domain < 3; domain++)
      expect(primitives.observations[row * 3 + domain].values[0]).toBe(
        hashVectors[row].low[domain] / 16777216,
      );
  let primitiveIndex = 18;
  for (const exponent of [1, 2, 53, N, cfg().gainExponent])
    for (const x of [0, 0.125, 0.25, 0.5, 0.75, 1, 2]) {
      const observation = primitives.observations[primitiveIndex++],
        g = gain(x, exponent),
        actual = observation.values;
      const exact = x === 0 || x === 0.5 || x >= 1;
      expect(Math.abs(actual[0] - g)).toBeLessThanOrEqual(exact ? 0 : (P + 8 * U) * g + 8 * N);
      expect(Math.abs(actual[1] - Math.sin(F(x)))).toBeLessThanOrEqual(T);
      expect(Math.abs(actual[2] - Math.cos(F(x)))).toBeLessThanOrEqual(T);
      const power = F(x) ** F(exponent);
      if (Number.isFinite(power) && power >= N)
        expect(Math.abs(actual[3] - power)).toBeLessThanOrEqual(P * power + 8 * N);
    }
  for (const row of [
    [2, 3],
    [-5, 7],
    [-1 / Math.sqrt(2), 0],
    [0, -1 / Math.sqrt(2)],
    [-1 / Math.sqrt(6), -2 / Math.sqrt(6)],
  ])
    for (const cs of [
      [0, 1],
      [0, -1],
      [1, 0],
      [F(Math.cos(0.37)), F(Math.sin(0.37))],
    ]) {
      const [a, b] = row.map(F),
        [c, s] = cs,
        actual = primitives.observations[primitiveIndex++].values;
      const expected = [a * c - b * s, a * s + b * c, c * a + s * b, -s * a + c * b];
      expected.forEach((value, index) => {
        expect(Math.abs(actual[index] - value)).toBeLessThanOrEqual(rotationError([a, b]) + 16 * U);
      });
    }
  for (const theta of [-Math.PI, -Math.PI / 2, -0.37, 0, 0.37, Math.PI / 2, Math.PI]) {
    const actual = primitives.observations[primitiveIndex++].values;
    expect(Math.abs(actual[0] - Math.sin(F(theta)))).toBeLessThanOrEqual(T);
    expect(Math.abs(actual[1] - Math.cos(F(theta)))).toBeLessThanOrEqual(T);
  }
  expect(primitiveIndex).toBe(primitives.observations.length);
  const fixture = corpus();
  expect(fixture.ordinary.length).toBeLessThanOrEqual(512);
  const admitted = fixture.targeted.filter(
    (q) => q.texture !== "mip" || reference(q).samples.every((s) => s.lodStable),
  );
  expect(admitted.filter((q) => q.texture === "mip").length).toBeGreaterThanOrEqual(4);
  const queries = [...fixture.ordinary, ...admitted];
  expect(queries.filter((q) => !q.boundary).length).toBeLessThanOrEqual(512);
  const measured = await readback(page, kernel, queries);
  checkHardware(measured);
  const reports = queries.map((q, index) => ({
    name: q.name,
    boundary: q.boundary,
    texture: q.texture,
    ...evaluateWrapper(q, measured.observations[index].values),
  }));
  const baseBody = Buffer.from(JSON.stringify({ integer, primitives, measured, reports }, null, 2));
  await writeFile(info.outputPath("hex-tiling-base-readback.json"), baseBody);
  await info.attach("hex-tiling-base-readback", {
    body: baseBody,
    contentType: "application/json",
  });
  for (const report of reports) expect(report.failures, report.name).toEqual([]);
  const continuity = [];
  for (const wrapper of [0, 1]) {
    const selected = queries
      .map((q, index) => ({ q, index }))
      .filter(({ q }) => q.name.startsWith(`boundary-${wrapper}-`) && q.uv[1] === 0.125)
      .sort((a, b) => a.q.uv[0] - b.q.uv[0]);
    expect(selected.length).toBe(3);
    for (let i = 0; i < selected.length - 1; i++) {
      const a = selected[i],
        b = selected[i + 1],
        ra = reference(a.q),
        rb = reference(b.q),
        va = measured.observations[a.index].values,
        vb = measured.observations[b.index].values;
      const components = [...ra.surface, ...ra.normal],
        other = [...rb.surface, ...rb.normal];
      const budgets = [...ra.surfaceErrors, ...ra.normalErrors].map(
        (error, j) =>
          error + [...rb.surfaceErrors, ...rb.normalErrors][j] + 8 * (ra.bbase + rb.bbase) + 64 * U,
      );
      components.forEach((value, j) => {
        expect(Math.abs(va[j] - vb[j])).toBeLessThanOrEqual(
          Math.abs(value - other[j]) + budgets[j],
        );
      });
      continuity.push({
        wrapper,
        uvA: a.q.uv,
        uvB: b.q.uv,
        referenceJump: components.map((value, j) => Math.abs(value - other[j])),
        budgets,
      });
    }
  }
  const mutants = [];
  for (const defect of ["normal-forward", "missing-sign", "gradient-scale", "domain-reuse"]) {
    const selected = queries
      .filter(
        (q) =>
          !q.boundary &&
          (defect === "gradient-scale"
            ? q.texture === "mip"
            : q.texture === "constant" &&
              q.cfg.rotationStrength !== 0 &&
              q.cfg.inputNormalYSign === -1),
      )
      .slice(0, 12);
    expect(selected.length).toBeGreaterThan(0);
    const read = await readback(page, kernel, selected, "wrapper", defect);
    checkHardware(read);
    const failures = selected.map(
        (q, index) => evaluateWrapper(q, read.observations[index].values).failures,
      ),
      detected = failures.filter((v) => v.length > 0).length;
    expect(detected, defect).toBeGreaterThan(0);
    if (defect === "gradient-scale")
      expect(
        failures.some((list) => list.some((failure) => failure.startsWith("surface"))),
        "Mip colours must independently detect incorrect gradient frequency",
      ).toBe(true);
    let exactHashMutation: Awaited<ReturnType<typeof readback>> | undefined;
    if (defect === "domain-reuse") {
      exactHashMutation = await readback(page, reuseHashDomain(kernel), [], "integer");
      checkHardware(exactHashMutation);
      const changed = exactHashMutation.observations.filter(
        (value, index) => value.values[0] !== hashVectors[Math.floor(index / 3)].hashes[index % 3],
      ).length;
      expect(changed).toBeGreaterThan(0);
    }
    mutants.push({ defect, queries: selected.length, detected, failures, read, exactHashMutation });
  }
  expect(pageErrors).toEqual([]);
  expect(consoleErrors).toEqual([]);
  const evidence = {
    kernelSha256: createHash("sha256").update(kernel).digest("hex"),
    budgets: { U, N, T, P, Te },
    corpus: {
      ordinary: fixture.ordinary.length,
      targeted: admitted.length,
      excludedUnstableMip:
        fixture.targeted.filter((q) => q.texture === "mip").length -
        admitted.filter((q) => q.texture === "mip").length,
    },
    integer,
    primitives,
    measured,
    reports,
    continuity,
    mutants,
    limitations: [
      "Synthetic numeric textures only; actual arrays/material images are separate",
      "Constant texels prove normal transport and weighting, not texture filtering",
      "Mip colours prove explicit anisotropic gradients only away from declared LOD boundaries",
      "Boundary class does not assert CPU/GPU triangle identity",
    ],
  };
  const body = Buffer.from(JSON.stringify(evidence, null, 2));
  await writeFile(info.outputPath("hex-tiling-readback.json"), body);
  await info.attach("hex-tiling-readback", { body, contentType: "application/json" });
});
