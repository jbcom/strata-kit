import { createSeededNoise, type Seed, seedToUint32 } from './noise.js';

export interface SurfacePlanOptions {
  seed: Seed;
  scale?: number;
  baseColor?: readonly [number, number, number];
}

export interface SurfacePlan {
  seed: number;
  scale: number;
  baseColor: readonly [number, number, number];
}

export interface SurfaceSample {
  color: readonly [number, number, number, number];
  roughness: number;
  bump: number;
}

export interface SurfaceBake {
  width: number;
  height: number;
  color: Uint8Array;
  roughness: Uint8Array;
  bump: Uint8Array;
}

export type SurfaceBakeMapName = 'color' | 'roughness' | 'bump';
export type SurfaceBakeMapFormat = 'rgba8' | 'r8';

export interface SurfaceBakeMap {
  name: SurfaceBakeMapName;
  format: SurfaceBakeMapFormat;
  channels: 1 | 4;
  byteStride: 1 | 4;
}

export interface SurfaceBakeManifest {
  seed: number;
  scale: number;
  width: number;
  height: number;
  maps: readonly SurfaceBakeMap[];
}

function requireFinite(operation: string, name: string, value: number): void {
  if (!Number.isFinite(value)) throw new Error(`${operation}: ${name} must be finite`);
}

function requirePositiveFinite(operation: string, name: string, value: number): void {
  if (!Number.isFinite(value) || value <= 0) {
    throw new Error(`${operation}: ${name} must be a positive finite number`);
  }
}

function requirePlan(operation: string, plan: SurfacePlan, prefix = 'plan.'): void {
  requireFinite(operation, `${prefix}seed`, plan.seed);
  requirePositiveFinite(operation, `${prefix}scale`, plan.scale);
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

export function createSurfacePlan(options: SurfacePlanOptions): SurfacePlan {
  if (typeof options.seed === 'number') requireFinite('createSurfacePlan', 'seed', options.seed);
  const plan = {
    seed: seedToUint32(options.seed),
    scale: options.scale ?? 1,
    baseColor: options.baseColor ?? [0.5, 0.5, 0.5],
  };
  requirePlan('createSurfacePlan', plan, '');
  return plan;
}

export function sampleSurface(plan: SurfacePlan, u: number, v: number): SurfaceSample {
  requirePlan('sampleSurface', plan);
  requireFinite('sampleSurface', 'u', u);
  requireFinite('sampleSurface', 'v', v);
  const noise = createSeededNoise(plan.seed);
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
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const pixel = y * width + x;
      const sample = sampleSurface(plan, (x + 0.5) / width, (y + 0.5) / height);
      color.set(sample.color, pixel * 4);
      roughness[pixel] = Math.round(sample.roughness * 255);
      bump[pixel] = Math.round((sample.bump * 0.5 + 0.5) * 255);
    }
  }
  return { width, height, color, roughness, bump };
}

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
    width: bake.width,
    height: bake.height,
    maps: [
      { name: 'color', format: 'rgba8', channels: 4, byteStride: 4 },
      { name: 'roughness', format: 'r8', channels: 1, byteStride: 1 },
      { name: 'bump', format: 'r8', channels: 1, byteStride: 1 },
    ],
  };
}
