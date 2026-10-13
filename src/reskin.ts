/** Copyright (c) Jon Bogaty. MIT License. */
/** Renderer-neutral UV quality checks, triplanar surface sampling, and atlas baking. */
import type { SurfaceSample, SurfaceSampler as MaterialSurfaceSampler } from "./materials.js";

/** A finite, indexed triangle mesh without renderer-owned state. */
export interface NeutralIndexedMesh {
  positions: Float32Array;
  indices: Uint16Array | Uint32Array;
  uvs?: Float32Array;
}

/** A surface recipe evaluated in its caller-declared two-dimensional domain. */
export type SurfaceSampler = MaterialSurfaceSampler;

/** Area-weighted fractions describing whether a mesh's first UV set is usable as an atlas. */
export interface UvLayoutDiagnostics {
  hasUv: boolean;
  outside: number;
  degenerate: number;
  /** Model-surface fraction whose UV triangle has a positive-area intersection with another. */
  overlap: number;
  coverage: number;
  stretched: number;
}

/** The coordinate route selected from explicit UV diagnostics. */
export type ReskinProjection = "uv" | "triplanar";

/** A selection decision and the diagnostics that made it. */
export interface ReskinPlan {
  projection: ReskinProjection;
  diagnostics: UvLayoutDiagnostics;
}

/** Optional bounds for the fixed-size UV diagnostic raster. */
export interface UvLayoutOptions {
  gridSize?: number;
}

/** Options for sampling one point through three coordinate planes. */
export interface TriplanarSurfaceOptions {
  scale?: number;
  sharpness?: number;
}

/** Packed atlas maps with transparent, unwritten pixels left untouched. */
export interface UvAtlasBake {
  width: number;
  height: number;
  color: Uint8Array;
  roughness: Uint8Array;
  bump: Uint8Array;
  metalness?: Uint8Array;
  /** Fraction of pixels reached before padding. */
  covered: number;
}

/** Options for deterministic UV atlas rasterisation. */
export interface UvAtlasBakeOptions extends TriplanarSurfaceOptions {
  width: number;
  height: number;
  /** Number of 4-connected texel rings grown from a written island. */
  padding?: number;
}

const MAX_PIXELS = 4_194_304;
const MAX_GRID_SIZE = 2_048;
const MAX_TRIANGLE_COUNT = 1_000_000;
const MAX_RASTER_WORK = 67_108_864;
const MAX_OVERLAP_PAIR_WORK = 8_388_608;
const MAX_PADDING = 64;
const UV_DEGENERATE_EPSILON = 1e-12;
const EDGE_EPSILON = 1e-9;
const DEFAULT_GRID_SIZE = 256;
const DEFAULT_SHARPNESS = 4;
const CLEAN_UV = { outside: 0.01, degenerate: 0.02, overlap: 0.02, stretched: 0.1 } as const;

type Point = readonly [number, number, number];
type ValidatedMesh = Required<NeutralIndexedMesh> & { vertexCount: number; triangleCount: number };

function failFinite(operation: string, name: string, value: number): void {
  if (!Number.isFinite(value)) throw new Error(`${operation}: ${name} must be finite`);
}

function validateMesh(
  operation: string,
  mesh: NeutralIndexedMesh,
  requireUvs: boolean,
): ValidatedMesh {
  if (
    !(mesh.positions instanceof Float32Array) ||
    mesh.positions.length === 0 ||
    mesh.positions.length % 3 !== 0
  ) {
    throw new Error(`${operation}: positions length must be a positive multiple of 3`);
  }
  const vertexCount = mesh.positions.length / 3;
  for (let index = 0; index < mesh.positions.length; index += 1)
    failFinite(operation, `positions[${index}]`, mesh.positions[index]);

  if (
    !(mesh.indices instanceof Uint16Array || mesh.indices instanceof Uint32Array) ||
    mesh.indices.length === 0 ||
    mesh.indices.length % 3 !== 0
  ) {
    throw new Error(`${operation}: indices length must be a positive multiple of 3`);
  }
  const triangleCount = mesh.indices.length / 3;
  if (triangleCount > MAX_TRIANGLE_COUNT)
    throw new Error(`${operation}: triangle count exceeds ${MAX_TRIANGLE_COUNT}`);
  for (let index = 0; index < mesh.indices.length; index += 1) {
    if (mesh.indices[index] >= vertexCount)
      throw new Error(`${operation}: indices[${index}] is outside the positions array`);
  }

  if (!mesh.uvs) {
    if (requireUvs) throw new Error(`${operation}: mesh must provide UVs`);
    return { ...mesh, uvs: new Float32Array(0), vertexCount, triangleCount };
  }
  if (!(mesh.uvs instanceof Float32Array) || mesh.uvs.length !== vertexCount * 2)
    throw new Error(`${operation}: uvs length must equal positions vertex count times 2`);
  for (let index = 0; index < mesh.uvs.length; index += 1)
    failFinite(operation, `uvs[${index}]`, mesh.uvs[index]);
  return {
    positions: mesh.positions,
    indices: mesh.indices,
    uvs: mesh.uvs,
    vertexCount,
    triangleCount,
  };
}

