import { createSeededNoise, createSeededRandom, fractalNoise, type Seed } from "./noise.js";
import { opSmoothSubtraction, type Vec3 } from "./sdf.js";
import {
  requireFiniteNumber,
  requireFiniteVector3,
  requirePositiveFiniteNumber,
} from "./validation.js";

/** Supported deterministic terrain profiles. */
export type BiomeKind =
  | "marsh"
  | "forest"
  | "desert"
  | "tundra"
  | "savanna"
  | "mountain"
  | "scrubland";

/** A weighted terrain region; larger radii exert influence farther from the center. */
export interface Biome {
  type: BiomeKind;
  center: readonly [number, number];
  radius: number;
}

/** Inputs required to construct a deterministic terrain field. */
export interface SeededTerrainOptions {
  seed: Seed;
  biomes: readonly Biome[];
  /** Optional normalized-distance blend width; zero preserves nearest-biome selection. */
  biomeBlend?: number;
}

/** Height and signed-distance values sampled from a terrain field. */
export interface TerrainSample {
  height: number;
  distance: number;
  caveDistance: number;
}

/** Renderer-neutral indexed heightfield attributes. */
export interface HeightfieldMesh {
  positions: Float32Array;
  normals: Float32Array;
  indices: Uint32Array;
  width: number;
  depth: number;
}

/** A deterministic placement point aligned to the terrain surface. */
export interface ScatterPoint extends Vec3 {
  rotation: number;
  scale: number;
}

/** Operations exposed by one validated, seeded terrain field. */
export interface SeededTerrainField {
  heightAt(x: number, z: number): number;
  sample(point: Vec3): TerrainSample;
  createHeightfield(options: { width: number; depth: number; cellSize: number }): HeightfieldMesh;
  scatter(options: { count: number; area: number; seed?: Seed }): ScatterPoint[];
}

const biomeKinds = new Set<BiomeKind>([
  "marsh",
  "forest",
  "desert",
  "tundra",
  "savanna",
  "mountain",
  "scrubland",
]);
const maximumHeightfieldVertices = 1_000_000;
const maximumHeightfieldIndexEntries = 6_000_000;
const maximumScatterPoints = 1_000_000;
type HeightfieldCoordinateKey = number | "negative-zero";

/** Bounds the operation-local cache independently of heightfield aspect ratio. */
const maximumHeightfieldCachedSamples = 65_536;

function requireBiomes(biomes: readonly Biome[]): void {
  if (biomes.length === 0) throw new Error("createSeededTerrainField: biomes cannot be empty");
  biomes.forEach((biome, index) => {
    if (!biomeKinds.has(biome.type)) {
      throw new Error(`createSeededTerrainField: biomes[${index}].type is not supported`);
    }
    requireFiniteNumber("createSeededTerrainField", `biomes[${index}].center[0]`, biome.center[0]);
    requireFiniteNumber("createSeededTerrainField", `biomes[${index}].center[1]`, biome.center[1]);
    requirePositiveFiniteNumber(
      "createSeededTerrainField",
      `biomes[${index}].radius`,
      biome.radius,
    );
  });
}

function closestBiome(x: number, z: number, biomes: readonly Biome[]): Biome {
  let closest = biomes[0]!;
  if (biomes.length === 1) return closest;
  let closestDistance = Infinity;
  let requiresStableRanking = false;
  for (const biome of biomes) {
    const dx = x - biome.center[0];
    const dz = z - biome.center[1];
    const squaredX = dx ** 2;
    const squaredZ = dz ** 2;
    const numerator = squaredX + squaredZ;
    const denominator = biome.radius ** 2;
    const distance = numerator / denominator;
    requiresStableRanking ||=
      !Number.isFinite(distance) ||
      !Number.isFinite(denominator) ||
      denominator === 0 ||
      (squaredX === 0 && dx !== 0) ||
      (squaredZ === 0 && dz !== 0) ||
      (distance === 0 && numerator !== 0);
    if (distance < closestDistance) {
      closest = biome;
      closestDistance = distance;
    }
  }
  if (!requiresStableRanking) return closest;
  // Keep ordinary legacy arithmetic byte-compatible; recover only lost extreme-input rankings.
  let closestLogarithm = Infinity;
  for (const biome of biomes) {
    const logarithm = logarithmOfNormalizedBiomeDistanceSquared(x, z, biome);
    if (logarithm < closestLogarithm) {
      closest = biome;
      closestLogarithm = logarithm;
    }
  }
  return closest;
}

