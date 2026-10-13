/**
 * wear-field-v1
 *
 * Copyright (c) Jon Bogaty
 * SPDX-License-Identifier: MIT
 *
 * Owner-authorized adaptation of generic integer 2D value-noise and coherent
 * wear-field math. This module intentionally exposes no game names, palettes,
 * assets, or runtime-specific APIs.
 */
import { type Seed, seedToUint32 } from "./noise.js";
import { requireFiniteNumber, requirePositiveFiniteNumber } from "./validation.js";

/** Parameters for a deterministic, normalized coating-wear field. */
export interface WearFieldOptions {
  seed: Seed;
  scale: number;
  amount: number;
  edgeBias: number;
  bottomBias: number;
}

/** Coherent, normalized noise detail and coating-wear stages at one UV coordinate. */
export interface WearSample {
  /** Broad-scale value-noise field used to coordinate surface material properties. */
  broad: number;
  /** Mid-scale value-noise field used to coordinate surface material properties. */
  mid: number;
  /** Fine-scale value-noise field used to coordinate surface material properties. */
  fine: number;
  /** Coating chipped through, from 0 to 1. */
  chip: number;
  /** Bare metal exposed beneath a chip, from 0 to 1. */
  steel: number;
  /** Deep oxide within exposed metal, from 0 to 1. */
  oxide: number;
  /** Gravity-oriented oxide run, from 0 to 1. */
  drip: number;
}

/** A deterministic wear field sampled in UV space, with positive v pointing downward. */
export interface WearField {
  sample(u: number, v: number): WearSample;
}

function clamp01(value: number): number {
  return Math.min(1, Math.max(0, value));
}

function smoothstep(edge0: number, edge1: number, value: number): number {
  const t = clamp01((value - edge0) / (edge1 - edge0));
  return t * t * (3 - 2 * t);
}

function hash2(x: number, y: number, seed: number): number {
  let hash =
    Math.imul(x | 0, 374761393) + Math.imul(y | 0, 668265263) + Math.imul(seed | 0, 1442695041);
  hash = Math.imul(hash ^ (hash >>> 13), 1274126177);
  return ((hash ^ (hash >>> 16)) >>> 0) / 4294967296;
}

function valueNoise(x: number, y: number, seed: number): number {
  const integerX = Math.floor(x);
  const integerY = Math.floor(y);
  const fractionX = x - integerX;
  const fractionY = y - integerY;
  const smoothX = fractionX * fractionX * (3 - 2 * fractionX);
  const smoothY = fractionY * fractionY * (3 - 2 * fractionY);
  const lowerLeft = hash2(integerX, integerY, seed);
  const lowerRight = hash2(integerX + 1, integerY, seed);
  const upperLeft = hash2(integerX, integerY + 1, seed);
  const upperRight = hash2(integerX + 1, integerY + 1, seed);
  return (
    lowerLeft +
    (lowerRight - lowerLeft) * smoothX +
    (upperLeft - lowerLeft) * smoothY +
    (lowerLeft - lowerRight - upperLeft + upperRight) * smoothX * smoothY
  );
}

function fbm(x: number, y: number, seed: number, octaves = 5): number {
  let total = 0;
  let amplitude = 0.5;
  let weight = 0;
  for (let octave = 0; octave < octaves; octave += 1) {
    if (!Number.isFinite(x) || !Number.isFinite(y)) {
      throw new Error("createWearField: scaled noise coordinates must remain finite");
    }
    total += amplitude * valueNoise(x, y, seed);
    weight += amplitude;
    x = x * 2.03 + 17.1;
    y = y * 2.03 + 9.7;
    amplitude *= 0.5;
  }
  return total / weight;
}

interface WearNoiseBands {
  broad: number;
  mid: number;
  fine: number;
}

function sampleNoiseBands(u: number, v: number, scale: number, seed: number): WearNoiseBands {
  return {
    broad: fbm(u * scale * 5, v * scale * 5, seed),
    mid: fbm(u * scale * 26 + 9, v * scale * 26 + 3, seed, 4),
    fine: fbm(u * scale * 70, v * scale * 70, seed, 2),
  };
}

function requireUnitInterval(
  name: keyof Omit<WearFieldOptions, "seed" | "scale">,
  value: number,
): void {
  if (!Number.isFinite(value) || value < 0 || value > 1) {
    throw new Error(`createWearField: ${name} must be a finite number between 0 and 1`);
  }
}

/** Creates a pure wear-field-v1 sampler. Scale affects noise only; masks always use clamped UVs. */
export function createWearField(options: WearFieldOptions): WearField {
  const seed = seedToUint32(options.seed);
  requirePositiveFiniteNumber("createWearField", "scale", options.scale);
  requireUnitInterval("amount", options.amount);
  requireUnitInterval("edgeBias", options.edgeBias);
  requireUnitInterval("bottomBias", options.bottomBias);
  const { scale, amount, edgeBias, bottomBias } = options;
  let lastU: number | undefined;
  let lastV: number | undefined;
  let lastSample: WearSample | undefined;
  const remember = (u: number, v: number, sample: WearSample): WearSample => {
    lastSample = lastSample ? Object.assign(lastSample, sample) : { ...sample };
    lastU = u;
    lastV = v;
    return sample;
  };

  return {
    sample(u: number, v: number): WearSample {
      requireFiniteNumber("createWearField", "u", u);
      requireFiniteNumber("createWearField", "v", v);
      if (lastSample && u === lastU && v === lastV) return { ...lastSample };
      const bands = sampleNoiseBands(u, v, scale, seed);
      if (amount === 0) return remember(u, v, { ...bands, chip: 0, steel: 0, oxide: 0, drip: 0 });
      const maskU = clamp01(u);
      const maskV = clamp01(v);
      const edgeDistance = Math.min(maskU, 1 - maskU, maskV, 1 - maskV);
      const bias = Math.max(
        smoothstep(0.5, 1, maskV) * bottomBias,
        (1 - smoothstep(0, 0.14, edgeDistance)) * edgeBias,
      );
      const field = bands.broad * 0.78 + bands.mid * 0.22 + bias * 0.42 - 0.66;
      return remember(u, v, {
        ...bands,
        chip: amount * smoothstep(-0.14, 0, field),
        steel: amount * smoothstep(0, 0.07, field),
        oxide: amount * smoothstep(0.08, 0.26, field),
        drip:
          amount *
          smoothstep(0.5, 0.78, fbm(u * scale * 46, v * scale * 1.4, seed, 3)) *
          smoothstep(0, 0.35, maskV + bands.broad * 0.3),
      });
    },
  };
}