function triangleArea(mesh: ValidatedMesh, triangle: number, operation: string): number {
  const base = triangle * 3;
  const a = mesh.indices[base] * 3;
  const b = mesh.indices[base + 1] * 3;
  const c = mesh.indices[base + 2] * 3;
  const abx = mesh.positions[b] - mesh.positions[a];
  const aby = mesh.positions[b + 1] - mesh.positions[a + 1];
  const abz = mesh.positions[b + 2] - mesh.positions[a + 2];
  const acx = mesh.positions[c] - mesh.positions[a];
  const acy = mesh.positions[c + 1] - mesh.positions[a + 1];
  const acz = mesh.positions[c + 2] - mesh.positions[a + 2];
  const area =
    Math.hypot(aby * acz - abz * acy, abz * acx - abx * acz, abx * acy - aby * acx) * 0.5;
  if (!Number.isFinite(area))
    throw new Error(`${operation}: triangle ${triangle} area must be finite`);
  if (area === 0)
    throw new Error(`${operation}: triangle ${triangle} must have non-zero surface area`);
  return area;
}

function uvOf(
  mesh: ValidatedMesh,
  triangle: number,
): readonly [number, number, number, number, number, number] {
  const base = triangle * 3;
  const a = mesh.indices[base] * 2;
  const b = mesh.indices[base + 1] * 2;
  const c = mesh.indices[base + 2] * 2;
  return [mesh.uvs[a], mesh.uvs[a + 1], mesh.uvs[b], mesh.uvs[b + 1], mesh.uvs[c], mesh.uvs[c + 1]];
}

function uvArea(uv: readonly number[]): number {
  return Math.abs((uv[2] - uv[0]) * (uv[5] - uv[1]) - (uv[4] - uv[0]) * (uv[3] - uv[1])) * 0.5;
}

function validateGrid(operation: string, gridSize: number | undefined): number {
  const grid = gridSize ?? DEFAULT_GRID_SIZE;
  if (!Number.isInteger(grid) || grid <= 0 || grid > MAX_GRID_SIZE || grid * grid > MAX_PIXELS)
    throw new Error(`${operation}: gridSize must be an integer between 1 and ${MAX_GRID_SIZE}`);
  return grid;
}

function estimateRasterWork(
  mesh: ValidatedMesh,
  width: number,
  height: number,
  operation: string,
): number {
  let work = 0;
  for (let triangle = 0; triangle < mesh.triangleCount; triangle += 1) {
    const uv = uvOf(mesh, triangle);
    const minU = Math.min(uv[0], uv[2], uv[4]);
    const maxU = Math.max(uv[0], uv[2], uv[4]);
    const minV = Math.min(uv[1], uv[3], uv[5]);
    const maxV = Math.max(uv[1], uv[3], uv[5]);
    const left = Math.max(0, Math.floor(minU * width));
    const right = Math.min(width - 1, Math.ceil(maxU * width));
    const top = Math.max(0, Math.floor((1 - maxV) * height));
    const bottom = Math.min(height - 1, Math.ceil((1 - minV) * height));
    if (right >= left && bottom >= top) work += (right - left + 1) * (bottom - top + 1);
    if (work > MAX_RASTER_WORK)
      throw new Error(`${operation}: triangle raster work exceeds ${MAX_RASTER_WORK}`);
  }
  return work;
}

