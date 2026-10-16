/** Explicit secants over a deterministic caller-owned surface map. */
import type { Vec3 } from "./sdf.js";
import type { SurfaceDifferentials } from "./surfaceFields.js";
import {
  requireFiniteNumber,
  requireFiniteVector3,
  requirePositiveFiniteNumber,
} from "./validation.js";

export interface ParametricSurfaceDifferentialOptions {
  positionAt: (u: number, v: number) => Vec3;
  u: number;
  v: number;
  uStep: number;
  vStep: number;
  uRange?: readonly [number, number];
  vRange?: readonly [number, number];
}

const OPERATION = "sampleParametricSurfaceDifferentials";

function stencil(
  axis: string,
  coordinate: number,
  step: number,
  range: readonly [number, number] | undefined,
): { lower: number; upper: number; span: number } {
  requireFiniteNumber(OPERATION, axis, coordinate);
  requirePositiveFiniteNumber(OPERATION, `${axis}Step`, step);
  let minimum = -Infinity;
  let maximum = Infinity;
  if (range !== undefined) {
    if (!Array.isArray(range) || range.length !== 2)
      throw new Error(`${OPERATION}: ${axis}Range must be a two-number array`);
    [minimum, maximum] = range;
    requireFiniteNumber(OPERATION, `${axis}Range minimum`, minimum);
    requireFiniteNumber(OPERATION, `${axis}Range maximum`, maximum);
    if (minimum >= maximum || coordinate < minimum || coordinate > maximum)
      throw new Error(`${OPERATION}: ${axis}Range must be ordered and contain ${axis}`);
  }
  // Only selected samples must be finite; finite bounds can clip raw overflow.
  const lower = Math.max(minimum, coordinate - step);
  const upper = Math.min(maximum, coordinate + step);
  requireFiniteNumber(OPERATION, `${axis} lower sample`, lower);
  requireFiniteNumber(OPERATION, `${axis} upper sample`, upper);
  if (
    (lower === coordinate && coordinate !== minimum) ||
    (upper === coordinate && coordinate !== maximum)
  )
    throw new Error(`${OPERATION}: ${axis}Step must preserve interior increments`);
  const span = upper - lower;
  requirePositiveFiniteNumber(OPERATION, `${axis} sampled span`, span);
  return { lower, upper, span };
}

function copyPosition(positionAt: (u: number, v: number) => Vec3, u: number, v: number): Vec3 {
  const { x, y, z } = positionAt(u, v);
  const point = { x, y, z };
  requireFiniteVector3(OPERATION, "positionAt result", point);
  return point;
}

function slope(lower: Vec3, upper: Vec3, span: number): Vec3 {
  const difference = { x: upper.x - lower.x, y: upper.y - lower.y, z: upper.z - lower.z };
  requireFiniteVector3(OPERATION, "position difference", difference);
  const result = { x: difference.x / span, y: difference.y / span, z: difference.z / span };
  requireFiniteVector3(OPERATION, "differential", result);
  return result;
}

/**
 * Four explicit-step position samples yield owned secant du/dv vectors.
 * Ranges clip stencils; exact endpoints use one-sided secants. Both stencils
 * validate before callbacks; each borrowed callback vector is copied immediately.
 * Steps and conditioning control approximation error. No normal or wrapping is chosen.
 */
export function sampleParametricSurfaceDifferentials(
  options: ParametricSurfaceDifferentialOptions,
): SurfaceDifferentials {
  const { positionAt, u, v, uStep, vStep, uRange, vRange } = options;
  if (typeof positionAt !== "function")
    throw new Error(`${OPERATION}: positionAt must be callable`);
  const uStencil = stencil("u", u, uStep, uRange);
  const vStencil = stencil("v", v, vStep, vRange);
  const uLower = copyPosition(positionAt, uStencil.lower, v);
  const uUpper = copyPosition(positionAt, uStencil.upper, v);
  const vLower = copyPosition(positionAt, u, vStencil.lower);
  const vUpper = copyPosition(positionAt, u, vStencil.upper);
  return { du: slope(uLower, uUpper, uStencil.span), dv: slope(vLower, vUpper, vStencil.span) };
}