function biomeHeight(biome: Biome, x: number, base: number, detail: number): number {
  switch (biome.type) {
    case "mountain":
      return base * 26 + Math.abs(detail) * 14;
    case "tundra":
      return base * 7 + detail * 2;
    case "forest":
      return base * 9 + detail * 4;
    case "desert":
      return base * 2 + Math.sin(x * 0.1 + detail * 3) * 3;
    case "marsh":
      return base + detail * 0.4;
    case "savanna":
      return base * 3 + Math.max(0, detail) * 6;
    default:
      return base * 4 + detail * 2;
  }
}

function normalizedBiomeDistanceSquared(x: number, z: number, biome: Biome): number {
  const normalizedX = (x - biome.center[0]) / biome.radius;
  const normalizedZ = (z - biome.center[1]) / biome.radius;
  return normalizedX ** 2 + normalizedZ ** 2;
}

function logarithmOfAbsoluteDifference(left: number, right: number): number {
  const difference = left - right;
  if (Number.isFinite(difference)) {
    return difference === 0 ? -Infinity : Math.log(Math.abs(difference));
  }
  // Finite coordinates with opposite signs can overflow when subtracted; sum magnitudes in log space.
  const largest = Math.max(Math.abs(left), Math.abs(right));
  const smallest = Math.min(Math.abs(left), Math.abs(right));
  return Math.log(largest) + Math.log1p(smallest / largest);
}

function logarithmOfNormalizedBiomeDistanceSquared(x: number, z: number, biome: Biome): number {
  const radiusLogarithm = Math.log(biome.radius);
  const xTerm = 2 * (logarithmOfAbsoluteDifference(x, biome.center[0]) - radiusLogarithm);
  const zTerm = 2 * (logarithmOfAbsoluteDifference(z, biome.center[1]) - radiusLogarithm);
  const largestTerm = Math.max(xTerm, zTerm);
  if (largestTerm === -Infinity) return -Infinity;
  const smallestTerm = Math.min(xTerm, zTerm);
  return largestTerm + Math.log1p(Math.exp(smallestTerm - largestTerm));
}

function logarithmOfPositiveDifference(logarithm: number, minimum: number): number {
  if (logarithm === minimum) return -Infinity;
  const logarithmicRatio = logarithm - minimum;
  if (logarithmicRatio > 50) {
    return logarithm + Math.log1p(-Math.exp(-logarithmicRatio));
  }
  return minimum + Math.log(Math.expm1(logarithmicRatio));
}

/**
 * Computes the prescribed relative Gaussian weight when a normalized squared distance
 * overflows. Logarithms retain the distance difference and avoid coordinate-subtraction
 * overflow; exact IEEE-754 input ties remain equal-weight, while distinctions smaller than
 * the supplied coordinates' precision cannot be recovered.
 */
function overflowSafeBiomeWeight(logarithm: number, minimum: number, biomeBlend: number): number {
  const logarithmOfDifference = logarithmOfPositiveDifference(logarithm, minimum);
  const scaledDifference = Math.exp(logarithmOfDifference - Math.log(biomeBlend));
  return Math.exp(-scaledDifference);
}

function requireDistinctFloat32AxisSamples(axis: "x" | "z", size: number, cellSize: number): void {
  let previous = Math.fround((-(size - 1) / 2) * cellSize);
  for (let index = 1; index < size; index += 1) {
    const current = Math.fround((index - (size - 1) / 2) * cellSize);
    if (current === previous) {
      throw new Error(
        `createHeightfield: ${axis} axis samples must remain distinct after Float32 quantization`,
      );
    }
    previous = current;
  }
}

