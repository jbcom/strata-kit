import { createSeededNoise, createSeededRandom, fractalNoise, type Seed } from './noise.js';
import { opSmoothSubtraction, type Vec3 } from './sdf.js';

export type BiomeKind =
  | 'marsh'
  | 'forest'
  | 'desert'
  | 'tundra'
  | 'savanna'
  | 'mountain'
  | 'scrubland';

export interface Biome {
  type: BiomeKind;
  center: readonly [number, number];
  radius: number;
}

export interface SeededTerrainOptions {
  seed: Seed;
  biomes: readonly Biome[];
}

export interface TerrainSample {
  height: number;
  distance: number;
  caveDistance: number;
}

export interface HeightfieldMesh {
  positions: Float32Array;
  normals: Float32Array;
  indices: Uint32Array;
  width: number;
  depth: number;
}

export interface ScatterPoint extends Vec3 {
  rotation: number;
  scale: number;
}

export interface SeededTerrainField {
  heightAt(x: number, z: number): number;
  sample(point: Vec3): TerrainSample;
  createHeightfield(options: { width: number; depth: number; cellSize: number }): HeightfieldMesh;
  scatter(options: { count: number; area: number; seed?: Seed }): ScatterPoint[];
}

const biomeKinds = new Set<BiomeKind>([
  'marsh',
  'forest',
  'desert',
  'tundra',
  'savanna',
  'mountain',
  'scrubland',
]);

function requireFinite(operation: string, name: string, value: number): void {
  if (!Number.isFinite(value)) throw new Error(`${operation}: ${name} must be finite`);
}

function requirePositiveFinite(operation: string, name: string, value: number): void {
  if (!Number.isFinite(value) || value <= 0) {
    throw new Error(`${operation}: ${name} must be a positive finite number`);
  }
}

function requireVec3(operation: string, name: string, value: Vec3): void {
  requireFinite(operation, `${name}.x`, value.x);
  requireFinite(operation, `${name}.y`, value.y);
  requireFinite(operation, `${name}.z`, value.z);
}

function requireBiomes(biomes: readonly Biome[]): void {
  if (biomes.length === 0) throw new Error('createSeededTerrainField: biomes cannot be empty');
  biomes.forEach((biome, index) => {
    if (!biomeKinds.has(biome.type)) {
      throw new Error(`createSeededTerrainField: biomes[${index}].type is not supported`);
    }
    requireFinite('createSeededTerrainField', `biomes[${index}].center[0]`, biome.center[0]);
    requireFinite('createSeededTerrainField', `biomes[${index}].center[1]`, biome.center[1]);
    requirePositiveFinite('createSeededTerrainField', `biomes[${index}].radius`, biome.radius);
  });
}

function closestBiome(x: number, z: number, biomes: readonly Biome[]): Biome {
  requireBiomes(biomes);
  return biomes.reduce((closest, biome) => {
    const closestDistance = (x - closest.center[0]) ** 2 + (z - closest.center[1]) ** 2;
    const distance = (x - biome.center[0]) ** 2 + (z - biome.center[1]) ** 2;
    return distance < closestDistance ? biome : closest;
  });
}

export function createSeededTerrainField(options: SeededTerrainOptions): SeededTerrainField {
  if (typeof options.seed === 'number') {
    requireFinite('createSeededTerrainField', 'seed', options.seed);
  }
  requireBiomes(options.biomes);
  const noise = createSeededNoise(options.seed);
  const heightAt = (x: number, z: number): number => {
    requireFinite('heightAt', 'x', x);
    requireFinite('heightAt', 'z', z);
    const biome = closestBiome(x, z, options.biomes);
    const base = fractalNoise(noise, x * 0.02, 0, z * 0.02, 4);
    const detail = fractalNoise(noise, x * 0.06, 19, z * 0.06, 3);
    switch (biome.type) {
      case 'mountain':
        return base * 26 + Math.abs(detail) * 14;
      case 'tundra':
        return base * 7 + detail * 2;
      case 'forest':
        return base * 9 + detail * 4;
      case 'desert':
        return base * 2 + Math.sin(x * 0.1 + detail * 3) * 3;
      case 'marsh':
        return base + detail * 0.4;
      case 'savanna':
        return base * 3 + Math.max(0, detail) * 6;
      default:
        return base * 4 + detail * 2;
    }
  };
  const caveDistance = (point: Vec3): number => {
    requireVec3('sample', 'point', point);
    const signal = noise(point.x * 0.05, point.y * 0.05, point.z * 0.05);
    const deepEnough = point.y < -2;
    return deepEnough && signal > 0.36 ? (0.36 - signal) * 8 : 1000;
  };
  const sample = (point: Vec3): TerrainSample => {
    requireVec3('sample', 'point', point);
    const height = heightAt(point.x, point.z);
    const cave = caveDistance(point);
    return { height, caveDistance: cave, distance: opSmoothSubtraction(point.y - height, cave, 2) };
  };
  return {
    heightAt,
    sample,
    createHeightfield({ width, depth, cellSize }) {
      requirePositiveFinite('createHeightfield', 'cellSize', cellSize);
      if (!Number.isInteger(width) || !Number.isInteger(depth) || width < 2 || depth < 2) {
        throw new Error('createHeightfield: width and depth must be integers >= 2');
      }
      const positions = new Float32Array(width * depth * 3);
      const normals = new Float32Array(width * depth * 3);
      const indices = new Uint32Array((width - 1) * (depth - 1) * 6);
      for (let z = 0; z < depth; z += 1) {
        for (let x = 0; x < width; x += 1) {
          const offset = (z * width + x) * 3;
          const worldX = (x - (width - 1) / 2) * cellSize;
          const worldZ = (z - (depth - 1) / 2) * cellSize;
          const heightValue = heightAt(worldX, worldZ);
          const slopeX = heightAt(worldX + cellSize, worldZ) - heightAt(worldX - cellSize, worldZ);
          const slopeZ = heightAt(worldX, worldZ + cellSize) - heightAt(worldX, worldZ - cellSize);
          const inverseLength = 1 / Math.hypot(-slopeX, 2 * cellSize, -slopeZ);
          positions.set([worldX, heightValue, worldZ], offset);
          normals.set(
            [-slopeX * inverseLength, 2 * cellSize * inverseLength, -slopeZ * inverseLength],
            offset
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
            cursor
          );
          cursor += 6;
        }
      }
      return { positions, normals, indices, width, depth };
    },
    scatter({ count, area, seed = options.seed }) {
      if (!Number.isInteger(count) || count < 0 || !Number.isFinite(area) || area <= 0) {
        throw new Error(
          'scatter: count must be a non-negative integer and area must be a positive finite number'
        );
      }
      if (typeof seed === 'number') requireFinite('scatter', 'seed', seed);
      const random = createSeededRandom(seed);
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
