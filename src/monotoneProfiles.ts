/** Owned scalar interpolation with secant endpoints and shape-preserving interior slopes. */
import type { ScalarFieldSample } from "./surfaceFields.js";
import { requireFiniteNumber } from "./validation.js";

export interface MonotoneCubicProfilePoint {
  coordinate: number;
  value: number;
}

/** CPU-only profile; its points are distinct from the bounded GLSL Hermite format. */
export interface MonotoneCubicProfile {
  readonly domain: readonly [number, number];
  readonly points: readonly Readonly<MonotoneCubicProfilePoint & { derivative: number }>[];
}

const MAX_POINTS = 65_536;

function finite(operation: string, name: string, value: number): number {
  requireFiniteNumber(operation, name, value);
  return value;
}

function harmonicSlope(
  previous: number,
  next: number,
  previousSpan: number,
  nextSpan: number,
): number {
  if (previous === 0 || next === 0 || previous < 0 !== next < 0) return 0;
  if (previous === next) return previous;
  const scale = Math.max(previousSpan, nextSpan);
  const before = previousSpan / scale;
  const after = nextSpan / scale;
  const denominator = 3 * (before + after);
  const alpha = (before + 2 * after) / denominator;
  const beta = (2 * before + after) / denominator;
  const smaller = Math.min(Math.abs(previous), Math.abs(next));
  const calculated =
    smaller / (alpha * (smaller / Math.abs(previous)) + beta * (smaller / Math.abs(next)));
  // A positive weighted harmonic mean lies between its inputs. Enforce this
  // mathematical bound when denominator rounding would overflow near MAX_VALUE.
  const magnitude = Math.max(
    smaller,
    Math.min(Math.max(Math.abs(previous), Math.abs(next)), calculated),
  );
  return previous < 0 ? -magnitude : magnitude;
}

/** Divide the larger factor first so neither a tiny span nor a tiny slope is erased. */
function thirdProduct(slope: number, span: number): number {
  return Math.abs(slope) >= span ? (slope / 3) * span : slope * (span / 3);
}

function controls(
  left: MonotoneCubicProfile["points"][number],
  right: MonotoneCubicProfile["points"][number],
): readonly [number, number] {
  const span = right.coordinate - left.coordinate;
  return [
    finite(
      "createMonotoneCubicProfile",
      "left control",
      left.value + thirdProduct(left.derivative, span),
    ),
    finite(
      "createMonotoneCubicProfile",
      "right control",
      right.value - thirdProduct(right.derivative, span),
    ),
  ];
}

/**
 * Compiles 2–65,536 finite points, with strictly increasing representable coordinates.
 * Endpoint derivatives are adjacent secants, interior derivatives interval-weighted harmonic
 * means (zero at plateaus/sign changes). Internal joins are C1; the exterior constant extension
 * is generally C0. All records and the domain are copied and frozen. Unrepresentable spans,
 * differences, slopes or control values throw. This profile has no GLSL uniform representation.
 */