function heightfieldCoordinateKey(value: number): HeightfieldCoordinateKey {
  // Map uses SameValueZero and would otherwise merge the only two distinct zero values.
  return Object.is(value, -0) ? "negative-zero" : value;
}

function retainHeightfieldRows(
  rows: Map<HeightfieldCoordinateKey, Map<HeightfieldCoordinateKey, number>>,
  lower: HeightfieldCoordinateKey,
  current: HeightfieldCoordinateKey,
  upper: HeightfieldCoordinateKey,
): number {
  let removedSamples = 0;
  for (const key of rows.keys()) {
    if (key !== lower && key !== current && key !== upper) {
      removedSamples += rows.get(key)!.size;
      rows.delete(key);
    }
  }
  return removedSamples;
}

/** Creates a finite, seeded terrain and continuous cave distance field. */
export function createSeededTerrainField(options: SeededTerrainOptions): SeededTerrainField {
  if (typeof options.seed === "number") {
    requireFiniteNumber("createSeededTerrainField", "seed", options.seed);
  }
  requireBiomes(options.biomes);
  const biomeBlend = options.biomeBlend === undefined ? 0 : options.biomeBlend;
  if (!Number.isFinite(biomeBlend) || biomeBlend < 0) {
    throw new Error("createSeededTerrainField: biomeBlend must be a non-negative finite number");
  }
  const seed = options.seed;
  const biomes: Biome[] = options.biomes.map((biome) => ({
    type: biome.type,
    center: [biome.center[0], biome.center[1]],
    radius: biome.radius,
  }));
  const noise = createSeededNoise(seed);
  const heightAt = (x: number, z: number): number => {
    requireFiniteNumber("heightAt", "x", x);
    requireFiniteNumber("heightAt", "z", z);
    const base = fractalNoise(noise, x * 0.02, 0, z * 0.02, 4);
    const detail = fractalNoise(noise, x * 0.06, 19, z * 0.06, 3);
    if (biomeBlend === 0 || biomes.length === 1) {
      return biomeHeight(closestBiome(x, z, biomes), x, base, detail);
    }
    let minimumDistance = Infinity;
    let hasNonFiniteDistance = false;
    for (const biome of biomes) {
      const distance = normalizedBiomeDistanceSquared(x, z, biome);
      if (Number.isFinite(distance) && distance < minimumDistance) {
        minimumDistance = distance;
      } else if (!Number.isFinite(distance)) {
        hasNonFiniteDistance = true;
      }
    }
    if (hasNonFiniteDistance) {
      let minimumLogarithm = Infinity;
      for (const biome of biomes) {
        minimumLogarithm = Math.min(
          minimumLogarithm,
          logarithmOfNormalizedBiomeDistanceSquared(x, z, biome),
        );
      }
      let totalWeight = 0;
      let blendedHeight = 0;
      for (const biome of biomes) {
        const logarithm = logarithmOfNormalizedBiomeDistanceSquared(x, z, biome);
        const weight = overflowSafeBiomeWeight(logarithm, minimumLogarithm, biomeBlend);
        totalWeight += weight;
        blendedHeight += biomeHeight(biome, x, base, detail) * weight;
      }
      return blendedHeight / totalWeight;
    }
    let totalWeight = 0;
    let blendedHeight = 0;
    for (const biome of biomes) {
      const distance = normalizedBiomeDistanceSquared(x, z, biome);
      if (!Number.isFinite(distance)) continue;
      const weight = Math.exp(-(distance - minimumDistance) / biomeBlend);
      totalWeight += weight;
      blendedHeight += biomeHeight(biome, x, base, detail) * weight;
    }
    return blendedHeight / totalWeight;
  };
  const caveDistance = (point: Vec3): number => {
    requireFiniteVector3("sample", "point", point);
    const signal = noise(point.x * 0.05, point.y * 0.05, point.z * 0.05);
    return Math.max((0.36 - signal) * 8, point.y + 2);
  };
  const sample = (point: Vec3): TerrainSample => {
    requireFiniteVector3("sample", "point", point);
    const height = heightAt(point.x, point.z);
    const cave = caveDistance(point);
    return { height, caveDistance: cave, distance: opSmoothSubtraction(point.y - height, cave, 2) };
  };
  return {
    heightAt,
    sample,
    createHeightfield({ width, depth, cellSize }) {
      requirePositiveFiniteNumber("createHeightfield", "cellSize", cellSize);
      if (!Number.isInteger(width) || !Number.isInteger(depth) || width < 2 || depth < 2) {
        throw new Error("createHeightfield: width and depth must be integers >= 2");
      }
      const vertexCount = width * depth;
      const indexEntryCount = (width - 1) * (depth - 1) * 6;
      if (vertexCount > maximumHeightfieldVertices) {
        throw new Error("createHeightfield: vertex count must not exceed 1000000");
      }
      if (indexEntryCount > maximumHeightfieldIndexEntries) {
        throw new Error("createHeightfield: index count must not exceed 6000000");
      }
      const maximumCoordinate = ((Math.max(width, depth) - 1) * cellSize) / 2;
      if (!Number.isFinite(maximumCoordinate) || maximumCoordinate > 3.4028234663852886e38) {
        throw new Error("createHeightfield: grid extent must fit finite Float32 positions");
      }
      requireDistinctFloat32AxisSamples("x", width, cellSize);
      requireDistinctFloat32AxisSamples("z", depth, cellSize);
      const positions = new Float32Array(vertexCount * 3);
      const normals = new Float32Array(vertexCount * 3);
      const indices = new Uint32Array(indexEntryCount);
      const cachedHeightRows = new Map<
        HeightfieldCoordinateKey,
        Map<HeightfieldCoordinateKey, number>
      >();
      let cachedHeightEntryCount = 0;
      const cachedHeightAt = (x: number, z: number): number => {
        // Preserve heightAt's validation on cache hits as well as misses.
        requireFiniteNumber("heightAt", "x", x);
        requireFiniteNumber("heightAt", "z", z);
        const zKey = heightfieldCoordinateKey(z);
        const xKey = heightfieldCoordinateKey(x);
        let row = cachedHeightRows.get(zKey);
        if (!row) {
          row = new Map();
          cachedHeightRows.set(zKey, row);
        }
        const cached = row.get(xKey);
        if (cached !== undefined || row.has(xKey)) return cached!;

        // Keep the optimization's retained memory fixed even for a permitted
        // wide, shallow heightfield. Direct sampling retains the exact request.
        if (cachedHeightEntryCount >= maximumHeightfieldCachedSamples) return heightAt(x, z);

        const height = heightAt(x, z);
        row.set(xKey, height);
        cachedHeightEntryCount += 1;
        return height;
      };
      for (let z = 0; z < depth; z += 1) {
        const worldZ = (z - (depth - 1) / 2) * cellSize;
        cachedHeightEntryCount -= retainHeightfieldRows(
          cachedHeightRows,
          heightfieldCoordinateKey(worldZ - cellSize),
          heightfieldCoordinateKey(worldZ),
          heightfieldCoordinateKey(worldZ + cellSize),
        );
        for (let x = 0; x < width; x += 1) {
          const offset = (z * width + x) * 3;
          const worldX = (x - (width - 1) / 2) * cellSize;
          const heightValue = cachedHeightAt(worldX, worldZ);
          const slopeX =
            cachedHeightAt(worldX + cellSize, worldZ) - cachedHeightAt(worldX - cellSize, worldZ);
          const slopeZ =
            cachedHeightAt(worldX, worldZ + cellSize) - cachedHeightAt(worldX, worldZ - cellSize);
          const magnitude = Math.hypot(-slopeX, 2 * cellSize, -slopeZ);
          if (!Number.isFinite(magnitude) || magnitude === 0) {
            throw new Error("createHeightfield: normal magnitude must be finite and non-zero");
          }
          const inverseLength = 1 / magnitude;
          positions.set([worldX, heightValue, worldZ], offset);
          normals.set(
            [-slopeX * inverseLength, 2 * cellSize * inverseLength, -slopeZ * inverseLength],
            offset,
          );
        }
      }
      let cursor = 0;
      for (let z = 0; z < depth - 1; z += 1) {
        for (let x = 0; x < width - 1; x += 1) {
          const topLeft = z * width + x;
          indices.set(
            [
              topLeft,
              topLeft + width,
              topLeft + 1,
              topLeft + 1,
              topLeft + width,
              topLeft + width + 1,
            ],
            cursor,
          );
          cursor += 6;
        }
      }
      correctHeightfieldIncidentNormals(positions, normals, indices);
      return { positions, normals, indices, width, depth };
    },
    scatter({ count, area, seed: scatterSeed = seed }) {
      if (!Number.isInteger(count) || count < 0 || !Number.isFinite(area) || area <= 0) {
        throw new Error(
          "scatter: count must be a non-negative integer and area must be a positive finite number",
        );
      }
      if (count > maximumScatterPoints) {
        throw new Error("scatter: count must not exceed 1000000");
      }
      if (typeof scatterSeed === "number") requireFiniteNumber("scatter", "seed", scatterSeed);
      const random = createSeededRandom(scatterSeed);
      return Array.from({ length: count }, () => {
        const x = (random() - 0.5) * area;
        const z = (random() - 0.5) * area;
        return {
          x,
          y: heightAt(x, z),
          z,
          rotation: random() * Math.PI * 2,
          scale: 0.8 + random() * 0.4,
        };
      });
    },
  };
}

