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

export function createSurfacePlan(options: SurfacePlanOptions): SurfacePlan {
  if (options.scale !== undefined && options.scale <= 0)
    throw new Error('createSurfacePlan: scale must be positive');
  return {
    seed: seedToUint32(options.seed),
    scale: options.scale ?? 1,
    baseColor: options.baseColor ?? [0.5, 0.5, 0.5],
  };
}

export function sampleSurface(plan: SurfacePlan, u: number, v: number): SurfaceSample {
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
): Readonly<Record<string, number>> {
  return {
    seed: plan.seed,
    scale: plan.scale,
    width: bake.width,
    height: bake.height,
    channels: 3,
  };
}
