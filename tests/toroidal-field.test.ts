import { describe, expect, it, vi } from "vitest";
import { sampleToroidalField2D as sampleFromRoot } from "../src/index.ts";
import { sampleToroidalField2D, type ScalarField4D } from "../src/noise.ts";

const TAU = 2 * Math.PI;
const PHASE_LIMIT = 2 ** 20;
// Fixed before execution. Value/periodic checks use ordinary phases and radius1;
// the derivative allowance covers centered-difference truncation and Float64
// cancellation at h=2^-18. No arbitrary-field or maximum-phase seam guarantee.
const VALUE_TOLERANCE = 2e-14;
const DERIVATIVE_TOLERANCE = 1e-8;
const NORMAL_TOLERANCE = 2e-9;
const STEP = 2 ** -18;

function expectTuple(
  actual: readonly number[],
  expected: readonly number[],
  tolerance: number,
): void {
  expect(actual.length).toBe(expected.length);
  expected.forEach((value, axis) => {
    expect(Math.abs(actual[axis] - value)).toBeLessThanOrEqual(tolerance);
  });
}
const smooth: ScalarField4D = (x, y, z, w) => x * z + y * w + x / 4;
const height = (u: number, v: number) => sampleToroidalField2D(smooth, u, v, TAU);
function slopes(u: number, v: number): [number, number] {
  return [
    (height(u + STEP, v) - height(u - STEP, v)) / (2 * STEP),
    (height(u, v + STEP) - height(u, v - STEP)) / (2 * STEP),
  ];
}
function graphNormal(du: number, dv: number): number[] {
  const length = Math.hypot(du, 1, dv);
  return [-du / length, 1 / length, -dv / length];
}
function analyticSlopes(u: number, v: number): [number, number] {
  // For radius1, the independent circle dot-product identity gives
  // H=cos(TAU*(u-v)) + cos(TAU*u)/4.
  return [
    -TAU * Math.sin(TAU * (u - v)) - (TAU * Math.sin(TAU * u)) / 4,
    TAU * Math.sin(TAU * (u - v)),
  ];
}

