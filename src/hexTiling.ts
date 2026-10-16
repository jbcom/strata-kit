/** Stochastic triangle-grid sampling; see docs/THIRD_PARTY_NOTICES.md. */
import { seedToUint32, type Seed } from "./noise.js";
import { hashSeededLattice } from "./noiseLattice.js";

type Pair2 = readonly [number, number];
type Pair4 = readonly [number, number, number, number];

export interface HexTileOptions {
  seed: Seed;
  tileScale: number;
  rotationStrength?: number;
  offsetScale?: number;
  luminanceInfluence?: number;
  contrast?: number;
  normalChannels?: "rg" | "ra";
  inputNormalYSign?: 1 | -1;
}
export interface HexTileConfig {
  readonly mode: "integer-v1";
  readonly seedKey: number;
  readonly tileScale: number;
  readonly rotationStrength: number;
  readonly offsetScale: number;
  readonly luminanceInfluence: number;
  readonly contrast: number;
  readonly gainExponent: number;
  readonly normalChannels: "rg" | "ra";
  readonly inputNormalYSign: 1 | -1;
}
export interface HexTileRequest {
  readonly cell: Pair2;
  readonly uv: Pair2;
  readonly dUVdx: Pair2;
  readonly dUVdy: Pair2;
}
export interface HexTilePair {
  readonly surface: Pair4;
  readonly normal: Pair4;
}
export interface HexTileResult {
  readonly surface: Pair4;
  readonly normalXY: Pair2;
  readonly weights: readonly [number, number, number];
}

const OP = "sampleHexTile2D";
const MIN_NORMAL = 2 ** -126;
const HEADROOM = 3.4028234663852886e38 / 16;
const K = 3.464101552963257;
const I = 0.28867512941360474;
const PI = 3.1415927410125732;
const TAU = 6.2831854820251465;
const LR = 0.29899999499320984;
const LG = 0.5870000123977661;
const LB = 0.11400000005960464;

function finite(value: number, name: string): number {
  if (!Number.isFinite(value)) throw new Error(`${OP}: ${name} must be finite`);
  return value;
}
function f(value: number): number {
  return finite(Math.fround(value), "Float32 arithmetic");
}
function range(value: number, lo: number, hi: number, name: string): number {
  finite(value, name);
  if (value < lo || value > hi) throw new Error(`${OP}: ${name} is outside [${lo},${hi}]`);
  return value;
}
function bounded(value: number, name: string): number {
  return range(value, -HEADROOM, HEADROOM, name);
}
function unitControl(value: number, name: string): number {
  return range(f(range(value, 0, 1, name)), 0, 1, name);
}
function validateConfig(config: HexTileConfig): HexTileConfig {
  const {
    mode,
    seedKey,
    tileScale,
    rotationStrength,
    offsetScale,
    luminanceInfluence,
    contrast,
    gainExponent,
    normalChannels,
    inputNormalYSign,
  } = config;
  if (mode !== "integer-v1" || !Number.isInteger(seedKey) || seedKey < 0 || seedKey > 0xffffffff) {
    throw new Error(`${OP}: config must be produced by createHexTileConfig`);
  }
  for (const [name, value, lo, hi] of [
    ["tileScale", tileScale, MIN_NORMAL, HEADROOM],
    ["rotationStrength", rotationStrength, 0, 1],
    ["offsetScale", offsetScale, 0, HEADROOM],
    ["luminanceInfluence", luminanceInfluence, 0, 1],
    ["gainExponent", gainExponent, MIN_NORMAL, Number.MAX_VALUE],
  ] as const) {
    range(value, lo, hi, name);
    if (value !== f(value)) throw new Error(`${OP}: config ${name} must be Float32`);
  }
  finite(contrast, "contrast");
  if (contrast <= 0 || contrast >= 1) throw new Error(`${OP}: contrast must be in (0,1)`);
  range(f(tileScale * offsetScale), 0, HEADROOM, "offset amplitude");
  if (normalChannels !== "rg" && normalChannels !== "ra")
    throw new Error(`${OP}: normalChannels must be rg or ra`);
  if (inputNormalYSign !== 1 && inputNormalYSign !== -1)
    throw new Error(`${OP}: inputNormalYSign must be 1 or -1`);
  return {
    mode,
    seedKey,
    tileScale,
    rotationStrength,
    offsetScale,
    luminanceInfluence,
    contrast,
    gainExponent,
    normalChannels,
    inputNormalYSign,
  };
}

