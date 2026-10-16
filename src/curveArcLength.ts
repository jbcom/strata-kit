/** Bounded, position-only sampled curve metrics; no spline or frame policy. */
import type { Vec3 } from "./sdf.js";
import { requireFiniteNumber, requirePositiveFiniteNumber } from "./validation.js";

export interface CurveArcLengthTableOptions {
  readonly pointAt: (parameter: number) => Readonly<Vec3>;
  readonly range: readonly [number, number];
  readonly tolerance: number;
  readonly initialSegments?: number;
  readonly maxEvaluations?: number;
}

export interface CurveArcLengthKnot {
  readonly parameter: number;
  readonly length: number;
}

export interface CurveArcLengthTable {
  readonly range: readonly [number, number];
  readonly knots: readonly CurveArcLengthKnot[];
  readonly totalLength: number;
  readonly evaluations: number;
  readonly observedLengthDefect: number;
  readonly maxProgressResidual: number;
}

interface Sample extends Vec3 {
  parameter: number;
}
interface Leaf {
  samples: readonly [Sample, Sample, Sample, Sample, Sample];
  chord: number;
  defect: number;
  progress: number;
}

const BUILD = "createCurveArcLengthTable";

function finite(name: string, value: number): number {
  requireFiniteNumber(BUILD, name, value);
  return value;
}

function distance(a: Sample, b: Sample): number {
  return finite(
    "distance",
    Math.hypot(
      finite("position difference", b.x - a.x),
      finite("position difference", b.y - a.y),
      finite("position difference", b.z - a.z),
    ),
  );
}

function leaf(samples: Leaf["samples"]): Leaf {
  const start = samples[0];
  const span = samples[4].parameter - start.parameter;
  const prefixes = [0];
  for (let index = 1; index < 5; index++) {
    prefixes.push(
      finite("probe length", prefixes[index - 1] + distance(samples[index - 1], samples[index])),
    );
  }
  const length = prefixes[4];
  if (length === 0) throw new Error(`${BUILD}: sampled stationary interval is not invertible`);
  const chord = distance(start, samples[4]);
  let progress = 0;
  for (let index = 1; index < 4; index++) {
    const fraction = (samples[index].parameter - start.parameter) / span;
    progress = Math.max(
      progress,
      finite("progress residual", Math.abs(prefixes[index] - fraction * length)),
    );
  }
  return { samples, chord, defect: Math.max(0, finite("chord defect", length - chord)), progress };
}

/** Compensated signed updates; final acceptance independently rescans active leaves. */
class Sum {
  value = 0;
  correction = 0;
  add(value: number): void {
    const next = finite("accumulated length", this.value + value);
    this.correction = finite(
      "length correction",
      this.correction +
        (Math.abs(this.value) >= Math.abs(value)
          ? this.value - next + value
          : value - next + this.value),
    );
    this.value = next;
  }
  get total(): number {
    return finite("corrected length", this.value + this.correction);
  }
}

/** Immutable priorities: unresolved endpoints, progress, then chord defect. */
class LeafHeap {
  readonly items: Leaf[] = [];
  constructor(
    private readonly allowance: number,
    private readonly direction: number,
  ) {}
  private precedes(a: Leaf, b: Leaf): boolean {
    const rank = (value: Leaf) => (value.chord === 0 ? 2 : value.progress > this.allowance ? 1 : 0);
    const aRank = rank(a),
      bRank = rank(b);
    if (aRank !== bRank) return aRank > bRank;
    const aScore = aRank === 1 ? a.progress : a.defect;
    const bScore = bRank === 1 ? b.progress : b.defect;
    return aScore !== bScore
      ? aScore > bScore
      : this.direction * (a.samples[0].parameter - b.samples[0].parameter) < 0;
  }
  push(value: Leaf): void {
    const items = this.items;
    let index = items.length;
    items.push(value);
    while (index > 0) {
      const parent = (index - 1) >> 1;
      if (!this.precedes(value, items[parent])) break;
      items[index] = items[parent];
      index = parent;
    }
    items[index] = value;
  }
  pop(): Leaf {
    const items = this.items;
    const first = items[0];
    const last = items[items.length - 1];
    items.pop();
    if (items.length === 0) return first;
    let index = 0;
    while (index * 2 + 1 < items.length) {
      let child = index * 2 + 1;
      if (child + 1 < items.length && this.precedes(items[child + 1], items[child])) child++;
      if (!this.precedes(items[child], last)) break;
      items[index] = items[child];
      index = child;
    }
    items[index] = last;
    return first;
  }
}