/** Visits every pixel centre covered by one UV triangle, with barycentric weights. */
function rasterize(
  uv: readonly [number, number, number, number, number, number],
  width: number,
  height: number,
  visit: (column: number, row: number, a: number, b: number, c: number) => void,
): void {
  const [u0, v0, u1, v1, u2, v2] = uv;
  const x0 = u0 * width;
  const y0 = (1 - v0) * height;
  const x1 = u1 * width;
  const y1 = (1 - v1) * height;
  const x2 = u2 * width;
  const y2 = (1 - v2) * height;
  const det = (x1 - x0) * (y2 - y0) - (x2 - x0) * (y1 - y0);
  if (Math.abs(det) < UV_DEGENERATE_EPSILON) return;
  const owns = (px: number, py: number, qx: number, qy: number): boolean => {
    // Top-left ownership must use a consistently wound edge; barycentrics stay
    // positive for either winding, but the edge direction reverses with det.
    if (det < 0) return py - qy < 0 || (py === qy && px > qx);
    return qy - py < 0 || (qy === py && qx > px);
  };
  const inside = (weight: number, owned: boolean): boolean =>
    weight > EDGE_EPSILON || (owned && weight >= -EDGE_EPSILON);
  const ownA = owns(x1, y1, x2, y2);
  const ownB = owns(x2, y2, x0, y0);
  const ownC = owns(x0, y0, x1, y1);
  const left = Math.max(0, Math.floor(Math.min(x0, x1, x2)));
  const right = Math.min(width - 1, Math.ceil(Math.max(x0, x1, x2)));
  const top = Math.max(0, Math.floor(Math.min(y0, y1, y2)));
  const bottom = Math.min(height - 1, Math.ceil(Math.max(y0, y1, y2)));
  for (let row = top; row <= bottom; row += 1)
    for (let column = left; column <= right; column += 1) {
      const x = column + 0.5;
      const y = row + 0.5;
      const b = ((x - x0) * (y2 - y0) - (x2 - x0) * (y - y0)) / det;
      const c = ((x1 - x0) * (y - y0) - (x - x0) * (y1 - y0)) / det;
      const a = 1 - b - c;
      if (inside(a, ownA) && inside(b, ownB) && inside(c, ownC)) visit(column, row, a, b, c);
    }
}

const FLOAT32_BITS = new Uint32Array(1);
const FLOAT32_VALUE = new Float32Array(FLOAT32_BITS.buffer);
const ORIENT_ERRBOUND_A = (3 + 16 * (Number.EPSILON / 2)) * (Number.EPSILON / 2);

/** Converts an exact Float32 value to a signed count of 2^-149 units. */
function float32Units(value: number): bigint {
  FLOAT32_VALUE[0] = value;
  const bits = FLOAT32_BITS[0];
  const sign = bits >>> 31 ? -1n : 1n;
  const exponent = (bits >>> 23) & 0xff;
  const fraction = bits & 0x7fffff;
  if (exponent === 0) return sign * BigInt(fraction);
  return sign * (BigInt(0x800000 | fraction) << BigInt(exponent - 1));
}

/**
 * Uses a proven Float64 error bound first, then exact Float32 dyadic arithmetic
 * when cancellation makes the fast determinant inconclusive.
 */
function orient2dSign(
  ax: number,
  ay: number,
  bx: number,
  by: number,
  cx: number,
  cy: number,
): -1 | 0 | 1 {
  const left = (bx - ax) * (cy - ay);
  const right = (by - ay) * (cx - ax);
  const determinant = left - right;
  const error = ORIENT_ERRBOUND_A * (Math.abs(left) + Math.abs(right));
  if (Math.abs(determinant) > error) return determinant < 0 ? -1 : 1;
  const exact =
    (float32Units(bx) - float32Units(ax)) * (float32Units(cy) - float32Units(ay)) -
    (float32Units(by) - float32Units(ay)) * (float32Units(cx) - float32Units(ax));
  return exact < 0n ? -1 : exact > 0n ? 1 : 0;
}