/** Compiles owned immutable scalar data for the versioned CPU/GLSL sampler. */
export function createHexTileConfig(options: HexTileOptions): HexTileConfig {
  if (options === null || typeof options !== "object")
    throw new Error("createHexTileConfig: options must be an object");
  const {
    seed,
    tileScale,
    rotationStrength = 1,
    offsetScale = 3,
    luminanceInfluence = 0.6,
    contrast = 0.6,
    normalChannels = "rg",
    inputNormalYSign = 1,
  } = options;
  const seedKey = seedToUint32(seed);
  if (!Number.isFinite(tileScale) || tileScale <= 0)
    throw new Error("createHexTileConfig: tileScale must be positive finite");
  range(offsetScale, 0, HEADROOM, "offsetScale");
  finite(contrast, "contrast");
  if (contrast <= 0 || contrast >= 1)
    throw new Error("createHexTileConfig: contrast must be in (0,1)");
  return Object.freeze(
    validateConfig({
      mode: "integer-v1",
      seedKey,
      tileScale: f(tileScale),
      rotationStrength: unitControl(rotationStrength, "rotationStrength"),
      offsetScale: f(offsetScale),
      luminanceInfluence: unitControl(luminanceInfluence, "luminanceInfluence"),
      contrast,
      gainExponent: f(Math.log1p(-contrast) / Math.log(0.5)),
      normalChannels,
      inputNormalYSign,
    }),
  );
}

function inputPair(value: Pair2, name: string): Pair2 {
  const length = value?.length;
  if (!Array.isArray(value) || length !== 2)
    throw new Error(`${OP}: ${name} must be an array of two numbers`);
  const a = value[0],
    b = value[1];
  return [bounded(f(finite(a, name)), name), bounded(f(finite(b, name)), name)];
}
function sampleChannels(value: Pair4, name: string): Pair4 {
  const length = value?.length;
  if (!Array.isArray(value) || length !== 4)
    throw new Error(`${OP}: ${name} must contain four normalized channels`);
  const result = [0, 0, 0, 0] as [number, number, number, number];
  for (let channel = 0; channel < 4; channel += 1)
    result[channel] = f(range(value[channel], 0, 1, `${name}[${channel}]`));
  return result;
}
function rotate(a: number, b: number, c: number, s: number): Pair2 {
  return [f(f(a * c) - f(b * s)), f(f(a * s) + f(b * c))];
}
function gain(x: number, exponent: number): number {
  if (x <= 0) return 0;
  if (x >= 1) return 1;
  if (x === 0.5) return 0.5;
  return x < 0.5
    ? f(0.5 * f(f(2 * x) ** exponent))
    : f(1 - f(0.5 * f(f(2 * f(1 - x)) ** exponent)));
}
function blend(a: number, b: number, c: number, weights: readonly number[]): number {
  return f(f(f(a * weights[0]) + f(b * weights[1])) + f(c * weights[2]));
}

