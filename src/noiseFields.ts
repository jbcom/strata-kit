/** Bounded deterministic noise in caller-declared XZ coordinates. */
import type { ScalarField2D } from "./fieldTypes.js";
import { type Seed, seedToUint32 } from "./noise.js";
import { sampleSeededLattice } from "./noiseLattice.js";
import { requireFiniteNumber, requirePositiveFiniteNumber } from "./validation.js";

/** Integer-coordinate sampler; callbacks must be deterministic and independent of call order. */
export type LatticeSampler2D = (ix: number, iz: number) => number;
export type ValueNoise2DOptions =
  | { seed: Seed; lattice?: never }
  | { lattice: LatticeSampler2D; seed?: never };
export interface FractalNoise2DOptions {
  noise: ScalarField2D;
  octaves?: number;
  initialAmplitude?: number;
  persistence?: number;
  octaveTransform?: { scale: readonly [number, number]; offset: readonly [number, number] };
  normalize?: boolean;
}
export interface SineLattice2DOptions {
  seed: Seed;
  coefficients: readonly [number, number];
  multiplier: number;
}

function requireCoordinate(operation: string, name: string, value: number): void {
  requireFiniteNumber(operation, name, value);
  if (Math.abs(value) >= 2 ** 52) {
    throw new Error(`${operation}: ${name} must have magnitude below 2**52`);
  }
}
function copyPair(
  operation: string,
  name: string,
  pair: readonly [number, number],
): [number, number] {
  if (!Array.isArray(pair) || pair.length !== 2) {
    throw new Error(`${operation}: ${name} must contain exactly two numbers`);
  }
  requireFiniteNumber(operation, `${name}[0]`, pair[0]);
  requireFiniteNumber(operation, `${name}[1]`, pair[1]);
  return [pair[0], pair[1]];
}
function sample(operation: string, callback: ScalarField2D, x: number, z: number): number {
  let value: number;
  try {
    value = callback(x, z);
  } catch (cause) {
    throw new Error(`${operation}: callback failed`, { cause });
  }
  requireFiniteNumber(operation, "callback result", value);
  return value;
}
function finite(operation: string, name: string, value: number): number {
  requireFiniteNumber(operation, name, value);
  return value;
}

/**
 * Creates cubic-smoothed value noise using the ordered bilinear polynomial.
 * Seeded values use the existing integer hash with Y=0, in [-1,1]. Injected
 * lattice values are not remapped or clamped. Coordinates must have magnitude
 * below 2**52, preserving distinguishable integer neighbors. Finite callback
 * values and arithmetic are checked on every sample; callback state is borrowed.
 */
export function createValueNoise2D(options: ValueNoise2DOptions): ScalarField2D {
  const operation = "createValueNoise2D";
  if (!options || typeof options !== "object")
    throw new Error(`${operation}: options are required`);
  const hasSeed = Object.hasOwn(options, "seed");
  const hasLattice = Object.hasOwn(options, "lattice");
  if (hasSeed === hasLattice)
    throw new Error(`${operation}: supply exactly one of seed or lattice`);
  let lattice: LatticeSampler2D;
  if (hasSeed) {
    const key = seedToUint32(options.seed as Seed);
    lattice = (x, z) => sampleSeededLattice(key, x, 0, z);
  } else {
    if (typeof options.lattice !== "function")
      throw new Error(`${operation}: lattice must be a function`);
    lattice = options.lattice;
  }
  return (x, z) => {
    requireCoordinate(operation, "x", x);
    requireCoordinate(operation, "z", z);
    const ix = Math.floor(x);
    const iz = Math.floor(z);
    if (!Number.isSafeInteger(ix + 1) || !Number.isSafeInteger(iz + 1)) {
      throw new Error(`${operation}: lattice neighbors must be safe integers`);
    }
    const fx = x - ix;
    const fz = z - iz;
    const ux = fx * fx * (3 - 2 * fx);
    const uz = fz * fz * (3 - 2 * fz);
    const a = sample(operation, lattice, ix, iz);
    const b = sample(operation, lattice, ix + 1, iz);
    const c = sample(operation, lattice, ix, iz + 1);
    const d = sample(operation, lattice, ix + 1, iz + 1);
    const bx = finite(operation, "x difference", b - a);
    const cz = finite(operation, "z difference", c - a);
    const ab = finite(operation, "cross difference", a - b);
    const abc = finite(operation, "cross difference", ab - c);
    const cross = finite(operation, "cross difference", abc + d);
    const first = finite(operation, "x sum", a + bx * ux);
    const second = finite(operation, "z sum", first + cz * uz);
    return finite(operation, "result", second + cross * ux * uz);
  };
}