/**
 * Retains central-difference normals unless one points behind an emitted stored triangle.
 * Heightfield faces always have a positive Y component, so the upward normal is an exact
 * shared-vertex fallback for a sharp or under-resolved height change.
 * This private helper receives only the builder's arrays: both xyz arrays have
 * vertexCount * 3 entries and its grid loop emits indices below vertexCount.
 */
function correctHeightfieldIncidentNormals(
  positions: Float32Array,
  normals: Float32Array,
  indices: Uint32Array,
): void {
  let repairs: Uint8Array | undefined;
  for (let offset = 0; offset < indices.length; offset += 3) {
    const a = indices[offset]! * 3;
    const b = indices[offset + 1]! * 3;
    const c = indices[offset + 2]! * 3;
    const abx = positions[b]! - positions[a]!;
    const aby = positions[b + 1]! - positions[a + 1]!;
    const abz = positions[b + 2]! - positions[a + 2]!;
    const acx = positions[c]! - positions[a]!;
    const acy = positions[c + 1]! - positions[a + 1]!;
    const acz = positions[c + 2]! - positions[a + 2]!;
    const crossX = aby * acz - abz * acy;
    const crossY = abz * acx - abx * acz;
    const crossZ = abx * acy - aby * acx;
    const scale = Math.max(Math.abs(crossX), Math.abs(crossY), Math.abs(crossZ));
    if (!(scale > 0) || !Number.isFinite(scale)) {
      throw new Error(
        `createHeightfield: triangle ${offset / 3} has zero area after Float32 quantization`,
      );
    }
    const scaledX = crossX / scale;
    const scaledY = crossY / scale;
    const scaledZ = crossZ / scale;
    const inverseLength = 1 / Math.hypot(scaledX, scaledY, scaledZ);
    const normalX = scaledX * inverseLength;
    const normalY = scaledY * inverseLength;
    const normalZ = scaledZ * inverseLength;
    for (let corner = 0; corner < 3; corner += 1) {
      const vertex = indices[offset + corner]!;
      const normalOffset = vertex * 3;
      const alignment =
        normalX * normals[normalOffset]! +
        normalY * normals[normalOffset + 1]! +
        normalZ * normals[normalOffset + 2]!;
      if (!(alignment > 0)) {
        if (!repairs) repairs = new Uint8Array(normals.length / 3);
        repairs[vertex] = 1;
      }
    }
  }
  if (!repairs) return;
  for (let vertex = 0; vertex < repairs.length; vertex += 1) {
    if (repairs[vertex] === 0) continue;
    const offset = vertex * 3;
    normals[offset] = 0;
    normals[offset + 1] = 1;
    normals[offset + 2] = 0;
  }
}