/** Three paired samples, constant work and no texture, projection or simulation state. */
export function sampleHexTile2D(
  config: HexTileConfig,
  uv: Pair2,
  dUVdx: Pair2,
  dUVdy: Pair2,
  samplePair: (request: HexTileRequest) => HexTilePair,
): HexTileResult {
  if (config === null || typeof config !== "object")
    throw new Error(`${OP}: config must be an object`);
  const cfg = validateConfig(config);
  const point = inputPair(uv, "uv"),
    dx = inputPair(dUVdx, "dUVdx"),
    dy = inputPair(dUVdy, "dUVdy");
  if (typeof samplePair !== "function") throw new Error(`${OP}: samplePair must be callable`);
  const tu = f(point[0] / cfg.tileScale),
    tv = f(point[1] / cfg.tileScale);
  const gx = range(f(f(K * tu) - f(2 * tv)), -4096, 4096, "grid U");
  const gy = range(f(4 * tv), -4096, 4096, "grid V");
  const ix = Math.floor(gx),
    iy = Math.floor(gy),
    fx = f(gx - ix),
    fy = f(gy - iy);
  const residual = f(f(1 - fx) - fy);
  const cells: Pair2[] =
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
  const raw = residual > 0 ? [residual, fy, fx] : [f(-residual), f(1 - fy), f(1 - fx)];
  const total = f(f(raw[0] + raw[1]) + raw[2]);
  if (total <= 0 || raw.some((value) => value < 0))
    throw new Error(`${OP}: invalid barycentric coordinates`);
  const base = raw.map((value) => f(value / total));
  const amplitude = f(cfg.tileScale * cfg.offsetScale);
  // Complete and validate every plan before exposing any callback or request.
  const plans = cells.map((cell) => {
    const unit = (domain: number) =>
      (hashSeededLattice(cfg.seedKey, cell[0], domain, cell[1]) & 0x00ffffff) / 16777216;
    const theta = f(f(f(unit(2) * TAU) - PI) * cfg.rotationStrength);
    const c = f(Math.cos(theta)),
      s = f(Math.sin(theta));
    const centreU = bounded(f(f(f(cell[0] + f(0.5 * cell[1])) * I) * cfg.tileScale), "centre U");
    const centreV = bounded(f(f(0.25 * cell[1]) * cfg.tileScale), "centre V");
    const ou = bounded(f(unit(0) * amplitude), "offset U"),
      ov = bounded(f(unit(1) * amplitude), "offset V");
    const relative = rotate(f(point[0] - centreU), f(point[1] - centreV), c, s);
    const sampleUV: Pair2 = Object.freeze([
      bounded(f(f(relative[0] + centreU) + ou), "sample U"),
      bounded(f(f(relative[1] + centreV) + ov), "sample V"),
    ]);
    const gradient = (value: Pair2): Pair2 => {
      const result = rotate(value[0], value[1], c, s);
      return Object.freeze([
        bounded(result[0], "rotated gradient"),
        bounded(result[1], "rotated gradient"),
      ]);
    };
    const request: HexTileRequest = Object.freeze({
      cell: Object.freeze(cell),
      uv: sampleUV,
      dUVdx: gradient(dx),
      dUVdy: gradient(dy),
    });
    return { request, c, s };
  });
  const surfaces: Pair4[] = [],
    normals: Pair2[] = [],
    gains: number[] = [];
  for (const [index, plan] of plans.entries()) {
    let pair: HexTilePair;
    try {
      pair = samplePair(plan.request);
    } catch (cause) {
      throw new Error(`${OP}: paired sampler failed at cell ${plan.request.cell.join(",")}`, {
        cause,
      });
    }
    if (pair === null || typeof pair !== "object")
      throw new Error(`${OP}: paired sampler must return an object`);
    const { surface, normal } = pair;
    const color = sampleChannels(surface, "surface"),
      encoded = sampleChannels(normal, "normal");
    surfaces.push(color);
    const nx = f(f(2 * encoded[0]) - 1);
    const ny = f(f(f(2 * encoded[cfg.normalChannels === "rg" ? 1 : 3]) - 1) * cfg.inputNormalYSign);
    normals.push([f(f(plan.c * nx) + f(plan.s * ny)), f(f(-plan.s * nx) + f(plan.c * ny))]);
    const luminance = f(f(f(color[0] * LR) + f(color[1] * LG)) + f(color[2] * LB));
    const factor = f(f(1 - cfg.luminanceInfluence) + f(f(2 * cfg.luminanceInfluence) * luminance));
    gains.push(gain(f(base[index] * factor), cfg.gainExponent));
  }
  const sum = f(f(gains[0] + gains[1]) + gains[2]);
  const weights = Object.freeze(
    (sum > 0 ? gains.map((value) => f(value / sum)) : base) as [number, number, number],
  );
  const surface: Pair4 = Object.freeze(
    [0, 1, 2, 3].map((channel) =>
      blend(surfaces[0][channel], surfaces[1][channel], surfaces[2][channel], weights),
    ) as [number, number, number, number],
  );
  const normalXY: Pair2 = Object.freeze([
    blend(normals[0][0], normals[1][0], normals[2][0], weights),
    blend(normals[0][1], normals[1][1], normals[2][1], weights),
  ]);
  return Object.freeze({ surface, normalXY, weights });
}