function hasStrictTriangleSeparator(
  owner: readonly [number, number, number, number, number, number],
  other: readonly [number, number, number, number, number, number],
): boolean {
  for (let edge = 0; edge < 3; edge += 1) {
    const next = (edge + 1) % 3;
    const third = (edge + 2) % 3;
    const ax = owner[edge * 2];
    const ay = owner[edge * 2 + 1];
    const bx = owner[next * 2];
    const by = owner[next * 2 + 1];
    const interior = orient2dSign(ax, ay, bx, by, owner[third * 2], owner[third * 2 + 1]);
    let allOutsideOrOnEdge = true;
    for (let vertex = 0; vertex < 3; vertex += 1) {
      const side = orient2dSign(ax, ay, bx, by, other[vertex * 2], other[vertex * 2 + 1]);
      if (side * interior > 0) {
        allOutsideOrOnEdge = false;
        break;
      }
    }
    if (allOutsideOrOnEdge) return true;
  }
  return false;
}

/** Returns true only when two UV triangles have positive interior intersection. */
function hasPositiveInteriorIntersection(
  first: readonly [number, number, number, number, number, number],
  second: readonly [number, number, number, number, number, number],
): boolean {
  return !hasStrictTriangleSeparator(first, second) && !hasStrictTriangleSeparator(second, first);
}

/**
 * Returns the model-surface fraction whose UV triangles participate in at least one
 * positive-area intersection. Bounding boxes are a sweep broad phase; the final test
 * is an exact-sign separating-axis test, so shared UV edges have zero overlap.
 */
function geometricOverlapFraction(
  mesh: ValidatedMesh,
  areas: Float64Array,
  totalArea: number,
  operation: string,
): number {
  if (mesh.triangleCount < 2) return 0;
  const minU = new Float32Array(mesh.triangleCount);
  const maxU = new Float32Array(mesh.triangleCount);
  const minV = new Float32Array(mesh.triangleCount);
  const maxV = new Float32Array(mesh.triangleCount);
  const order = new Uint32Array(mesh.triangleCount);
  const overlaps = new Uint8Array(mesh.triangleCount);
  for (let triangle = 0; triangle < mesh.triangleCount; triangle += 1) {
    const uv = uvOf(mesh, triangle);
    minU[triangle] = Math.min(uv[0], uv[2], uv[4]);
    maxU[triangle] = Math.max(uv[0], uv[2], uv[4]);
    minV[triangle] = Math.min(uv[1], uv[3], uv[5]);
    maxV[triangle] = Math.max(uv[1], uv[3], uv[5]);
    order[triangle] = triangle;
  }
  order.sort((left, right) => minU[left] - minU[right] || left - right);
  let pairWork = 0;
  for (let leftOrder = 0; leftOrder < order.length; leftOrder += 1) {
    const left = order[leftOrder];
    if (uvArea(uvOf(mesh, left)) < UV_DEGENERATE_EPSILON) continue;
    for (let rightOrder = leftOrder + 1; rightOrder < order.length; rightOrder += 1) {
      const right = order[rightOrder];
      if (minU[right] >= maxU[left]) break;
      pairWork += 1;
      if (pairWork > MAX_OVERLAP_PAIR_WORK)
        throw new Error(`${operation}: UV overlap pair work exceeds ${MAX_OVERLAP_PAIR_WORK}`);
      if (minV[right] >= maxV[left] || maxV[right] <= minV[left]) continue;
      if (uvArea(uvOf(mesh, right)) < UV_DEGENERATE_EPSILON) continue;
      if (hasPositiveInteriorIntersection(uvOf(mesh, left), uvOf(mesh, right))) {
        overlaps[left] = 1;
        overlaps[right] = 1;
      }
    }
  }
  let overlappingArea = 0;
  for (let triangle = 0; triangle < overlaps.length; triangle += 1)
    if (overlaps[triangle]) overlappingArea += areas[triangle];
  return overlappingArea / totalArea;
}

