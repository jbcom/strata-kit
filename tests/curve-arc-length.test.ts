import { describe, expect, it, vi } from "vitest";
import {
  createCurveArcLengthTable as createFromRoot,
  curveArcLengthAt as lengthFromRoot,
  curveParameterAtArcLength as parameterFromRoot,
} from "../src/index.ts";
import {
  createCurveArcLengthTable,
  curveArcLengthAt,
  curveParameterAtArcLength,
  type CurveArcLengthTable,
  type CurveArcLengthTableOptions,
} from "../src/mesh.ts";

const line = (t: number) => ({ x: 7 + 3 * t, y: -11 + 4 * t, z: 2 + 12 * t });
const basic: CurveArcLengthTableOptions = { pointAt: line, range: [-2, 3], tolerance: 1e-10 };
// These smooth analytic fixtures use a physical residual allowance equal to the
// requested build tolerance. This is an independently tested fixture allowance,
// not a claimed universal guarantee for arbitrary position callbacks.
const NONUNIFORM_TOLERANCE = 1e-4;
const CURVED_TOLERANCE = 2e-4;

function expectTableInvariants(table: CurveArcLengthTable, tolerance: number): void {
  const direction = Math.sign(table.range[1] - table.range[0]);
  expect(table.knots[0]).toEqual({ parameter: table.range[0], length: 0 });
  expect(table.knots.at(-1)).toEqual({ parameter: table.range[1], length: table.totalLength });
  expect(table.totalLength).toBeGreaterThan(0);
  expect(table.observedLengthDefect).toBeGreaterThanOrEqual(0);
  expect(table.observedLengthDefect).toBeLessThanOrEqual(tolerance / 2);
  expect(table.maxProgressResidual).toBeGreaterThanOrEqual(0);
  expect(table.maxProgressResidual).toBeLessThanOrEqual(tolerance / 2);
  for (let i = 1; i < table.knots.length; i++) {
    expect(direction * (table.knots[i].parameter - table.knots[i - 1].parameter)).toBeGreaterThan(
      0,
    );
    expect(table.knots[i].length).toBeGreaterThan(table.knots[i - 1].length);
  }
  for (const knot of table.knots) {
    expect(Number.isFinite(knot.parameter) && Number.isFinite(knot.length)).toBe(true);
    expect(curveArcLengthAt(table, knot.parameter)).toBe(knot.length);
    expect(curveParameterAtArcLength(table, knot.length)).toBe(knot.parameter);
  }
}

function checkPhysicalMetric(
  table: CurveArcLengthTable,
  trueLengthAt: (parameter: number) => number,
  trueTotal: number,
  tolerance: number,
): void {
  expect(Math.abs(table.totalLength - trueTotal)).toBeLessThanOrEqual(tolerance);
  // Independent non-quarter fractions probe every retained interval; expected
  // arc values come from the analytic curve, not from the candidate table.
  for (let i = 1; i < table.knots.length; i++) {
    const a = table.knots[i - 1].parameter;
    const b = table.knots[i].parameter;
    for (const fraction of [1 / 7, 2 / 7, 4 / 7, 6 / 7]) {
      const parameter = a + fraction * (b - a);
      expect(
        Math.abs(curveArcLengthAt(table, parameter) - trueLengthAt(parameter)),
      ).toBeLessThanOrEqual(tolerance);
    }
  }
  let previousPhysical = 0;
  let previousRequested = 0;
  for (let i = 0; i <= 80; i++) {
    const requested = (trueTotal * i) / 80;
    const parameter = curveParameterAtArcLength(table, requested);
    const physical = trueLengthAt(parameter);
    expect(Math.abs(physical - requested)).toBeLessThanOrEqual(tolerance);
    if (i > 0) {
      expect(
        Math.abs(physical - previousPhysical - (requested - previousRequested)),
      ).toBeLessThanOrEqual(2 * tolerance);
    }
    previousPhysical = physical;
    previousRequested = requested;
  }
}

