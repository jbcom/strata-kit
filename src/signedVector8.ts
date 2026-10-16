/** Raw vector storage; no normal generation, frame or texture policy. */
import type { Vec3 } from "./sdf.js";
import { isUint8ArrayView, requireFiniteNumber } from "./validation.js";

const MAX_VECTORS = 4097 * 4097;

/** Internal byte rule shared with normal baking; callers validate the component. */
export function encodeSignedComponent8(value: number): number {
  return Math.round((value * 0.5 + 0.5) * 255);
}

/** Fresh mutable RGBA8 for caller-ordered XYZ triples in [-1,1]; alpha=255. No normalization. */
export function packSignedVector8(values: ArrayLike<number>): Uint8Array {
  const operation = "packSignedVector8";
  const length = values?.length;
  if (!Number.isSafeInteger(length) || length < 0 || length % 3 !== 0 || length / 3 > MAX_VECTORS) {
    throw new Error(`${operation}: values must contain 0..4097² complete XYZ triples`);
  }
  const count = length / 3;
  const data = new Uint8Array(count * 4);
  for (let sample = 0; sample < count; sample += 1) {
    for (let channel = 0; channel < 3; channel += 1) {
      const index = sample * 3 + channel;
      const value = values[index];
      requireFiniteNumber(operation, `values[${index}]`, value);
      if (value < -1 || value > 1) throw new Error(`${operation}: components must be in [-1,1]`);
      data[sample * 4 + channel] = encodeSignedComponent8(value);
    }
    data[sample * 4 + 3] = 255;
  }
  return data;
}

/**
 * Fresh raw Vec3 from current RGBA8 bytes, ignoring alpha. Quantization offsets
 * zero; callers synchronize mutation and own interpolation/final normalization.
 */
export function decodeSignedVector8(data: Uint8Array, sampleIndex: number): Vec3 {
  const operation = "decodeSignedVector8";
  if (!isUint8ArrayView(data) || data.length % 4 !== 0)
    throw new Error(`${operation}: data must be a Uint8Array of complete RGBA samples`);
  if (!Number.isSafeInteger(sampleIndex) || sampleIndex < 0 || sampleIndex >= data.length / 4)
    throw new Error(`${operation}: sampleIndex must identify an existing sample`);
  const offset = sampleIndex * 4;
  const x = 2 * (data[offset] / 255) - 1;
  const y = 2 * (data[offset + 1] / 255) - 1;
  const z = 2 * (data[offset + 2] / 255) - 1;
  requireFiniteNumber(operation, "decoded x", x);
  requireFiniteNumber(operation, "decoded y", y);
  requireFiniteNumber(operation, "decoded z", z);
  return { x, y, z };
}