/** Measures UV failures by model surface area and actual raster coverage. */
export function analyzeUvLayout(
  mesh: NeutralIndexedMesh,
  options: UvLayoutOptions = {},
): UvLayoutDiagnostics {
  const operation = "analyzeUvLayout";
  const validated = validateMesh(operation, mesh, false);
  if (!mesh.uvs)
    return { hasUv: false, outside: 1, degenerate: 1, overlap: 0, coverage: 0, stretched: 0 };
  const grid = validateGrid(operation, options.gridSize);
  estimateRasterWork(validated, grid, grid, operation);
  const hits = new Uint8Array(grid * grid);
  const densities = new Float64Array(validated.triangleCount);
  const densityAreas = new Float64Array(validated.triangleCount);
  const triangleAreas = new Float64Array(validated.triangleCount);
  let totalArea = 0;
  let outsideArea = 0;
  let degenerateArea = 0;
  let densityCount = 0;
  for (let triangle = 0; triangle < validated.triangleCount; triangle += 1) {
    const area = triangleArea(validated, triangle, operation);
    totalArea += area;
    triangleAreas[triangle] = area;
    const uv = uvOf(validated, triangle);
    if (uv.some((coordinate) => coordinate < 0 || coordinate > 1)) outsideArea += area;
    const projectedArea = uvArea(uv);
    if (projectedArea < UV_DEGENERATE_EPSILON) {
      degenerateArea += area;
      continue;
    }
    densities[densityCount] = Math.sqrt(projectedArea / area);
    densityAreas[densityCount] = area;
    densityCount += 1;
    rasterize(uv, grid, grid, (column, row) => {
      const texel = row * grid + column;
      if (hits[texel] < 255) hits[texel] += 1;
    });
  }
  if (!Number.isFinite(totalArea) || totalArea <= 0)
    throw new Error(`${operation}: total surface area must be finite and positive`);

  const order = new Uint32Array(densityCount);
  let sampledArea = 0;
  for (let index = 0; index < densityCount; index += 1) {
    order[index] = index;
    sampledArea += densityAreas[index];
  }
  order.sort((left, right) => densities[left] - densities[right]);
  let median = 0;
  let accumulatedArea = 0;
  for (const index of order) {
    accumulatedArea += densityAreas[index];
    if (accumulatedArea >= sampledArea / 2) {
      median = densities[index];
      break;
    }
  }
  let stretchedArea = 0;
  if (median > 0) {
    for (let index = 0; index < densityCount; index += 1)
      if (densities[index] > median * 2 || densities[index] < median / 2)
        stretchedArea += densityAreas[index];
  }
  let covered = 0;
  for (const hit of hits) {
    if (hit > 0) covered += 1;
  }
  return {
    hasUv: true,
    outside: outsideArea / totalArea,
    degenerate: degenerateArea / totalArea,
    overlap: geometricOverlapFraction(validated, triangleAreas, totalArea, operation),
    coverage: covered / hits.length,
    stretched: stretchedArea / totalArea,
  };
}

/** Selects UV baking only when every measured UV failure stays below explicit thresholds. */
export function createReskinPlan(
  mesh: NeutralIndexedMesh,
  options: UvLayoutOptions = {},
): ReskinPlan {
  const diagnostics = analyzeUvLayout(mesh, options);
  const projection =
    diagnostics.hasUv &&
    diagnostics.outside === 0 &&
    diagnostics.degenerate === 0 &&
    diagnostics.overlap === 0 &&
    diagnostics.coverage > 0 &&
    diagnostics.stretched < CLEAN_UV.stretched
      ? "uv"
      : "triplanar";
  return { projection, diagnostics };
}

function linearFromSrgb(byte: number): number {
  const color = byte / 255;
  return color <= 0.04045 ? color / 12.92 : ((color + 0.055) / 1.055) ** 2.4;
}

function srgbByte(linear: number): number {
  const color = linear <= 0.0031308 ? linear * 12.92 : 1.055 * linear ** (1 / 2.4) - 0.055;
  return Math.round(Math.min(1, Math.max(0, color)) * 255);
}

function validateSample(operation: string, sample: SurfaceSample & { metalness?: number }): void {
  if (!sample || !Array.isArray(sample.color) || sample.color.length !== 4)
    throw new Error(`${operation}: sampler must return a four-channel color`);
  sample.color.forEach((channel, index) => {
    if (!Number.isFinite(channel))
      throw new Error(`${operation}: sampler sample color[${index}] must be finite`);
    if (channel < 0 || channel > 255)
      throw new Error(`${operation}: sampler sample color[${index}] must be between 0 and 255`);
  });
  if (!Number.isFinite(sample.roughness) || sample.roughness < 0 || sample.roughness > 1)
    throw new Error(`${operation}: sampler sample roughness must be between 0 and 1`);
  if (!Number.isFinite(sample.bump) || sample.bump < -1 || sample.bump > 1)
    throw new Error(`${operation}: sampler sample bump must be between -1 and 1`);
  if (
    sample.metalness !== undefined &&
    (!Number.isFinite(sample.metalness) || sample.metalness < 0 || sample.metalness > 1)
  )
    throw new Error(`${operation}: sampler sample metalness must be between 0 and 1`);
}