describe("curve arc length public table contract", () => {
  it("exposes the constructor and queries from root and mesh", () => {
    const rootTable = createFromRoot(basic);
    const meshTable = createCurveArcLengthTable(basic);
    expect(rootTable).toEqual(meshTable);
    expect(lengthFromRoot(rootTable, 0.5)).toBe(curveArcLengthAt(meshTable, 0.5));
    expect(parameterFromRoot(rootTable, 13)).toBe(curveParameterAtArcLength(meshTable, 13));
  });

  it("measures a translated 3-4-12 line with speed exactly thirteen", () => {
    const table = createCurveArcLengthTable(basic);
    expectTableInvariants(table, basic.tolerance);
    expect(table.totalLength).toBeCloseTo(65, 12);
    expect(curveArcLengthAt(table, 1.25)).toBeCloseTo(42.25, 12);
    expect(curveParameterAtArcLength(table, 13)).toBeCloseTo(-1, 12);
    expect(curveArcLengthAt(table, -100)).toBe(0);
    expect(curveArcLengthAt(table, 100)).toBe(table.totalLength);
    expect(curveParameterAtArcLength(table, -1)).toBe(-2);
    expect(curveParameterAtArcLength(table, 100)).toBe(3);
  });

  it("includes Z-only motion and descending traversal with positive cumulative lengths", () => {
    const table = createCurveArcLengthTable({
      pointAt: (t) => ({ x: -7, y: 19, z: 5 * t }),
      range: [2, -2],
      tolerance: 1e-10,
    });
    expectTableInvariants(table, 1e-10);
    expect(table.totalLength).toBeCloseTo(20, 12);
    expect(curveArcLengthAt(table, 0)).toBeCloseTo(10, 12);
    expect(curveParameterAtArcLength(table, 5)).toBeCloseTo(1, 12);
    expect(curveArcLengthAt(table, 3)).toBe(0);
    expect(curveArcLengthAt(table, -3)).toBe(table.totalLength);
    expect(curveParameterAtArcLength(table, -1)).toBe(2);
    expect(curveParameterAtArcLength(table, 21)).toBe(-2);
  });

  it("reverses the same spatial curve with complementary physical distances", () => {
    const forward = createCurveArcLengthTable(basic);
    const reverse = createCurveArcLengthTable({ ...basic, range: [3, -2] });
    expect(reverse.totalLength).toBeCloseTo(forward.totalLength, 12);
    for (const parameter of [-2, -0.7, 0, 1.3, 3]) {
      expect(
        curveArcLengthAt(forward, parameter) + curveArcLengthAt(reverse, parameter),
      ).toBeCloseTo(65, 11);
    }
  });

  it.each([1e-200, 1e200])(
    "uses stable three-dimensional lengths at position scale %s",
    (scale) => {
      const table = createCurveArcLengthTable({
        pointAt: (t) => ({ x: 3 * scale * t, y: 4 * scale * t, z: 12 * scale * t }),
        range: [0, 1],
        tolerance: scale * 1e-10,
      });
      expect(table.totalLength / (13 * scale)).toBeCloseTo(1, 12);
      expect(curveArcLengthAt(table, 0.25) / (13 * scale)).toBeCloseTo(0.25, 12);
      expect(curveParameterAtArcLength(table, 6.5 * scale)).toBeCloseTo(0.5, 12);
    },
  );

  it("preserves tiny represented physical queries across a huge finite span", () => {
    const table = createCurveArcLengthTable({
      pointAt: (t) => ({ x: t, y: 0, z: 0 }),
      range: [0, 1e308],
      tolerance: 1e295,
      initialSegments: 1,
    });
    expect(table.totalLength / 1e308).toBeCloseTo(1, 12);
    const expected = 1e-200;
    expect(curveArcLengthAt(table, expected) / expected).toBeCloseTo(1, 12);
    expect(curveParameterAtArcLength(table, expected) / expected).toBeCloseTo(1, 12);
  });

  it("copies scratch/getter values once, deep-freezes scalar data, and never calls back during queries", () => {
    let current = 0;
    const reads = { x: 0, y: 0, z: 0 };
    const scratch = {
      get x() {
        reads.x++;
        return 3 * current;
      },
      get y() {
        reads.y++;
        return 4 * current;
      },
      get z() {
        reads.z++;
        return 12 * current;
      },
    };
    const pointAt = vi.fn((t: number) => {
      current = t;
      return scratch;
    });
    const table = createCurveArcLengthTable({ ...basic, pointAt });
    expect(table.evaluations).toBe(pointAt.mock.calls.length);
    expect(reads).toEqual({ x: table.evaluations, y: table.evaluations, z: table.evaluations });
    expect(new Set(pointAt.mock.calls.map(([parameter]) => parameter)).size).toBe(
      table.evaluations,
    );
    expect(Object.isFrozen(table)).toBe(true);
    expect(Object.isFrozen(table.range)).toBe(true);
    expect(Object.isFrozen(table.knots)).toBe(true);
    expect(table.knots.every(Object.isFrozen)).toBe(true);
    expect(
      table.knots.every((knot) => Object.keys(knot).sort().join(",") === "length,parameter"),
    ).toBe(true);
    const evaluations = table.evaluations;
    current = 1e300;
    expectTableInvariants(table, basic.tolerance);
    expect(curveArcLengthAt(table, 0)).toBeCloseTo(26, 12);
    expect(pointAt).toHaveBeenCalledTimes(evaluations);
  });

  it("snapshots callback, range and controls before the first callback and owns its copied range", () => {
    const range: [number, number] = [0, 1];
    const options = {
      pointAt: (t: number) => {
        range[0] = 99;
        range[1] = 100;
        options.pointAt = () => ({ x: NaN, y: NaN, z: NaN });
        options.tolerance = 99;
        options.initialSegments = 100;
        options.maxEvaluations = 5;
        return { x: t, y: 0, z: 0 };
      },
      range,
      tolerance: 1e-6,
      initialSegments: 2,
      maxEvaluations: 33,
    };
    const table = createCurveArcLengthTable(options);
    expect(table.range).toEqual([0, 1]);
    expect(table.range).not.toBe(range);
    expect(table.totalLength).toBe(1);
    expectTableInvariants(table, 1e-6);
  });

  it("builds deterministic tables without assuming adaptive knot locations or callback order", () => {
    const options: CurveArcLengthTableOptions = {
      pointAt: (t) => Object.freeze({ x: t ** 3, y: 2, z: -7 }),
      range: [0, 1],
      tolerance: NONUNIFORM_TOLERANCE,
      initialSegments: 1,
    };
    const first = createCurveArcLengthTable(options);
    const second = createCurveArcLengthTable(options);
    expect(second).toEqual(first);
    expect(second).not.toBe(first);
    expect(second.knots).not.toBe(first.knots);
  });
});