export function createMonotoneCubicProfile(
  input: readonly MonotoneCubicProfilePoint[],
): MonotoneCubicProfile {
  const operation = "createMonotoneCubicProfile";
  if (!Array.isArray(input)) throw new Error(`${operation}: points must be an array`);
  const count = input.length;
  if (!Number.isInteger(count) || count < 2 || count > MAX_POINTS) {
    throw new Error(`${operation}: points must contain 2 to ${MAX_POINTS} entries`);
  }
  const points: (MonotoneCubicProfilePoint & { derivative: number })[] = [];
  const spans: number[] = [];
  const secants: number[] = [];
  for (let index = 0; index < count; index += 1) {
    const source = input[index];
    if (!source || typeof source !== "object")
      throw new Error(`${operation}: point[${index}] must be a record`);
    const coordinate = finite(operation, `point[${index}].coordinate`, source.coordinate);
    const value = finite(operation, `point[${index}].value`, source.value);
    if (index > 0) {
      const prior = points[index - 1];
      const span = finite(operation, "coordinate span", coordinate - prior.coordinate);
      if (span <= 0) throw new Error(`${operation}: coordinates must be strictly increasing`);
      const difference = finite(operation, "value difference", value - prior.value);
      const secant = finite(operation, "secant", difference / span);
      if (difference !== 0 && secant === 0) {
        throw new Error(`${operation}: nonzero value difference has an unrepresentable secant`);
      }
      spans.push(span);
      secants.push(secant);
    }
    points.push({ coordinate, value, derivative: 0 });
  }
  points[0].derivative = secants[0];
  points[points.length - 1].derivative = secants[secants.length - 1];
  for (let index = 1; index < points.length - 1; index += 1) {
    points[index].derivative = finite(
      operation,
      "harmonic slope",
      harmonicSlope(secants[index - 1], secants[index], spans[index - 1], spans[index]),
    );
  }
  for (let index = 0; index < points.length - 1; index += 1)
    controls(points[index], points[index + 1]);
  const domain = Object.freeze([
    points[0].coordinate,
    points[points.length - 1].coordinate,
  ] as const);
  return Object.freeze({
    domain,
    points: Object.freeze(points.map((point) => Object.freeze(point))),
  });
}

function mix(left: number, right: number, fraction: number): number {
  return left === right ? left : left * (1 - fraction) + right * fraction;
}

/**
 * Samples a profile created by createMonotoneCubicProfile in O(log(pointCount)).
 * Exact knots return the stored value/shared slope, including one-sided endpoint derivatives.
 * Strictly outside returns the clamped value and derivative zero. Samples are independent
 * records. Finite arithmetic is checked; no arbitrary-range exactness or byte parity is promised.
 */
export function sampleMonotoneCubicProfile(
  profile: MonotoneCubicProfile,
  coordinate: number,
): ScalarFieldSample {
  const operation = "sampleMonotoneCubicProfile";
  requireFiniteNumber(operation, "coordinate", coordinate);
  const { points } = profile;
  const first = points[0];
  const last = points[points.length - 1];
  if (coordinate < first.coordinate) return { value: first.value, derivative: 0 };
  if (coordinate > last.coordinate) return { value: last.value, derivative: 0 };
  let lower = 0;
  let upper = points.length - 1;
  while (lower <= upper) {
    const middle = Math.floor((lower + upper) / 2);
    const point = points[middle];
    if (coordinate === point.coordinate)
      return { value: point.value, derivative: point.derivative };
    if (coordinate < point.coordinate) upper = middle - 1;
    else lower = middle + 1;
  }
  const left = points[upper];
  const right = points[lower];
  const span = right.coordinate - left.coordinate;
  const fraction = (coordinate - left.coordinate) / span;
  const secant = (right.value - left.value) / span;
  if (left.derivative === secant && right.derivative === secant) {
    return {
      value: finite(operation, "value", left.value + (coordinate - left.coordinate) * secant),
      derivative: secant,
    };
  }
  const [controlLeft, controlRight] = controls(left, right);
  const a = mix(left.value, controlLeft, fraction);
  const b = mix(controlLeft, controlRight, fraction);
  const c = mix(controlRight, right.value, fraction);
  const value = mix(mix(a, b, fraction), mix(b, c, fraction), fraction);
  const scale = Math.max(Math.abs(secant), Math.abs(left.derivative), Math.abs(right.derivative));
  const complement = 1 - fraction;
  const derivative =
    scale === 0
      ? 0
      : scale *
        (6 * fraction * complement * (secant / scale) +
          complement * (1 - 3 * fraction) * (left.derivative / scale) +
          fraction * (3 * fraction - 2) * (right.derivative / scale));
  return {
    value: finite(operation, "value", value),
    derivative: finite(operation, "derivative", derivative),
  };
}
