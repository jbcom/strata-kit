/** Renderer-neutral, explicit-range scalar grids encoded as high/low numeric bytes. */

import {
  isUint8ArrayView,
  requireFiniteNumber,
  requirePositiveFiniteNumber,
} from "./validation.js";

/** Caller-owned scalar samples in row-major order, with an explicit decode range. */
export interface ScalarGrid16Input {
  /** Samples per row; an integer from 1 through 4097. */
  width: number;
  /** Number of rows; an integer from 1 through 4097. */
  height: number;
  /** Exactly width * height finite scalar values, indexed as row * width + column. */
  values: ArrayLike<number>;
  /** Finite scalar decoded from code zero. */
  min: number;
  /** Finite positive range; min + range must be finite and strictly greater than min. */
  range: number;
}

/** Scalar-grid metadata and tightly packed, high-byte-first UNORM16 numeric data. */
export interface ScalarGrid16 {
  readonly width: number;
  readonly height: number;
  readonly min: number;
  readonly range: number;
  /** Two bytes per sample, high byte then low byte; intentionally caller-mutable. */
  readonly data: Uint8Array;
}

interface GridMetadata {
  width: number;
  height: number;
  min: number;
  range: number;
  max: number;
  count: number;
}

function readMetadata(
  operation: string,
  input: Pick<ScalarGrid16, "width" | "height" | "min" | "range">,
): GridMetadata {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    throw new Error(`${operation}: grid metadata must be an object`);
  }
  const width = input.width;
  const height = input.height;
  if (!Number.isInteger(width) || width < 1 || width > 4097) {
    throw new Error(`${operation}: width must be an integer from 1 through 4097`);
  }
  if (!Number.isInteger(height) || height < 1 || height > 4097) {
    throw new Error(`${operation}: height must be an integer from 1 through 4097`);
  }
  const min = input.min;
  const range = input.range;
  requireFiniteNumber(operation, "min", min);
  requirePositiveFiniteNumber(operation, "range", range);
  const max = min + range;
  requireFiniteNumber(operation, "min + range", max);
  if (max <= min) {
    throw new Error(`${operation}: min + range must be representably greater than min`);
  }
  return { width, height, min, range, max, count: width * height };
}

/**
 * Packs finite scalar samples into an owned, tightly packed row-major RG8 byte array.
 *
 * The returned metadata object is frozen; its new Uint8Array remains caller-mutable. No input
 * object or sample storage is retained. Dimensions are validated before reading values, and both
 * dimensions are bounded to 1..4097 before allocation. There is no inferred range or range floor.
 *
 * A value at or below min encodes as zero; a value at or above the representable endpoint
 * min + range encodes as 65535. Strict interior values use round(((value - min) / range) * 65535),
 * clamped to [0, 65535]. Division precedes multiplication, so encoding does not require a finite
 * reciprocal range. Every code stores its high byte first and low byte second.
 *
 * For well-conditioned metadata, decoded in-range values have the usual range / (2 * 65535)
 * quantization error plus floating-point rounding tolerance. When min is large relative to range,
 * representable endpoint spacing and subtraction/addition rounding can dominate that bound.
 * This format declares numeric bytes only: world frames, UVs, texture upload and filtering policy
 * remain caller-owned. The paired GLSL implementation has its own Float32 representability limits.
 */
export function packScalarGrid16(input: ScalarGrid16Input): ScalarGrid16 {
  const operation = "packScalarGrid16";
  const { width, height, min, range, max, count } = readMetadata(operation, input);
  const values = input.values;
  if (values == null || values.length !== count) {
    throw new Error(`${operation}: values must contain exactly width * height samples`);
  }
  const data = new Uint8Array(count * 2);
  for (let index = 0; index < count; index += 1) {
    const value = values[index];
    requireFiniteNumber(operation, `values[${index}]`, value);
    let code: number;
    if (value <= min) {
      code = 0;
    } else if (value >= max) {
      code = 65535;
    } else {
      const offset = value - min;
      requireFiniteNumber(operation, `values[${index}] - min`, offset);
      const normalized = offset / range;
      requireFiniteNumber(operation, `values[${index}] normalized`, normalized);
      code = Math.max(0, Math.min(65535, Math.round(normalized * 65535)));
    }
    data[index * 2] = code >> 8;
    data[index * 2 + 1] = code & 255;
  }
  return Object.freeze({ width, height, min, range, data });
}

function decodeNormalized(data: Uint8Array, sample: number): number {
  const offset = sample * 2;
  return (256 * data[offset] + data[offset + 1]) / 65535;
}

/**
 * Bilinearly samples encoded data at finite, fractional sample-index coordinates.
 *
 * Metadata and exact Uint8Array byte length are checked in O(1), allowing hand-authored bytes as
 * well as packed results. Column and row clamp to their grid edges. A singleton axis repeats its
 * only texel; other upper edges use the final valid cell with weight one. Samples decode to
 * normalized codes, interpolate across columns then rows, and finally return min + value * range.
 *
 * Sampling reads the current caller-owned bytes without copying or caching. Callers control and
 * synchronize mutations. Bilinear quantization error obeys the per-sample half-step bound for
 * well-conditioned metadata, plus floating-point tolerance; it does not bound prior source
 * quantization, coordinate mapping, mesh tessellation or GPU rounding. No world axes, UV mapping,
 * texture state, global state or renderer dependencies are introduced here.
 */
export function sampleScalarGrid16(grid: ScalarGrid16, column: number, row: number): number {
  const operation = "sampleScalarGrid16";
  const { width, height, min, range, count } = readMetadata(operation, grid);
  const data = grid.data;
  if (!isUint8ArrayView(data) || data.length !== count * 2) {
    throw new Error(`${operation}: data must be a Uint8Array of exactly width * height * 2 bytes`);
  }
  requireFiniteNumber(operation, "column", column);
  requireFiniteNumber(operation, "row", row);
  const x = Math.max(0, Math.min(width - 1, column));
  const y = Math.max(0, Math.min(height - 1, row));
  const x0 = Math.min(Math.floor(x), Math.max(0, width - 2));
  const y0 = Math.min(Math.floor(y), Math.max(0, height - 2));
  const x1 = Math.min(x0 + 1, width - 1);
  const y1 = Math.min(y0 + 1, height - 1);
  const tx = width === 1 ? 0 : x - x0;
  const ty = height === 1 ? 0 : y - y0;
  const h00 = decodeNormalized(data, y0 * width + x0);
  const h10 = decodeNormalized(data, y0 * width + x1);
  const h01 = decodeNormalized(data, y1 * width + x0);
  const h11 = decodeNormalized(data, y1 * width + x1);
  const firstRow = h00 * (1 - tx) + h10 * tx;
  const secondRow = h01 * (1 - tx) + h11 * tx;
  const normalized = firstRow * (1 - ty) + secondRow * ty;
  const result = min + normalized * range;
  requireFiniteNumber(operation, "sample", result);
  return result;
}