describe("independent physical arc and inverse witnesses", () => {
  it.each([
    { name: "cubic parameter progress", value: (t: number) => t ** 3 },
    { name: "symmetric smoothstep progress", value: (t: number) => 3 * t * t - 2 * t * t * t },
  ])(
    "resolves $name by physical inverse residual rather than chord flatness or midpoint alone",
    ({ value }) => {
      const table = createCurveArcLengthTable({
        pointAt: (t) => ({ x: value(t), y: 0, z: 3 }),
        range: [0, 1],
        tolerance: NONUNIFORM_TOLERANCE,
        initialSegments: 1,
      });
      expectTableInvariants(table, NONUNIFORM_TOLERANCE);
      expect(table.knots.length).toBeGreaterThan(2);
      checkPhysicalMetric(table, value, 1, NONUNIFORM_TOLERANCE);
      for (const distance of [0.001, 0.015625, 0.125, 0.25, 0.5, 0.875, 0.999]) {
        const parameter = curveParameterAtArcLength(table, distance);
        expect(Math.abs(value(parameter) - distance)).toBeLessThanOrEqual(NONUNIFORM_TOLERANCE);
      }
    },
  );

  it("rejects finite chord-only and midpoint-only inverse witnesses with known physical errors", () => {
    // Both monotone curves have endpoint chord length1. Smoothstep also has
    // midpoint progress1/2, so those shortcuts return the finite parameter s.
    const coarseInverse = (distance: number) => distance;
    const cubicParameter = coarseInverse(0.125);
    expect(Number.isFinite(cubicParameter)).toBe(true);
    expect(cubicParameter ** 3).toBe(1 / 512);
    expect(Math.abs(cubicParameter ** 3 - 0.125)).toBeGreaterThan(NONUNIFORM_TOLERANCE);
    const midpointOnlyParameter = coarseInverse(0.25);
    const physical = 3 * midpointOnlyParameter ** 2 - 2 * midpointOnlyParameter ** 3;
    expect(physical).toBe(5 / 32);
    expect(Math.abs(physical - 0.25)).toBeGreaterThan(NONUNIFORM_TOLERANCE);
  });

  it.each(["xy", "yz", "zx"] as const)(
    "measures local circle arc residuals in the %s plane",
    (plane) => {
      const start = -0.3,
        end = 1.7,
        radius = 2;
      const pointAt = (t: number) => {
        const a = radius * Math.cos(t),
          b = radius * Math.sin(t);
        return plane === "xy"
          ? { x: a + 10, y: b - 7, z: 4 }
          : plane === "yz"
            ? { x: 10, y: a - 7, z: b + 4 }
            : { x: b + 10, y: -7, z: a + 4 };
      };
      const table = createCurveArcLengthTable({
        pointAt,
        range: [start, end],
        tolerance: CURVED_TOLERANCE,
        maxEvaluations: 16385,
      });
      expectTableInvariants(table, CURVED_TOLERANCE);
      checkPhysicalMetric(
        table,
        (t) => radius * (t - start),
        radius * (end - start),
        CURVED_TOLERANCE,
      );
      const reversed = createCurveArcLengthTable({
        pointAt,
        range: [end, start],
        tolerance: CURVED_TOLERANCE,
        maxEvaluations: 16385,
      });
      checkPhysicalMetric(
        reversed,
        (t) => radius * (end - t),
        radius * (end - start),
        CURVED_TOLERANCE,
      );
    },
  );

  it("measures a genuinely spatial helix with independent speed hypot(3,4)=5", () => {
    const start = -0.5,
      end = 2.5;
    const table = createCurveArcLengthTable({
      pointAt: (t) => ({ x: 3 * Math.cos(t), y: 4 * t, z: 3 * Math.sin(t) }),
      range: [start, end],
      tolerance: CURVED_TOLERANCE,
      maxEvaluations: 16385,
    });
    expectTableInvariants(table, CURVED_TOLERANCE);
    checkPhysicalMetric(table, (t) => 5 * (t - start), 15, CURVED_TOLERANCE);
  });

  it("resolves exactly closed endpoints with moving probes and imposes no periodic query wrapping", () => {
    const pointAt = (t: number) =>
      t === 0 || t === 1
        ? { x: 1, y: 0, z: 0 }
        : { x: Math.cos(2 * Math.PI * t), y: Math.sin(2 * Math.PI * t), z: 0 };
    const loose = createCurveArcLengthTable({
      pointAt,
      range: [0, 1],
      tolerance: 100,
      initialSegments: 1,
    });
    expect(loose.totalLength).toBeGreaterThan(0);
    expect(loose.knots.length).toBeGreaterThan(2);
    const table = createCurveArcLengthTable({
      pointAt,
      range: [0, 1],
      tolerance: 1e-3,
      initialSegments: 1,
      maxEvaluations: 16385,
    });
    checkPhysicalMetric(table, (t) => 2 * Math.PI * t, 2 * Math.PI, 1e-3);
    expect(curveArcLengthAt(table, 2)).toBe(table.totalLength);
    expect(curveArcLengthAt(table, -1)).toBe(0);
    expect(curveParameterAtArcLength(table, table.totalLength + 1)).toBe(1);
  });
});