/**
 * Builds an owned frozen polyline metric with observed chord/progress residuals.
 * Tolerance is not a certified error bound for arbitrary unseen callback geometry.
 * Every probe counts; unresolved budgets, stationary samples and numeric collapse throw.
 */
export function createCurveArcLengthTable(
  options: CurveArcLengthTableOptions,
): CurveArcLengthTable {
  if (!options || typeof options !== "object")
    throw new Error(`${BUILD}: options must be a non-null object`);
  const { pointAt, range, tolerance, initialSegments = 8, maxEvaluations = 4097 } = options;
  if (typeof pointAt !== "function") throw new Error(`${BUILD}: pointAt must be callable`);
  if (!Array.isArray(range) || range.length !== 2)
    throw new Error(`${BUILD}: range must have two endpoints`);
  const start = finite("range start", range[0]);
  const end = finite("range end", range[1]);
  const span = finite("range span", end - start);
  if (span === 0) throw new Error(`${BUILD}: range endpoints must be distinct`);
  requirePositiveFiniteNumber(BUILD, "tolerance", tolerance);
  const allowance = tolerance / 2;
  if (allowance === 0) throw new Error(`${BUILD}: tolerance must remain positive when halved`);
  if (!Number.isSafeInteger(initialSegments) || initialSegments < 1)
    throw new Error(`${BUILD}: initialSegments must be a positive safe integer`);
  if (!Number.isInteger(maxEvaluations) || maxEvaluations < 5 || maxEvaluations > 65537)
    throw new Error(`${BUILD}: maxEvaluations must be an integer from 5 to 65537`);
  if (initialSegments > (maxEvaluations - 1) / 4)
    throw new Error(`${BUILD}: initial sampling exceeds the evaluation budget`);

  const direction = Math.sign(span);
  let evaluations = 0;
  function sample(parameter: number): Sample {
    if (evaluations >= maxEvaluations) throw new Error(`${BUILD}: evaluation budget exhausted`);
    evaluations++;
    const { x, y, z } = pointAt(parameter);
    return {
      parameter,
      x: finite("pointAt.x", x),
      y: finite("pointAt.y", y),
      z: finite("pointAt.z", z),
    };
  }
  function interior(a: number, b: number, fraction: number): number {
    const parameter = finite("probe parameter", a + (b - a) * fraction);
    if (direction * (parameter - a) <= 0 || direction * (b - parameter) <= 0)
      throw new Error(`${BUILD}: parameter precision cannot represent distinct interior probes`);
    return parameter;
  }
  const heap = new LeafHeap(allowance, direction);
  let defects = new Sum();
  let first = sample(start);
  for (let index = 0; index < initialSegments; index++) {
    const a = first.parameter;
    const b = index + 1 === initialSegments ? end : start + span * ((index + 1) / initialSegments);
    const q = [interior(a, b, 0.25), interior(a, b, 0.5), interior(a, b, 0.75)];
    if (direction * (q[1] - q[0]) <= 0 || direction * (q[2] - q[1]) <= 0)
      throw new Error(`${BUILD}: parameter precision cannot order interior probes`);
    const next = leaf([first, sample(q[0]), sample(q[1]), sample(q[2]), sample(b)]);
    heap.push(next);
    defects.add(next.defect);
    first = next.samples[4];
  }

  let observedLengthDefect = 0;
  let maxProgressResidual = 0;
  while (true) {
    const worst = heap.items[0];
    if (worst.chord > 0 && worst.progress <= allowance && defects.total <= allowance) {
      // The heap changes priority after progress converges: its top is NOT max(P).
      const exact = new Sum();
      maxProgressResidual = 0;
      for (const value of heap.items) {
        exact.add(value.defect);
        maxProgressResidual = Math.max(maxProgressResidual, value.progress);
      }
      observedLengthDefect = exact.total;
      if (observedLengthDefect <= allowance) break;
      defects = exact;
    }
    if (evaluations + 4 > maxEvaluations)
      throw new Error(`${BUILD}: evaluation budget exhausted before convergence`);
    const parent = heap.pop();
    const s = parent.samples;
    // Check all new represented parameters before calling user code.
    const q = [0, 1, 2, 3].map((index) =>
      interior(s[index].parameter, s[index + 1].parameter, 0.5),
    );
    const left = leaf([s[0], sample(q[0]), s[1], sample(q[1]), s[2]]);
    const right = leaf([s[2], sample(q[2]), s[3], sample(q[3]), s[4]]);
    defects.add(-parent.defect);
    defects.add(left.defect);
    defects.add(right.defect);
    heap.push(left);
    heap.push(right);
  }

  const ordered = heap.items.sort(
    (a, b) => direction * (a.samples[0].parameter - b.samples[0].parameter),
  );
  const lengths = new Sum();
  const knots: CurveArcLengthKnot[] = [Object.freeze({ parameter: start, length: 0 })];
  for (const value of ordered) {
    lengths.add(value.chord);
    const length = lengths.total;
    if (length <= knots[knots.length - 1].length)
      throw new Error(`${BUILD}: positive cumulative increments must remain representable`);
    knots.push(Object.freeze({ parameter: value.samples[4].parameter, length }));
  }
  return Object.freeze({
    range: Object.freeze([start, end]) as readonly [number, number],
    knots: Object.freeze(knots),
    totalLength: lengths.total,
    evaluations,
    observedLengthDefect,
    maxProgressResidual,
  });
}