/**
 * Samples 1..32 octaves with recursive per-axis affine coordinates. Each octave
 * adds amplitude*sample in order; normalization defaults to true. Zero persistence
 * still samples all declared octaves. Tuples are copied. Callbacks must be pure
 * and independent of sampling order; their execution time is caller-controlled.
 */
export function createFractalNoise2D(options: FractalNoise2DOptions): ScalarField2D {
  const operation = "createFractalNoise2D";
  if (!options || typeof options.noise !== "function")
    throw new Error(`${operation}: noise must be a function`);
  const noise = options.noise;
  const octaves = options.octaves === undefined ? 4 : options.octaves;
  const initialAmplitude = options.initialAmplitude === undefined ? 0.5 : options.initialAmplitude;
  const persistence = options.persistence === undefined ? 0.5 : options.persistence;
  const normalize = options.normalize === undefined ? true : options.normalize;
  if (!Number.isInteger(octaves) || octaves < 1 || octaves > 32) {
    throw new Error(`${operation}: octaves must be an integer in [1,32]`);
  }
  requirePositiveFiniteNumber(operation, "initialAmplitude", initialAmplitude);
  requireFiniteNumber(operation, "persistence", persistence);
  if (persistence < 0 || persistence > 1)
    throw new Error(`${operation}: persistence must be in [0,1]`);
  if (typeof normalize !== "boolean") throw new Error(`${operation}: normalize must be boolean`);
  const transform = options.octaveTransform;
  if (transform !== undefined && (!transform || typeof transform !== "object")) {
    throw new Error(`${operation}: octaveTransform must provide scale and offset pairs`);
  }
  const [sx, sz] = copyPair(operation, "scale", transform === undefined ? [2, 2] : transform.scale);
  const [ox, oz] = copyPair(
    operation,
    "offset",
    transform === undefined ? [0, 0] : transform.offset,
  );
  return (x, z) => {
    requireFiniteNumber(operation, "x", x);
    requireFiniteNumber(operation, "z", z);
    let qx = x;
    let qz = z;
    let amplitude = initialAmplitude;
    let total = 0;
    let value = 0;
    for (let octave = 0; octave < octaves; octave += 1) {
      const sampled = sample(operation, noise, qx, qz);
      const weighted = finite(operation, "weighted sample", amplitude * sampled);
      value = finite(operation, "sum", value + weighted);
      if (normalize) total = finite(operation, "amplitude total", total + amplitude);
      if (octave + 1 < octaves) {
        qx = finite(operation, "scaled x", qx * sx);
        qx = finite(operation, "transformed x", qx + ox);
        qz = finite(operation, "scaled z", qz * sz);
        qz = finite(operation, "transformed z", qz + oz);
        amplitude = finite(operation, "amplitude", amplitude * persistence);
      }
    }
    return finite(operation, "result", normalize ? value / total : value);
  };
}

/**
 * Creates a sine-hashed integer lattice from explicit coefficients. Numeric seeds
 * are finite phases (0 preserves the unshifted formula); strings use seedToUint32
 * as phase. This differs from integer-hash seed semantics. Math.sin low bits may
 * differ across engines/platforms, so byte portability is not promised. Integer
 * coordinates must have magnitude below 2**52; large phases/products can lose
 * phase resolution even when finite. All intermediate arithmetic must be finite.
 */
export function createSineLattice2D(options: SineLattice2DOptions): LatticeSampler2D {
  const operation = "createSineLattice2D";
  if (!options || typeof options !== "object")
    throw new Error(`${operation}: options are required`);
  const key = seedToUint32(options.seed);
  const phase = typeof options.seed === "number" ? options.seed : key;
  const [cx, cz] = copyPair(operation, "coefficients", options.coefficients);
  const multiplier = options.multiplier;
  requirePositiveFiniteNumber(operation, "multiplier", multiplier);
  return (ix, iz) => {
    requireCoordinate(operation, "ix", ix);
    requireCoordinate(operation, "iz", iz);
    if (!Number.isInteger(ix) || !Number.isInteger(iz))
      throw new Error(`${operation}: coordinates must be integers`);
    const xTerm = finite(operation, "x product", ix * cx);
    const zTerm = finite(operation, "z product", iz * cz);
    const sum = finite(operation, "coordinate sum", xTerm + zTerm);
    const angle = finite(operation, "phase sum", sum + phase);
    const value = finite(operation, "sine product", Math.sin(angle) * multiplier);
    return value - Math.floor(value);
  };
}