function triplanarOptions(
  operation: string,
  options: TriplanarSurfaceOptions,
): { scale: number; sharpness: number } {
  const scale = options.scale ?? 1;
  const sharpness = options.sharpness ?? DEFAULT_SHARPNESS;
  if (!Number.isFinite(scale) || scale <= 0)
    throw new Error(`${operation}: scale must be a positive finite number`);
  if (!Number.isFinite(sharpness) || sharpness <= 0)
    throw new Error(`${operation}: sharpness must be a positive finite number`);
  return { scale, sharpness };
}

/**
 * Samples the yz, xz, and xy planes and blends by normal magnitude in linear sRGB.
 * Coordinates are caller-owned; scale multiplies each coordinate before sampling.
 */
export function sampleTriplanarSurface(
  sampler: SurfaceSampler,
  point: Point,
  normal: Point,
  options: TriplanarSurfaceOptions = {},
): SurfaceSample & { metalness?: number } {
  const operation = "sampleTriplanarSurface";
  const { scale, sharpness } = triplanarOptions(operation, options);
  point.forEach((value, index) => {
    failFinite(operation, `point[${index}]`, value);
  });
  normal.forEach((value, index) => {
    failFinite(operation, `normal[${index}]`, value);
  });
  const length = Math.hypot(normal[0], normal[1], normal[2]);
  if (!Number.isFinite(length) || length === 0)
    throw new Error(`${operation}: normal must have non-zero finite length`);
  const nx = normal[0] / length;
  const ny = normal[1] / length;
  const nz = normal[2] / length;
  const maximumNormal = Math.max(Math.abs(nx), Math.abs(ny), Math.abs(nz));
  // Divide by the dominant component before exponentiation. This is the same
  // normalized ratio as abs(normal)^sharpness, but it leaves at least one 1.
  const rawWeights = [
    (Math.abs(nx) / maximumNormal) ** sharpness,
    (Math.abs(ny) / maximumNormal) ** sharpness,
    (Math.abs(nz) / maximumNormal) ** sharpness,
  ];
  const weightTotal = rawWeights[0] + rawWeights[1] + rawWeights[2];
  if (!Number.isFinite(weightTotal) || weightTotal <= 0)
    throw new Error(`${operation}: normal weights must be finite and positive`);
  const coordinates: readonly (readonly [number, number])[] = [
    [point[2] * scale, point[1] * scale],
    [point[0] * scale, point[2] * scale],
    [point[0] * scale, point[1] * scale],
  ];
  let linearRed = 0;
  let linearGreen = 0;
  let linearBlue = 0;
  let alpha = 0;
  let roughness = 0;
  let bump = 0;
  let metalness = 0;
  let hasMetalness: boolean | undefined;
  for (let axis = 0; axis < 3; axis += 1) {
    const weight = rawWeights[axis] / weightTotal;
    if (weight === 0) continue;
    const [u, v] = coordinates[axis];
    failFinite(operation, `projected coordinate ${axis}.u`, u);
    failFinite(operation, `projected coordinate ${axis}.v`, v);
    const sample = sampler.sample(u, v);
    validateSample(operation, sample);
    const sampleHasMetalness = sample.metalness !== undefined;
    if (hasMetalness === undefined) hasMetalness = sampleHasMetalness;
    else if (hasMetalness !== sampleHasMetalness)
      throw new Error(`${operation}: sampler metalness presence must be consistent`);
    const sampleAlpha = sample.color[3] / 255;
    linearRed += linearFromSrgb(sample.color[0]) * sampleAlpha * weight;
    linearGreen += linearFromSrgb(sample.color[1]) * sampleAlpha * weight;
    linearBlue += linearFromSrgb(sample.color[2]) * sampleAlpha * weight;
    alpha += sampleAlpha * weight;
    roughness += sample.roughness * sampleAlpha * weight;
    bump += sample.bump * sampleAlpha * weight;
    if (sampleHasMetalness) metalness += (sample.metalness ?? 0) * sampleAlpha * weight;
  }
  const color =
    alpha === 0
      ? ([0, 0, 0, 0] as const)
      : ([
          srgbByte(linearRed / alpha),
          srgbByte(linearGreen / alpha),
          srgbByte(linearBlue / alpha),
          Math.round(alpha * 255),
        ] as const);
  if (alpha === 0)
    return hasMetalness
      ? { color, roughness: 0, bump: 0, metalness: 0 }
      : { color, roughness: 0, bump: 0 };
  return hasMetalness
    ? { color, roughness: roughness / alpha, bump: bump / alpha, metalness: metalness / alpha }
    : { color, roughness: roughness / alpha, bump: bump / alpha };
}

