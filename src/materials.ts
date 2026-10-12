import { createSeededNoise, type Seed, seedToUint32 } from './noise.js';
import { requireFiniteNumber, requirePositiveFiniteNumber } from './validation.js';

/** Inputs that deterministically define a procedural surface. */
export interface SurfacePlanOptions {
  seed: Seed;
  scale?: number;
  baseColor?: readonly [number, number, number];
}

/** Normalized surface parameters reused for sampling and baking. */
export interface SurfacePlan {
  seed: number;
  scale: number;
  baseColor: readonly [number, number, number];
}

/** One uncompressed surface sample. Color channels are in the 0..255 range. */
export interface SurfaceSample {
  color: readonly [number, number, number, number];
  roughness: number;
  bump: number;
}

/** Packed RGBA8 color, R8 roughness, and R8 bump image data. */
export interface SurfaceBake {
  width: number;
  height: number;
  color: Uint8Array;
  roughness: Uint8Array;
  bump: Uint8Array;
}

/** Stable map names in a {@link SurfaceBakeManifest}. */
export type SurfaceBakeMapName = 'color' | 'roughness' | 'bump';
/** Encodings used by the packed bake maps. */
export type SurfaceBakeMapFormat = 'rgba8' | 'r8';

/** Decoding metadata for one packed bake map. */
export interface SurfaceBakeMap {
  name: SurfaceBakeMapName;
  format: SurfaceBakeMapFormat;
  channels: 1 | 4;
  byteStride: 1 | 4;
}

/** Provenance and byte layout required to decode a {@link SurfaceBake}. */
export interface SurfaceBakeManifest {
  seed: number;
  scale: number;
  baseColor: readonly [number, number, number];
  width: number;
  height: number;
  maps: readonly SurfaceBakeMap[];
}

function requirePlan(operation: string, plan: SurfacePlan, prefix = 'plan.'): void {
  requireFiniteNumber(operation, `${prefix}seed`, plan.seed);
  requirePositiveFiniteNumber(operation, `${prefix}scale`, plan.scale);
  if (plan.baseColor.length !== 3) {
    throw new Error(`${operation}: ${prefix}baseColor must contain exactly three channels`);
  }
  plan.baseColor.forEach((channel, index) => {
    if (!Number.isFinite(channel) || channel < 0 || channel > 1) {
      throw new Error(
        `${operation}: ${prefix}baseColor[${index}] must be a finite number between 0 and 1`
      );
    }
  });
}

/** Validates and normalizes a seeded surface plan. */
export function createSurfacePlan(options: SurfacePlanOptions): SurfacePlan {
  if (typeof options.seed === 'number')
    requireFiniteNumber('createSurfacePlan', 'seed', options.seed);
  const plan = {
    seed: seedToUint32(options.seed),
    scale: options.scale ?? 1,
    baseColor: options.baseColor ?? [0.5, 0.5, 0.5],
  };
  requirePlan('createSurfacePlan', plan, '');
  return plan;
}

/** Samples a surface plan at finite UV coordinates without allocating a bake. */
export function sampleSurface(plan: SurfacePlan, u: number, v: number): SurfaceSample {
  requirePlan('sampleSurface', plan);
  requireFiniteNumber('sampleSurface', 'u', u);
  requireFiniteNumber('sampleSurface', 'v', v);
  return sampleSurfaceWithNoise(plan, createSeededNoise(plan.seed), u, v);
}

function sampleSurfaceWithNoise(
  plan: SurfacePlan,
  noise: ReturnType<typeof createSeededNoise>,
  u: number,
  v: number
): SurfaceSample {
  const grain = noise(u * plan.scale * 24, v * plan.scale * 24, plan.seed * 0.0001) * 0.5 + 0.5;
  const wear = noise(u * plan.scale * 5, v * plan.scale * 5, 17) * 0.5 + 0.5;
  const color = plan.baseColor.map((channel) =>
    Math.round(Math.min(1, Math.max(0, channel * (0.78 + grain * 0.28))) * 255)
  ) as [number, number, number];
  return {
    color: [color[0], color[1], color[2], 255],
    roughness: 0.25 + wear * 0.6,
    bump: grain * 2 - 1,
  };
}

/** Bakes a validated plan into deterministic, tightly packed image buffers. */
export function bakeSurface(
  plan: SurfacePlan,
  options: { width: number; height: number }
): SurfaceBake {
  const { width, height } = options;
  requirePlan('bakeSurface', plan);
  if (!Number.isInteger(width) || !Number.isInteger(height) || width <= 0 || height <= 0) {
    throw new Error('bakeSurface: width and height must be positive integers');
  }
  const color = new Uint8Array(width * height * 4);
  const roughness = new Uint8Array(width * height);
  const bump = new Uint8Array(width * height);
  const noise = createSeededNoise(plan.seed);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const pixel = y * width + x;
      const sample = sampleSurfaceWithNoise(plan, noise, (x + 0.5) / width, (y + 0.5) / height);
      color.set(sample.color, pixel * 4);
      roughness[pixel] = Math.round(sample.roughness * 255);
      bump[pixel] = Math.round((sample.bump * 0.5 + 0.5) * 255);
    }
  }
  return { width, height, color, roughness, bump };
}

/** Describes the maps and provenance emitted by {@link bakeSurface}. */
export function createSurfaceBakeManifest(
  plan: SurfacePlan,
  bake: SurfaceBake
): SurfaceBakeManifest {
  requirePlan('createSurfaceBakeManifest', plan);
  if (
    !Number.isInteger(bake.width) ||
    !Number.isInteger(bake.height) ||
    bake.width <= 0 ||
    bake.height <= 0
  ) {
    throw new Error('createSurfaceBakeManifest: bake width and height must be positive integers');
  }
  if (bake.color.length !== bake.width * bake.height * 4) {
    throw new Error('createSurfaceBakeManifest: color must have RGBA8 data for every pixel');
  }
  if (
    bake.roughness.length !== bake.width * bake.height ||
    bake.bump.length !== bake.width * bake.height
  ) {
    throw new Error(
      'createSurfaceBakeManifest: roughness and bump must have R8 data for every pixel'
    );
  }
  return {
    seed: plan.seed,
    scale: plan.scale,
    baseColor: plan.baseColor,
    width: bake.width,
    height: bake.height,
    maps: [
      { name: 'color', format: 'rgba8', channels: 4, byteStride: 4 },
      { name: 'roughness', format: 'r8', channels: 1, byteStride: 1 },
      { name: 'bump', format: 'r8', channels: 1, byteStride: 1 },
    ],
  };
}
