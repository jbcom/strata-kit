/** Seeded, renderer-neutral noise fields. */

export type Seed = number | string;
export type Random = () => number;

export function seedToUint32(seed: Seed): number {
  const text = String(seed);
  let hash = 2166136261;
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

export function createSeededRandom(seed: Seed): Random {
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

export function createSeededNoise(seed: Seed): (x: number, y: number, z?: number) => number {
  const key = seedToUint32(seed);
  return (x, y, z = 0) => {
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

export function fractalNoise(
  noise: (x: number, y: number, z?: number) => number,
  x: number,
  y: number,
  z: number,
  octaves = 4
): number {
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