describe("toroidal 4D field adapter coordinate contract", () => {
  it("is available through root and noise and returns the sampler's raw scalar", () => {
    const field: ScalarField4D = (x, y, z, w) => x + 2 * y + 3 * z - 4 * w;
    expect(sampleFromRoot(field, 0.125, -0.375, 7)).toBe(
      sampleToroidalField2D(field, 0.125, -0.375, 7),
    );
    for (const value of [-7, 0, 2.5, Number.MIN_VALUE, Number.MAX_VALUE]) {
      expect(sampleToroidalField2D(() => value, 0.1, -0.2, 1)).toBe(value);
    }
  });

  it.each([
    { u: 0, v: 0, expected: [1, 0, 1, 0] },
    { u: 0.25, v: -0.5, expected: [0, 1, -1, 0] },
    { u: -0.25, v: 0.5, expected: [0, -1, -1, 0] },
    { u: 0.5, v: 0.75, expected: [-1, 0, 0, -1] },
  ])(
    "maps independent quarter-circle signs and component order at ($u,$v)",
    ({ u, v, expected }) => {
      const field = vi.fn(() => -3);
      expect(sampleToroidalField2D(field, u, v, TAU)).toBe(-3);
      expect(field).toHaveBeenCalledTimes(1);
      expectTuple(field.mock.calls[0], expected, 1e-15);
    },
  );

  it.each([1e-200, 7, 1e200, Number.MAX_VALUE])(
    "gives both circles circumference %s in field units",
    (circumference) => {
      let coordinates: number[] = [];
      sampleToroidalField2D(
        (...point) => {
          coordinates = point;
          return 0;
        },
        0.125,
        -0.375,
        circumference,
      );
      const radius = circumference / TAU;
      expect(Math.hypot(coordinates[0], coordinates[1]) / radius).toBeCloseTo(1, 13);
      expect(Math.hypot(coordinates[2], coordinates[3]) / radius).toBeCloseTo(1, 13);
      expect(coordinates.every(Number.isFinite)).toBe(true);
    },
  );

  it("preserves direct native phase arithmetic instead of reducing a unit phase modulo one", () => {
    const value = sampleToroidalField2D((_x, y) => y, 1, 0, TAU);
    expect(value).toBe(Math.sin(TAU));
    expect(value).not.toBe(0);
    const negative = sampleToroidalField2D((_x, y) => y, -1, 0, TAU);
    expect(negative).toBe(Math.sin(-TAU));
  });

  it("has analytic tangential speed equal to circumference and the expected scalar chain rule", () => {
    const circumference = 7,
      u = 0.125,
      v = -0.375;
    const coordinates = (a: number, b: number) => {
      let result: number[] = [];
      sampleToroidalField2D(
        (...point) => {
          result = point;
          return 0;
        },
        a,
        b,
        circumference,
      );
      return result;
    };
    const left = coordinates(u - STEP, v),
      right = coordinates(u + STEP, v);
    const below = coordinates(u, v - STEP),
      above = coordinates(u, v + STEP);
    const du = right.map((value, i) => (value - left[i]) / (2 * STEP));
    const dv = above.map((value, i) => (value - below[i]) / (2 * STEP));
    expect(Math.abs(Math.hypot(...du) - circumference)).toBeLessThanOrEqual(DERIVATIVE_TOLERANCE);
    expect(Math.abs(Math.hypot(...dv) - circumference)).toBeLessThanOrEqual(DERIVATIVE_TOLERANCE);
    expect(du[2]).toBe(0);
    expect(du[3]).toBe(0);
    expect(dv[0]).toBe(0);
    expect(dv[1]).toBe(0);
    const field: ScalarField4D = (x, y, z, w) => x + 2 * y + 3 * z - 4 * w;
    const sample = (a: number, b: number) => sampleToroidalField2D(field, a, b, circumference);
    const scalarDu = (sample(u + STEP, v) - sample(u - STEP, v)) / (2 * STEP);
    const scalarDv = (sample(u, v + STEP) - sample(u, v - STEP)) / (2 * STEP);
    expect(
      Math.abs(scalarDu - circumference * (-Math.sin(TAU * u) + 2 * Math.cos(TAU * u))),
    ).toBeLessThanOrEqual(DERIVATIVE_TOLERANCE);
    expect(
      Math.abs(scalarDv - circumference * (-3 * Math.sin(TAU * v) - 4 * Math.cos(TAU * v))),
    ).toBeLessThanOrEqual(DERIVATIVE_TOLERANCE);
  });
});

describe("smooth analytic periodic witness", () => {
  it("matches the circle dot-product identity and ordinary integer shifts within a fixed floating budget", () => {
    for (const [u, v] of [
      [0.125, 0.2],
      [-0.375, 0.7],
      [0.7, -0.4],
    ]) {
      const expected = Math.cos(TAU * (u - v)) + Math.cos(TAU * u) / 4;
      expect(Math.abs(height(u, v) - expected)).toBeLessThanOrEqual(VALUE_TOLERANCE);
      for (const shift of [-2, -1, 1, 2]) {
        expect(Math.abs(height(u + shift, v) - expected)).toBeLessThanOrEqual(VALUE_TOLERANCE);
        expect(Math.abs(height(u, v + shift) - expected)).toBeLessThanOrEqual(VALUE_TOLERANCE);
      }
    }
  });

  it("supports matching finite-difference graph normals across this smooth field's seams", () => {
    for (const [u, v, otherU, otherV] of [
      [0, 0.2, 1, 0.2],
      [0.3, 0, 0.3, 1],
    ]) {
      const expected = graphNormal(...analyticSlopes(u, v));
      const first = graphNormal(...slopes(u, v));
      const second = graphNormal(...slopes(otherU, otherV));
      expectTuple(first, expected, NORMAL_TOLERANCE);
      expectTuple(second, expected, NORMAL_TOLERANCE);
      expectTuple(first, second, NORMAL_TOLERANCE);
    }
  });
});

