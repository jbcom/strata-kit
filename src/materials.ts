import { createSeededNoise, type Seed, seedToUint32 } from "./noise.js";
import { requireFiniteNumber, requirePositiveFiniteNumber } from "./validation.js";

export { bakeTangentNormalMap } from "./tangentNormalBake.js";
export type { TangentNormalMapOptions } from "./tangentNormalBake.js";
export { createHexTileConfig, sampleHexTile2D } from "./hexTiling.js";
export type {
  HexTileOptions,
  HexTileConfig,
  HexTileRequest,
  HexTilePair,
  HexTileResult,
} from "./hexTiling.js";

export { sampleSegment2D, projectPixelFootprint2D, sampleBandCoverage } from "./segmentCoverage.js";
export type { SegmentSample2D, BandCoverageSample } from "./segmentCoverage.js";

export {
  analyzeUvLayout,
  bakeUvAtlas,
  createReskinPlan,
  sampleTriplanarSurface,
  visitUvTexelFootprints,
} from "./reskin.js";
export type {
  NeutralIndexedMesh,
  ReskinPlan,
  ReskinProjection,
  TriplanarSurfaceOptions,
  UvAtlasBake,
  UvAtlasBakeOptions,
  UvLayoutDiagnostics,
  UvLayoutOptions,
  UvTexelFootprint,
  UvTexelFootprintOptions,
} from "./reskin.js";
export { createWearField } from "./wear.js";
export type { WearField, WearFieldOptions, WearSample } from "./wear.js";

const MAX_BAKE_PIXELS = 4_194_304;

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
  /** Optional normalized metalness. A bake requires this channel at every pixel or no pixels. */
  metalness?: number;
}

/** A deterministic source of uncompressed surface samples in dimensionless UV space. */
export interface SurfaceSampler {
  sample(u: number, v: number): SurfaceSample;
}

/** A source-over layer over a base {@link SurfaceSampler}. */
export interface SurfaceLayer {
  sampler: SurfaceSampler;
  /** Optional finite 0..1 coverage mask in the same UV coordinate system as the sampler. */
  mask?: (u: number, v: number) => number;
}

/** Packed RGBA8 color, R8 roughness/bump, and optional R8 metalness image data. */
export interface SurfaceBake {
  width: number;
  height: number;
  color: Uint8Array;
  roughness: Uint8Array;
  bump: Uint8Array;
  metalness?: Uint8Array;
}

/** Stable map names in a {@link SurfaceBakeManifest}. */
export type SurfaceBakeMapName = "color" | "roughness" | "bump" | "metalness";
/** Encodings used by the packed bake maps. */
export type SurfaceBakeMapFormat = "rgba8" | "r8";

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

function requirePlan(operation: string, plan: SurfacePlan, prefix = "plan."): void {
  requireFiniteNumber(operation, `${prefix}seed`, plan.seed);
  requirePositiveFiniteNumber(operation, `${prefix}scale`, plan.scale);
  if (plan.baseColor.length !== 3) {
    throw new Error(`${operation}: ${prefix}baseColor must contain exactly three channels`);
  }
  plan.baseColor.forEach((channel, index) => {
    if (!Number.isFinite(channel) || channel < 0 || channel > 1) {
      throw new Error(
        `${operation}: ${prefix}baseColor[${index}] must be a finite number between 0 and 1`,
      );
    }
  });
}

function snapshotPlan(operation: string, plan: SurfacePlan): SurfacePlan {
  requirePlan(operation, plan);
  return {
    seed: plan.seed,
    scale: plan.scale,
    baseColor: [plan.baseColor[0], plan.baseColor[1], plan.baseColor[2]],
  };
}

function requireRange(
  operation: string,
  name: string,
  value: number,
  minimum: number,
  maximum: number,
): void {
  if (!Number.isFinite(value) || value < minimum || value > maximum) {
    throw new Error(
      `${operation}: ${name} must be a finite number between ${minimum} and ${maximum}`,
    );
  }
}

function validateSample(operation: string, sample: SurfaceSample): void {
  if (!sample || typeof sample !== "object") {
    throw new Error(`${operation}: sample must be an object`);
  }
  if (!Array.isArray(sample.color) || sample.color.length !== 4) {
    throw new Error(`${operation}: sample.color must contain exactly four channels`);
  }
  sample.color.forEach((channel, index) => {
    requireRange(operation, `sample.color[${index}]`, channel, 0, 255);
  });
  requireRange(operation, "sample.roughness", sample.roughness, 0, 1);
  requireRange(operation, "sample.bump", sample.bump, -1, 1);
  if (sample.metalness !== undefined) {
    requireRange(operation, "sample.metalness", sample.metalness, 0, 1);
  }
}

function srgbToLinear(value: number): number {
  const normalized = value / 255;
  return normalized <= 0.04045 ? normalized / 12.92 : ((normalized + 0.055) / 1.055) ** 2.4;
}