function validateAtlasDimensions(options: UvAtlasBakeOptions): {
  width: number;
  height: number;
  padding: number;
} {
  const { width, height } = options;
  if (!Number.isInteger(width) || !Number.isInteger(height) || width <= 0 || height <= 0)
    throw new Error("bakeUvAtlas: width and height must be positive integers");
  if (!Number.isSafeInteger(width * height) || width * height > MAX_PIXELS)
    throw new Error(`bakeUvAtlas: pixel count must not exceed ${MAX_PIXELS}`);
  const padding = options.padding ?? 4;
  if (!Number.isInteger(padding) || padding < 0)
    throw new Error("bakeUvAtlas: padding must be a non-negative integer");
  if (padding > Math.max(width, height))
    throw new Error("bakeUvAtlas: padding must not exceed the largest atlas dimension");
  if (padding > MAX_PADDING) throw new Error(`bakeUvAtlas: padding must not exceed ${MAX_PADDING}`);
  return { width, height, padding };
}

function assertBakedLayout(
  mesh: NeutralIndexedMesh,
  validated: ValidatedMesh,
  width: number,
  height: number,
): void {
  for (let triangle = 0; triangle < validated.triangleCount; triangle += 1) {
    const uv = uvOf(validated, triangle);
    if (uv.some((coordinate) => coordinate < 0 || coordinate > 1))
      throw new Error("bakeUvAtlas: UV layout extends outside the unit atlas");
    if (uvArea(uv) < UV_DEGENERATE_EPSILON)
      throw new Error("bakeUvAtlas: UV layout contains degenerate triangles");
  }
  const grid = Math.min(MAX_GRID_SIZE, Math.max(width, height));
  const diagnostics = analyzeUvLayout(mesh, { gridSize: grid });
  if (diagnostics.overlap > 0)
    throw new Error("bakeUvAtlas: UV layout overlaps and cannot be baked safely");
  if (diagnostics.stretched >= CLEAN_UV.stretched)
    throw new Error("bakeUvAtlas: UV layout is too stretched to bake safely");
  for (let triangle = 0; triangle < validated.triangleCount; triangle += 1) {
    let reached = 0;
    rasterize(uvOf(validated, triangle), width, height, () => {
      reached += 1;
    });
    if (reached === 0)
      throw new Error(`bakeUvAtlas: UV triangle ${triangle} does not reach an atlas pixel`);
  }
}

function interpolatePoint(
  mesh: ValidatedMesh,
  triangle: number,
  a: number,
  b: number,
  c: number,
): Point {
  const base = triangle * 3;
  const ia = mesh.indices[base] * 3;
  const ib = mesh.indices[base + 1] * 3;
  const ic = mesh.indices[base + 2] * 3;
  return [
    mesh.positions[ia] * a + mesh.positions[ib] * b + mesh.positions[ic] * c,
    mesh.positions[ia + 1] * a + mesh.positions[ib + 1] * b + mesh.positions[ic + 1] * c,
    mesh.positions[ia + 2] * a + mesh.positions[ib + 2] * b + mesh.positions[ic + 2] * c,
  ];
}

function triangleNormal(mesh: ValidatedMesh, triangle: number): Point {
  const base = triangle * 3;
  const ia = mesh.indices[base] * 3;
  const ib = mesh.indices[base + 1] * 3;
  const ic = mesh.indices[base + 2] * 3;
  const abx = mesh.positions[ib] - mesh.positions[ia];
  const aby = mesh.positions[ib + 1] - mesh.positions[ia + 1];
  const abz = mesh.positions[ib + 2] - mesh.positions[ia + 2];
  const acx = mesh.positions[ic] - mesh.positions[ia];
  const acy = mesh.positions[ic + 1] - mesh.positions[ia + 1];
  const acz = mesh.positions[ic + 2] - mesh.positions[ia + 2];
  return [aby * acz - abz * acy, abz * acx - abx * acz, abx * acy - aby * acx];
}