describe("one-shot field ownership and deterministic execution", () => {
  it("calls the borrowed sampler once per query with no cache or ambient randomness", () => {
    const random = vi.spyOn(Math, "random").mockImplementation(() => {
      throw new Error("ambient randomness forbidden");
    });
    try {
      const field = vi.fn<ScalarField4D>((x, y, z, w) => x - y + z - w);
      const queries = [
        [0.125, -0.25],
        [-0.3, 0.4],
        [0.8, 0.2],
      ] as const;
      const first = queries.map(([u, v]) => sampleToroidalField2D(field, u, v, 3));
      const reversed = [...queries]
        .reverse()
        .map(([u, v]) => sampleToroidalField2D(field, u, v, 3))
        .reverse();
      expect(reversed).toEqual(first);
      expect(field).toHaveBeenCalledTimes(6);
      sampleToroidalField2D(field, queries[0][0], queries[0][1], 3);
      expect(field).toHaveBeenCalledTimes(7);
      expect(random).not.toHaveBeenCalled();
    } finally {
      random.mockRestore();
    }
  });

  it.each([new Error("borrowed sampler stopped"), "borrowed sentinel"])(
    "retains an original callback exception as an operation-context cause",
    (failure) => {
      let caught: unknown;
      try {
        sampleToroidalField2D(
          () => {
            throw failure;
          },
          0.1,
          0.2,
          3,
        );
      } catch (error) {
        caught = error;
      }
      expect(caught).toBeInstanceOf(Error);
      expect((caught as Error).message).toMatch(/sampleToroidalField2D/);
      expect((caught as Error).cause).toBe(failure);
    },
  );
});

describe("toroidal field finite input and output domain", () => {
  it("accepts the inclusive phase caps without claiming exact periodicity there", () => {
    const field = vi.fn(() => 2);
    for (const u of [-PHASE_LIMIT, PHASE_LIMIT])
      for (const v of [-PHASE_LIMIT, PHASE_LIMIT]) {
        expect(sampleToroidalField2D(field, u, v, Number.MAX_VALUE)).toBe(2);
      }
    expect(field).toHaveBeenCalledTimes(4);
    expect(field.mock.calls.flat().every(Number.isFinite)).toBe(true);
  });

  it("allows a represented positive subnormal radius without a hidden minimum scale", () => {
    const circumference = 4 * Number.MIN_VALUE;
    const field = vi.fn(() => 5);
    expect(circumference / TAU).toBe(Number.MIN_VALUE);
    expect(sampleToroidalField2D(field, 0, 0, circumference)).toBe(5);
    expect(field.mock.calls[0]).toEqual([Number.MIN_VALUE, 0, Number.MIN_VALUE, 0]);
  });

  it("rejects invalid phases and circumference before invoking the sampler", () => {
    const field = vi.fn(() => 0);
    for (const invalid of [
      NaN,
      Infinity,
      -Infinity,
      undefined,
      null,
      "0",
      PHASE_LIMIT + 2 ** -31,
      -PHASE_LIMIT - 1,
    ]) {
      expect(() => sampleToroidalField2D(field, invalid as number, 0, 1)).toThrow();
      expect(() => sampleToroidalField2D(field, 0, invalid as number, 1)).toThrow();
    }
    for (const invalid of [
      0,
      -1,
      NaN,
      Infinity,
      -Infinity,
      Number.MIN_VALUE,
      undefined,
      null,
      "1",
    ]) {
      expect(() => sampleToroidalField2D(field, 0, 0, invalid as number)).toThrow();
    }
    expect(field).not.toHaveBeenCalled();
    for (const invalid of [null, undefined, 0, {}, "sampler"]) {
      expect(() => sampleToroidalField2D(invalid as unknown as ScalarField4D, 0, 0, 1)).toThrow();
    }
  });

  it("validates raw callback output after exactly one call", () => {
    for (const value of [NaN, Infinity, -Infinity, undefined, null, "0", {}]) {
      const field = vi.fn(() => value as number);
      expect(() => sampleToroidalField2D(field, 0.2, -0.3, 2)).toThrow();
      expect(field).toHaveBeenCalledTimes(1);
    }
  });
});