describe("curve metric finite arithmetic and evaluation bounds", () => {
  it("validates all build controls before any callback", () => {
    const pointAt = vi.fn(line);
    const invalid = [
      { range: null },
      { range: [] },
      { range: [0] },
      { range: [0, 1, 2] },
      { range: [0, 0] },
      { range: [NaN, 1] },
      { range: [0, Infinity] },
      { range: [-Number.MAX_VALUE, Number.MAX_VALUE] },
      { tolerance: 0 },
      { tolerance: -1 },
      { tolerance: NaN },
      { tolerance: Infinity },
      { tolerance: Number.MIN_VALUE },
      { tolerance: undefined },
      { initialSegments: 0 },
      { initialSegments: 1.5 },
      { initialSegments: Number.MAX_SAFE_INTEGER + 1 },
      { maxEvaluations: 4 },
      { maxEvaluations: 65538 },
      { maxEvaluations: 10.5 },
      { initialSegments: 2, maxEvaluations: 8 },
    ];
    for (const patch of invalid) {
      expect(() =>
        createCurveArcLengthTable({
          ...basic,
          pointAt,
          ...patch,
        } as unknown as CurveArcLengthTableOptions),
      ).toThrow();
    }
    expect(pointAt).not.toHaveBeenCalled();
    for (const invalidOptions of [null, undefined, 3, "options"]) {
      expect(() =>
        createCurveArcLengthTable(invalidOptions as unknown as CurveArcLengthTableOptions),
      ).toThrow(/createCurveArcLengthTable: options/);
    }
    expect(() =>
      createCurveArcLengthTable({
        ...basic,
        pointAt: null,
      } as unknown as CurveArcLengthTableOptions),
    ).toThrow();
  });

  it("counts every callback, reuses probes, and respects an exact minimal evaluation budget", () => {
    const pointAt = vi.fn((t: number) => ({ x: 0, y: 0, z: t }));
    const table = createCurveArcLengthTable({
      pointAt,
      range: [0, 1],
      tolerance: 1e-6,
      initialSegments: 1,
      maxEvaluations: 5,
    });
    expect(table.evaluations).toBe(5);
    expect(pointAt).toHaveBeenCalledTimes(5);
    expect(new Set(pointAt.mock.calls.map(([parameter]) => parameter)).size).toBe(5);
  });

  it("throws without returning a partial metric when finite progress needs more than the budget", () => {
    const pointAt = vi.fn((t: number) => ({ x: t ** 3, y: 0, z: 0 }));
    let result: CurveArcLengthTable | undefined;
    expect(() => {
      result = createCurveArcLengthTable({
        pointAt,
        range: [0, 1],
        tolerance: 1e-8,
        initialSegments: 1,
        maxEvaluations: 5,
      });
    }).toThrow();
    expect(result).toBeUndefined();
    expect(pointAt).toHaveBeenCalledTimes(5);
  });

  it("rejects unrepresentable parameter subdivisions instead of sampling duplicate probes", () => {
    expect(() =>
      createCurveArcLengthTable({
        pointAt: line,
        range: [1, 1 + 2 ** -52],
        tolerance: 1e-6,
        initialSegments: 1,
        maxEvaluations: 5,
      }),
    ).toThrow();
  });

  it("rejects sampled stationary intervals and plateaus instead of inventing an inverse tie rule", () => {
    expect(() =>
      createCurveArcLengthTable({ ...basic, pointAt: () => ({ x: 1, y: 2, z: 3 }) }),
    ).toThrow();
    expect(() =>
      createCurveArcLengthTable({
        pointAt: (t) => ({ x: Math.max(0, t - 0.5), y: 0, z: 0 }),
        range: [0, 1],
        tolerance: 1,
        initialSegments: 2,
      }),
    ).toThrow();
  });

  it("rejects finite edges whose positive cumulative increment disappears after a large prefix", () => {
    const pointAt = (t: number) =>
      t <= 1 ? { x: 1e16 * t, y: 0, z: 0 } : { x: 1e16, y: t - 1, z: 0 };
    expect(1e16 + 1).toBe(1e16);
    expect(() =>
      createCurveArcLengthTable({
        pointAt,
        range: [0, 2],
        tolerance: 1e14,
        initialSegments: 2,
        maxEvaluations: 9,
      }),
    ).toThrow();
  });

  it("rejects nonfinite coordinate snapshots, differences and totals, and preserves callback exceptions", () => {
    for (const value of [NaN, Infinity, -Infinity, undefined, "0", null]) {
      expect(() =>
        createCurveArcLengthTable({
          ...basic,
          pointAt: () => ({ x: 0, y: 0, z: value }),
        } as unknown as CurveArcLengthTableOptions),
      ).toThrow();
    }
    for (const value of [null, undefined, {}, [0, 0, 0]]) {
      expect(() =>
        createCurveArcLengthTable({
          ...basic,
          pointAt: () => value,
        } as unknown as CurveArcLengthTableOptions),
      ).toThrow();
    }
    expect(() =>
      createCurveArcLengthTable({
        pointAt: (t) => ({ x: Math.sign(t) * Number.MAX_VALUE, y: 0, z: 0 }),
        range: [-1, 1],
        tolerance: 1,
        initialSegments: 1,
      }),
    ).toThrow();
    expect(() =>
      createCurveArcLengthTable({
        pointAt: (t) => ({
          x: t * Number.MAX_VALUE,
          y: t * Number.MAX_VALUE,
          z: t * Number.MAX_VALUE,
        }),
        range: [0, 1],
        tolerance: 1,
        initialSegments: 1,
      }),
    ).toThrow();
    const failure = new Error("curve callback stopped");
    expect(() =>
      createCurveArcLengthTable({
        ...basic,
        pointAt: () => {
          throw failure;
        },
      }),
    ).toThrow(failure);
  });

  it("requires finite forward and inverse queries without invoking the source callback", () => {
    const pointAt = vi.fn(line);
    const table = createCurveArcLengthTable({ ...basic, pointAt });
    const evaluations = pointAt.mock.calls.length;
    for (const query of [NaN, Infinity, -Infinity, undefined, null, "0"]) {
      expect(() => curveArcLengthAt(table, query as unknown as number)).toThrow();
      expect(() => curveParameterAtArcLength(table, query as unknown as number)).toThrow();
    }
    expect(pointAt).toHaveBeenCalledTimes(evaluations);
  });
});