function dilateAtlas(
  color: Uint8Array,
  roughness: Uint8Array,
  bump: Uint8Array,
  metalness: Uint8Array | undefined,
  written: Uint8Array,
  width: number,
  height: number,
  padding: number,
): void {
  if (padding === 0) return;
  const grown = new Uint32Array(written.length);
  for (let pass = 0; pass < padding; pass += 1) {
    let grownCount = 0;
    for (let row = 0; row < height; row += 1)
      for (let column = 0; column < width; column += 1) {
        const texel = row * width + column;
        if (written[texel]) continue;
        let source = -1;
        if (column > 0 && written[texel - 1]) source = texel - 1;
        else if (column + 1 < width && written[texel + 1]) source = texel + 1;
        else if (row > 0 && written[texel - width]) source = texel - width;
        else if (row + 1 < height && written[texel + width]) source = texel + width;
        if (source < 0) continue;
        color.set(color.subarray(source * 4, source * 4 + 4), texel * 4);
        roughness[texel] = roughness[source];
        bump[texel] = bump[source];
        if (metalness) metalness[texel] = metalness[source];
        grown[grownCount] = texel;
        grownCount += 1;
      }
    for (let index = 0; index < grownCount; index += 1) written[grown[index]] = 1;
    if (grownCount === 0) return;
  }
}

/**
 * Rasterises a clean UV atlas at pixel centres and samples each texel from its mesh surface.
 * Unwritten pixels remain transparent; padding grows only deterministic neighbouring island data.
 */
export function bakeUvAtlas(
  mesh: NeutralIndexedMesh,
  sampler: SurfaceSampler,
  options: UvAtlasBakeOptions,
): UvAtlasBake {
  const { width, height, padding } = validateAtlasDimensions(options);
  const validated = validateMesh("bakeUvAtlas", mesh, true);
  const rasterWork = estimateRasterWork(validated, width, height, "bakeUvAtlas");
  const combinedWork = rasterWork + width * height * padding;
  if (combinedWork > MAX_RASTER_WORK)
    throw new Error(`bakeUvAtlas: combined raster and padding work exceeds ${MAX_RASTER_WORK}`);
  assertBakedLayout(mesh, validated, width, height);
  const { scale, sharpness } = triplanarOptions("bakeUvAtlas", options);
  const pixelCount = width * height;
  const color = new Uint8Array(pixelCount * 4);
  const roughness = new Uint8Array(pixelCount);
  const bump = new Uint8Array(pixelCount);
  const written = new Uint8Array(pixelCount);
  let metalness: Uint8Array | undefined;
  let hasMetalness: boolean | undefined;
  let covered = 0;
  for (let triangle = 0; triangle < validated.triangleCount; triangle += 1) {
    const uv = uvOf(validated, triangle);
    if (uvArea(uv) < UV_DEGENERATE_EPSILON) continue;
    const normal = triangleNormal(validated, triangle);
    rasterize(uv, width, height, (column, row, a, b, c) => {
      const texel = row * width + column;
      if (written[texel])
        throw new Error("bakeUvAtlas: UV layout overlaps and cannot be baked safely");
      const sample = sampleTriplanarSurface(
        sampler,
        interpolatePoint(validated, triangle, a, b, c),
        normal,
        { scale, sharpness },
      );
      const sampleHasMetalness = sample.metalness !== undefined;
      if (hasMetalness === undefined) {
        hasMetalness = sampleHasMetalness;
        if (sampleHasMetalness) metalness = new Uint8Array(pixelCount);
      } else if (hasMetalness !== sampleHasMetalness) {
        throw new Error("bakeUvAtlas: sampler metalness presence must be consistent");
      }
      const offset = texel * 4;
      color.set(sample.color, offset);
      roughness[texel] = Math.round(sample.roughness * 255);
      bump[texel] = Math.round((sample.bump * 0.5 + 0.5) * 255);
      if (metalness) metalness[texel] = Math.round((sample.metalness ?? 0) * 255);
      written[texel] = 1;
      covered += 1;
    });
  }
  dilateAtlas(color, roughness, bump, metalness, written, width, height, padding);
  return hasMetalness
    ? { width, height, color, roughness, bump, metalness, covered: covered / pixelCount }
    : { width, height, color, roughness, bump, covered: covered / pixelCount };
}