function linearToSrgbByte(value: number): number {
  const normalized = Math.min(1, Math.max(0, value));
  const srgb =
    normalized <= 0.0031308 ? normalized * 12.92 : 1.055 * normalized ** (1 / 2.4) - 0.055;
  return Math.round(srgb * 255);
}

function isSurfaceSampler(input: SurfacePlan | SurfaceSampler): input is SurfaceSampler {
  return (
    typeof input === "object" &&
    input !== null &&
    typeof (input as Partial<SurfaceSampler>).sample === "function"
  );
}

/** Validates and normalizes a seeded surface plan. */
export function createSurfacePlan(options: SurfacePlanOptions): SurfacePlan {
  if (typeof options.seed === "number") {
    requireFiniteNumber("createSurfacePlan", "seed", options.seed);
  }
  const baseColor = options.baseColor ?? [0.5, 0.5, 0.5];
  const inputPlan = { seed: seedToUint32(options.seed), scale: options.scale ?? 1, baseColor };
  requirePlan("createSurfacePlan", inputPlan, "");
  return { ...inputPlan, baseColor: [baseColor[0], baseColor[1], baseColor[2]] as const };
}

function sampleSurfaceWithNoise(
  plan: SurfacePlan,
  noise: ReturnType<typeof createSeededNoise>,
  u: number,
  v: number,
): SurfaceSample {
  const grain = noise(u * plan.scale * 24, v * plan.scale * 24, plan.seed * 0.0001) * 0.5 + 0.5;
  const wear = noise(u * plan.scale * 5, v * plan.scale * 5, 17) * 0.5 + 0.5;
  const color = plan.baseColor.map((channel) =>
    Math.round(Math.min(1, Math.max(0, channel * (0.78 + grain * 0.28))) * 255),
  ) as [number, number, number];
  return {
    color: [color[0], color[1], color[2], 255],
    roughness: 0.25 + wear * 0.6,
    bump: grain * 2 - 1,
  };
}

/** Compiles a plan's noise once and snapshots its parameters for deterministic repeated sampling. */
export function createSurfaceSampler(plan: SurfacePlan): SurfaceSampler {
  const capturedPlan = snapshotPlan("createSurfaceSampler", plan);
  const noise = createSeededNoise(capturedPlan.seed);
  return {
    sample(u: number, v: number): SurfaceSample {
      requireFiniteNumber("createSurfaceSampler", "u", u);
      requireFiniteNumber("createSurfaceSampler", "v", v);
      return sampleSurfaceWithNoise(capturedPlan, noise, u, v);
    },
  };
}

/** Samples a surface plan at finite UV coordinates without allocating a bake. */
export function sampleSurface(plan: SurfacePlan, u: number, v: number): SurfaceSample {
  return createSurfaceSampler(plan).sample(u, v);
}

/**
 * Composes a base and ordered layers using straight-alpha source-over in linear sRGB.
 * Material channels use the same normalized alpha weights as color.
 */
export function composeSurfaceLayers(
  base: SurfaceSampler,
  layers: readonly SurfaceLayer[],
): SurfaceSampler {
  if (!base || typeof base.sample !== "function") {
    throw new Error("composeSurfaceLayers: base.sampler must provide sample(u, v)");
  }
  const capturedLayers = layers.map((layer, index) => {
    if (!layer?.sampler || typeof layer.sampler.sample !== "function") {
      throw new Error(`composeSurfaceLayers: layer[${index}].sampler must provide sample(u, v)`);
    }
    if (layer.mask !== undefined && typeof layer.mask !== "function") {
      throw new Error(`composeSurfaceLayers: layer[${index}].mask must be a function`);
    }
    return { sampler: layer.sampler, mask: layer.mask };
  });

  return {
    sample(u: number, v: number): SurfaceSample {
      requireFiniteNumber("composeSurfaceLayers", "u", u);
      requireFiniteNumber("composeSurfaceLayers", "v", v);
      let alpha = 0;
      let red = 0;
      let green = 0;
      let blue = 0;
      let roughness = 0;
      let bump = 0;
      let metalness = 0;
      let hasMetalness = false;
      const accumulate = (source: SurfaceSample, mask: number): void => {
        validateSample("composeSurfaceLayers", source);
        hasMetalness ||= source.metalness !== undefined;
        const sourceAlpha = (source.color[3] / 255) * mask;
        const destinationMultiplier = 1 - sourceAlpha;
        red = srgbToLinear(source.color[0]) * sourceAlpha + red * destinationMultiplier;
        green = srgbToLinear(source.color[1]) * sourceAlpha + green * destinationMultiplier;
        blue = srgbToLinear(source.color[2]) * sourceAlpha + blue * destinationMultiplier;
        roughness = source.roughness * sourceAlpha + roughness * destinationMultiplier;
        bump = source.bump * sourceAlpha + bump * destinationMultiplier;
        // An omitted material channel represents a dielectric layer with zero metalness.
        metalness = (source.metalness ?? 0) * sourceAlpha + metalness * destinationMultiplier;
        alpha = sourceAlpha + alpha * destinationMultiplier;
      };

      accumulate(base.sample(u, v), 1);
      capturedLayers.forEach((layer, index) => {
        let mask = 1;
        if (layer.mask) {
          mask = layer.mask(u, v);
          requireRange("composeSurfaceLayers", `layer[${index}].mask result`, mask, 0, 1);
        }
        accumulate(layer.sampler.sample(u, v), mask);
      });
      if (alpha === 0) {
        return {
          color: [0, 0, 0, 0],
          roughness: 0,
          bump: 0,
          ...(hasMetalness ? { metalness: 0 } : {}),
        };
      }
      const result: SurfaceSample = {
        color: [
          linearToSrgbByte(red / alpha),
          linearToSrgbByte(green / alpha),
          linearToSrgbByte(blue / alpha),
          Math.round(alpha * 255),
        ],
        roughness: roughness / alpha,
        bump: bump / alpha,
      };
      if (hasMetalness) result.metalness = metalness / alpha;
      return result;
    },
  };
}