/** Preserves representable small answers when an intermediate query fraction underflows. */
function scaledOffset(offset: number, inputSpan: number, outputSpan: number): number {
  if (offset === 0) return 0;
  if (offset === inputSpan) return outputSpan;
  const magnitude = Math.abs(outputSpan);
  const ratio = Math.max(offset, magnitude) / inputSpan;
  const result = Number.isFinite(ratio)
    ? ratio * Math.min(offset, magnitude)
    : (offset / inputSpan) * magnitude;
  return Math.sign(outputSpan) * Math.min(magnitude, result);
}

function query(table: CurveArcLengthTable, value: number, inverse: boolean): number {
  const operation = inverse ? "curveParameterAtArcLength" : "curveArcLengthAt";
  requireFiniteNumber(operation, "query", value);
  const knots = table.knots;
  const last = knots.length - 1;
  const direction = inverse ? 1 : Math.sign(table.range[1] - table.range[0]);
  const input = (knot: CurveArcLengthKnot) => (inverse ? knot.length : knot.parameter);
  const output = (knot: CurveArcLengthKnot) => (inverse ? knot.parameter : knot.length);
  if (direction * (value - input(knots[0])) <= 0) return output(knots[0]);
  if (direction * (value - input(knots[last])) >= 0) return output(knots[last]);
  let lower = 0,
    upper = last;
  while (upper - lower > 1) {
    const middle = (lower + upper) >> 1;
    const difference = direction * (value - input(knots[middle]));
    if (difference === 0) return output(knots[middle]);
    if (difference > 0) lower = middle;
    else upper = middle;
  }
  const left = knots[lower],
    right = knots[upper];
  const result =
    output(left) +
    scaledOffset(
      direction * (value - input(left)),
      direction * (input(right) - input(left)),
      output(right) - output(left),
    );
  requireFiniteNumber(operation, "interpolated result", result);
  return result;
}

/** Clamped distance in the frozen sampled polyline; no callback evaluation. */
export function curveArcLengthAt(table: CurveArcLengthTable, parameter: number): number {
  return query(table, parameter, false);
}

/** Clamped parameter in the frozen sampled polyline; no implicit wrapping. */
export function curveParameterAtArcLength(table: CurveArcLengthTable, length: number): number {
  return query(table, length, true);
}
