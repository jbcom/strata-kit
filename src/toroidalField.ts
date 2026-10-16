import { requireFiniteNumber, requirePositiveFiniteNumber } from "./validation.js";

/** Borrowed, deterministic and call-order-independent scalar field in four dimensions. */
export type ScalarField4D = (x: number, y: number, z: number, w: number) => number;

/**
 * Samples two unit-period circles through one borrowed 4D field, returning its raw value.
 * Phases are finite and bounded by 2**20; circumference and radius must stay positive finite.
 * Direct Float64 angular arithmetic preserves ordinary phase evaluation, not exact seam bits.
 */
export function sampleToroidalField2D(
  sample4D: ScalarField4D,
  u: number,
  v: number,
  circumference: number,
): number {
  const operation = "sampleToroidalField2D";
  if (typeof sample4D !== "function") throw new Error(`${operation}: sample4D must be callable`);
  requireFiniteNumber(operation, "u", u);
  requireFiniteNumber(operation, "v", v);
  if (Math.abs(u) > 2 ** 20 || Math.abs(v) > 2 ** 20)
    throw new Error(`${operation}: phase magnitude must not exceed 2**20`);
  requirePositiveFiniteNumber(operation, "circumference", circumference);
  const tau = 2 * Math.PI;
  const radius = circumference / tau;
  requirePositiveFiniteNumber(operation, "radius", radius);
  const a = u * tau;
  const b = v * tau;
  const x = Math.cos(a) * radius;
  const y = Math.sin(a) * radius;
  const z = Math.cos(b) * radius;
  const w = Math.sin(b) * radius;
  requireFiniteNumber(operation, "mapped x", x);
  requireFiniteNumber(operation, "mapped y", y);
  requireFiniteNumber(operation, "mapped z", z);
  requireFiniteNumber(operation, "mapped w", w);
  let value: number;
  try {
    value = sample4D(x, y, z, w);
  } catch (cause) {
    throw new Error(`${operation}: sample4D failed`, { cause });
  }
  requireFiniteNumber(operation, "sample4D result", value);
  return value;
}
