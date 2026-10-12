/** Seeded, renderer-neutral noise fields. */

import { requireFiniteNumber } from './validation.js';

/** A stable string or finite numeric key for deterministic generation. */
export type Seed = number | string;
/** A deterministic random-number function returning values in [0, 1). */
export type Random = () => number;

function requireSeed(operation: string, seed: Seed): void {
  if (typeof seed !== 'string' && typeof seed !== 'number') {
    throw new Error(`${operation}: seed must be a string or finite number`);
  }
  if (typeof seed === 'number' && !Number.isFinite(seed)) {
    throw new Error(`${operation}: seed must be a string or finite number`);
  }
}

/** Converts a validated seed into a stable unsigned 32-bit key. */
export function seedToUint32(seed: Seed): number {
  requireSeed('seedToUint32', seed);
  const text = String(seed);
  let hash = 2166136261;
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

/** Creates a deterministic pseudo-random stream for one seed. */
export function createSeededRandom(seed: Seed): Random {
  requireSeed('createSeededRandom', seed);
  let state = seedToUint32(seed) || 0x6d2b79f5;
  return () => {
    state |= 0;
    state = (state + 0x6d2b79f5) | 0;
    let value = Math.imul(state ^ (state >>> 15), 1 | state);
    value = (value + Math.imul(value ^ (value >>> 7), 61 | value)) ^ value;
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}

function smoothstep(value: number): number {
  return value * value * (3 - 2 * value);
}

function lattice(seed: number, x: number, y: number, z: number): number {
  let hash = seed ^ Math.imul(x, 374761393) ^ Math.imul(y, 668265263) ^ Math.imul(z, 2147483647);
  hash = Math.imul(hash ^ (hash >>> 13), 1274126177);
  return (((hash ^ (hash >>> 16)) >>> 0) / 4294967295) * 2 - 1;
}

/** Creates a finite-coordinate 3D value-noise sampler for one seed. */
export function createSeededNoise(seed: Seed): (x: number, y: number, z?: number) => number {
  requireSeed('createSeededNoise', seed);
  const key = seedToUint32(seed);
  return (x, y, z = 0) => {
    requireFiniteNumber('createSeededNoise', 'x', x);
    requireFiniteNumber('createSeededNoise', 'y', y);
    requireFiniteNumber('createSeededNoise', 'z', z);
    const x0 = Math.floor(x);
    const y0 = Math.floor(y);
    const z0 = Math.floor(z);
    const tx = smoothstep(x - x0);
    const ty = smoothstep(y - y0);
    const tz = smoothstep(z - z0);
    const sample = (dx: number, dy: number, dz: number) => lattice(key, x0 + dx, y0 + dy, z0 + dz);
    const x00 = sample(0, 0, 0) * (1 - tx) + sample(1, 0, 0) * tx;
    const x10 = sample(0, 1, 0) * (1 - tx) + sample(1, 1, 0) * tx;
    const x01 = sample(0, 0, 1) * (1 - tx) + sample(1, 0, 1) * tx;
    const x11 = sample(0, 1, 1) * (1 - tx) + sample(1, 1, 1) * tx;
    return (x00 * (1 - ty) + x10 * ty) * (1 - tz) + (x01 * (1 - ty) + x11 * ty) * tz;
  };
}

/** Sums positive integer octaves of a finite-coordinate noise sampler. */
export function fractalNoise(
  noise: (x: number, y: number, z?: number) => number,
  x: number,
  y: number,
  z: number,
  octaves = 4
): number {
  requireFiniteNumber('fractalNoise', 'x', x);
  requireFiniteNumber('fractalNoise', 'y', y);
  requireFiniteNumber('fractalNoise', 'z', z);
  if (!Number.isInteger(octaves) || octaves <= 0) {
    throw new Error('fractalNoise: octaves must be a positive integer');
  }
  let value = 0;
  let amplitude = 0.5;
  let frequency = 1;
  let total = 0;
  for (let index = 0; index < octaves; index += 1) {
    value += noise(x * frequency, y * frequency, z * frequency) * amplitude;
    total += amplitude;
    amplitude *= 0.5;
    frequency *= 2;
  }
  return value / total;
}