function requireBakeDimensions(
  operation: string,
  options: { width: number; height: number },
): number {
  const { width, height } = options;
  if (!Number.isSafeInteger(width) || !Number.isSafeInteger(height) || width <= 0 || height <= 0) {
    throw new Error(`${operation}: width and height must be positive integers`);
  }
  const pixels = width * height;
  if (!Number.isSafeInteger(pixels))
    throw new Error(`${operation}: pixel count must be a safe integer`);
  if (pixels > MAX_BAKE_PIXELS)
    throw new Error(`${operation}: pixel count must not exceed ${MAX_BAKE_PIXELS}`);
  return pixels;
}

/** Bakes a plan or sampler into deterministic, tightly packed image buffers at pixel-center UVs. */
export function bakeSurface(
  input: SurfacePlan | SurfaceSampler,
  options: { width: number; height: number },
): SurfaceBake {
  const pixels = requireBakeDimensions("bakeSurface", options);
  const { width, height } = options;
  const sampler = isSurfaceSampler(input) ? input : createSurfaceSampler(input);
  const first = sampler.sample(0.5 / width, 0.5 / height);
  validateSample("bakeSurface", first);
  const includesMetalness = first.metalness !== undefined;
  const color = new Uint8Array(pixels * 4);
  const roughness = new Uint8Array(pixels);
  const bump = new Uint8Array(pixels);
  const metalness = includesMetalness ? new Uint8Array(pixels) : undefined;
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const pixel = y * width + x;
      const sample = pixel === 0 ? first : sampler.sample((x + 0.5) / width, (y + 0.5) / height);
      validateSample("bakeSurface", sample);
      if ((sample.metalness !== undefined) !== includesMetalness) {
        throw new Error("bakeSurface: sample.metalness must be consistently present or absent");
      }
      color.set(
        [
          Math.round(sample.color[0]),
          Math.round(sample.color[1]),
          Math.round(sample.color[2]),
          Math.round(sample.color[3]),
        ],
        pixel * 4,
      );
      roughness[pixel] = Math.round(sample.roughness * 255);
      bump[pixel] = Math.round((sample.bump * 0.5 + 0.5) * 255);
      if (metalness && sample.metalness !== undefined)
        metalness[pixel] = Math.round(sample.metalness * 255);
    }
  }
  return { width, height, color, roughness, bump, ...(metalness ? { metalness } : {}) };
}

/** Describes the maps and provenance emitted by {@link bakeSurface}. */
export function createSurfaceBakeManifest(
  plan: SurfacePlan,
  bake: SurfaceBake,
): SurfaceBakeManifest {
  requirePlan("createSurfaceBakeManifest", plan);
  if (
    !Number.isInteger(bake.width) ||
    !Number.isInteger(bake.height) ||
    bake.width <= 0 ||
    bake.height <= 0
  ) {
    throw new Error("createSurfaceBakeManifest: bake width and height must be positive integers");
  }
  const pixels = bake.width * bake.height;
  if (bake.color.length !== pixels * 4)
    throw new Error("createSurfaceBakeManifest: color must have RGBA8 data for every pixel");
  if (bake.roughness.length !== pixels || bake.bump.length !== pixels) {
    throw new Error(
      "createSurfaceBakeManifest: roughness and bump must have R8 data for every pixel",
    );
  }
  if (bake.metalness !== undefined && bake.metalness.length !== pixels) {
    throw new Error("createSurfaceBakeManifest: metalness must have R8 data for every pixel");
  }
  return {
    seed: plan.seed,
    scale: plan.scale,
    baseColor: [...plan.baseColor] as [number, number, number],
    width: bake.width,
    height: bake.height,
    maps: [
      { name: "color", format: "rgba8", channels: 4, byteStride: 4 },
      { name: "roughness", format: "r8", channels: 1, byteStride: 1 },
      { name: "bump", format: "r8", channels: 1, byteStride: 1 },
      ...(bake.metalness
        ? [
            {
              name: "metalness" as const,
              format: "r8" as const,
              channels: 1 as const,
              byteStride: 1 as const,
            },
          ]
        : []),
    ],
  };
}
