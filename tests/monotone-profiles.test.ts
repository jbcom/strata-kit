import { describe, expect, it } from "vitest";

import { createMonotoneCubicProfile, sampleMonotoneCubicProfile } from "../src/index.ts";
import {
  createMonotoneCubicProfile as createFromSurfaceFields,
  MAX_CUBIC_HERMITE_PROFILE_KNOTS,
  sampleMonotoneCubicProfile as sampleFromSurfaceFields,
  surfaceFieldsGlsl,
} from "../src/surfaceFields.ts";

function expectRelative(actual: number, expected: number, tolerance = 1e-12) {
  expect(Number.isFinite(actual)).toBe(true);
  expect(Math.abs(actual - expected)).toBeLessThanOrEqual(
    Math.abs(expected) * tolerance + Number.MIN_VALUE * 4,
  );
}

describe("monotone cubic profiles", () => {
  it("exposes the same functions through the root and surface-fields entry points", () => {
    expect(typeof createMonotoneCubicProfile).toBe("function");
    expect(typeof sampleMonotoneCubicProfile).toBe("function");
    expect(createFromSurfaceFields).toBe(createMonotoneCubicProfile);
    expect(sampleFromSurfaceFields).toBe(sampleMonotoneCubicProfile);
  });

  it("matches independently derived nonuniform slopes, value, and coordinate derivative", () => {
    const profile = createMonotoneCubicProfile([
      { coordinate: 0, value: 0 },
      { coordinate: 1, value: 1 },
      { coordinate: 3, value: 5 },
    ]);

    expect(profile.domain).toEqual([0, 3]);
    expect(profile.points[0].derivative).toBe(1);
    expect(profile.points[1].derivative).toBeCloseTo(9 / 7, 14);
    expect(profile.points[2].derivative).toBe(2);
    const sample = sampleMonotoneCubicProfile(profile, 0.5);
    expect(sample.value).toBeCloseTo(13 / 28, 14);
    expect(sample.derivative).toBeCloseTo(13 / 14, 14);
  });

  it.each([3, -3, 0])("reproduces an affine function with slope %s on unequal spans", (slope) => {
    const coordinates = [-4, -3.75, 0, 7, 7.5];
    const profile = createMonotoneCubicProfile(
      coordinates.map((coordinate) => ({ coordinate, value: slope * coordinate + 2 })),
    );

    for (const coordinate of [-4, -3.875, -2, 1, 7.125, 7.5]) {
      const sample = sampleMonotoneCubicProfile(profile, coordinate);
      expect(sample.value).toBeCloseTo(slope * coordinate + 2, 12);
      expect(sample.derivative).toBeCloseTo(slope, 12);
    }
  });

  it("returns exact stored values and shared slopes at every knot, in any query order", () => {
    const profile = createMonotoneCubicProfile([
      { coordinate: -2, value: 1e12 },
      { coordinate: -0.1, value: 1e12 + 3 },
      { coordinate: 0.7, value: 1e12 + 9 },
      { coordinate: 11, value: 1e12 - 1 },
    ]);

    for (const index of [3, 1, 0, 2, 1]) {
      const point = profile.points[index];
      expect(sampleMonotoneCubicProfile(profile, point.coordinate)).toEqual({
        value: point.value,
        derivative: point.derivative,
      });
    }
  });

  it("uses secant endpoint slopes at the boundary and zero derivative strictly outside", () => {
    const profile = createMonotoneCubicProfile([
      { coordinate: -2, value: 7 },
      { coordinate: 0, value: 3 },
      { coordinate: 3, value: 6 },
    ]);

    expect(sampleMonotoneCubicProfile(profile, -2)).toEqual({ value: 7, derivative: -2 });
    expect(sampleMonotoneCubicProfile(profile, 3)).toEqual({ value: 6, derivative: 1 });
    for (const coordinate of [-Number.MAX_VALUE, -2.000000000000001]) {
      expect(sampleMonotoneCubicProfile(profile, coordinate)).toEqual({ value: 7, derivative: 0 });
    }
    for (const coordinate of [3.000000000000001, Number.MAX_VALUE]) {
      expect(sampleMonotoneCubicProfile(profile, coordinate)).toEqual({ value: 6, derivative: 0 });
    }
  });

  it("interpolates a two-point profile linearly, including nonzero endpoint derivatives", () => {
    const profile = createMonotoneCubicProfile([
      { coordinate: 2, value: 9 },
      { coordinate: 6, value: -3 },
    ]);
    expect(profile.points.map((point) => point.derivative)).toEqual([-3, -3]);
    expect(sampleMonotoneCubicProfile(profile, 3)).toEqual({ value: 6, derivative: -3 });
    expect(sampleMonotoneCubicProfile(profile, 5)).toEqual({ value: 0, derivative: -3 });
  });

  it("holds plateaus constant and assigns zero slopes at plateaus and local extrema", () => {
    const profile = createMonotoneCubicProfile([
      { coordinate: 0, value: 0 },
      { coordinate: 1, value: 2 },
      { coordinate: 2, value: 2 },
      { coordinate: 3, value: -1 },
      { coordinate: 4, value: 1 },
    ]);
    expect(profile.points.map((point) => point.derivative)).toEqual([2, 0, 0, 0, 2]);
    for (const coordinate of [1, 1.125, 1.5, 1.875, 2]) {
      expect(sampleMonotoneCubicProfile(profile, coordinate)).toEqual({ value: 2, derivative: 0 });
    }
  });

  it("stays within each interval and preserves its direction, even across extrema", () => {
    const profile = createMonotoneCubicProfile([
      { coordinate: -3, value: 1 },
      { coordinate: -2.9, value: 8 },
      { coordinate: 0, value: 8.25 },
      { coordinate: 0.2, value: -4 },
      { coordinate: 8, value: -4 },
      { coordinate: 12, value: 3 },
    ]);
    for (let interval = 0; interval < profile.points.length - 1; interval++) {
      const left = profile.points[interval];
      const right = profile.points[interval + 1];
      const direction = Math.sign(right.value - left.value);
      let previous = left.value;
      for (let step = 1; step <= 64; step++) {
        const coordinate = left.coordinate + ((right.coordinate - left.coordinate) * step) / 64;
        const sample = sampleMonotoneCubicProfile(profile, coordinate);
        expect(Number.isFinite(sample.value)).toBe(true);
        expect(Number.isFinite(sample.derivative)).toBe(true);
        expect(sample.value).toBeGreaterThanOrEqual(Math.min(left.value, right.value) - 1e-12);
        expect(sample.value).toBeLessThanOrEqual(Math.max(left.value, right.value) + 1e-12);
        expect((sample.value - previous) * direction).toBeGreaterThanOrEqual(-1e-12);
        expect(sample.derivative * direction).toBeGreaterThanOrEqual(-1e-12);
        previous = sample.value;
      }
    }
  });

  it("approaches each shared internal derivative from both sides", () => {
    const profile = createMonotoneCubicProfile([
      { coordinate: 0, value: 0 },
      { coordinate: 1, value: 1 },
      { coordinate: 3, value: 5 },
      { coordinate: 4, value: 4 },
      { coordinate: 7, value: 4 },
    ]);
    for (const point of profile.points.slice(1, -1)) {
      for (const sign of [-1, 1]) {
        const near = sampleMonotoneCubicProfile(profile, point.coordinate + sign * 1e-7);
        expect(near.value).toBeCloseTo(point.value, 6);
        expect(near.derivative).toBeCloseTo(point.derivative, 5);
      }
    }
  });

  it.each([1e-310, -1e-310, 1e200, -1e200])(
    "preserves same-sign harmonic slopes without a product or reciprocal overflow at scale %s",
    (scale) => {
      const profile = createMonotoneCubicProfile([
        { coordinate: 0, value: 0 },
        { coordinate: 1, value: scale },
        { coordinate: 3, value: 5 * scale },
      ]);
      expectRelative(profile.points[1].derivative, (scale * 9) / 7);
      const sample = sampleMonotoneCubicProfile(profile, 0.5);
      expectRelative(sample.value, (scale * 13) / 28);
      expectRelative(sample.derivative, (scale * 13) / 14);
    },
  );

  it.each([1e-250, 1e200])("detects a slope sign change at magnitude %s", (scale) => {
    const profile = createMonotoneCubicProfile([
      { coordinate: 0, value: 0 },
      { coordinate: 1, value: scale },
      { coordinate: 2, value: 0 },
    ]);
    expect(profile.points[1].derivative).toBe(0);
  });

  it("normalizes huge nonuniform spans before forming harmonic weights", () => {
    const profile = createMonotoneCubicProfile([
      { coordinate: 0, value: 0 },
      { coordinate: 1e308, value: 1 },
      { coordinate: 1.5e308, value: 2 },
    ]);
    // Secants are 1e-308 and 2e-308; normalized weights are 4/9 and 5/9.
    expectRelative(profile.points[1].derivative, 18e-308 / 13);
    const sample = sampleMonotoneCubicProfile(profile, 5e307);
    expect(Number.isFinite(sample.value)).toBe(true);
    expect(sample.value).toBeGreaterThan(0);
    expect(sample.value).toBeLessThan(1);
    expectRelative(sample.derivative, 47e-308 / 52);
  });

  it("keeps a harmonic slope between finite adjacent secants near the numeric limit", () => {
    const points = [
      { coordinate: 0, value: 0 },
      { coordinate: Number.MIN_VALUE, value: Number.MAX_VALUE * Number.MIN_VALUE },
      { coordinate: 0.5, value: (Number.MAX_VALUE - 2 ** 971) / 2 },
    ];
    const secants = points.slice(1).map((point, index) =>
      (point.value - points[index].value) / (point.coordinate - points[index].coordinate),
    );
    for (const secant of secants) expect(Number.isFinite(secant)).toBe(true);
    const profile = createMonotoneCubicProfile(points);
    for (let index = 1; index < profile.points.length - 1; index++) {
      const derivative = profile.points[index].derivative;
      expect(Number.isFinite(derivative)).toBe(true);
      expect(derivative).toBeGreaterThanOrEqual(Math.min(secants[index - 1], secants[index]));
      expect(derivative).toBeLessThanOrEqual(Math.max(secants[index - 1], secants[index]));
    }

    // On the second interval the final slope is its secant, and the initial
    // slope lies between the two nearly equal secants. Its midpoint derivative
    // is secant - (initialSlope - secant) / 4, which is positive and finite.
    const midpoint = sampleMonotoneCubicProfile(profile, 0.25);
    expect(Number.isFinite(midpoint.value)).toBe(true);
    expect(Number.isFinite(midpoint.derivative)).toBe(true);
    expect(midpoint.value).toBeGreaterThanOrEqual(points[1].value);
    expect(midpoint.value).toBeLessThanOrEqual(points[2].value);
    expect(midpoint.derivative).toBeGreaterThan(0);
  });

  it("owns and deeply freezes all compiled data while leaving the input mutable", () => {
    const input = [
      { coordinate: 0, value: 0 },
      { coordinate: 1, value: 1 },
      { coordinate: 3, value: 5 },
    ];
    const profile = createMonotoneCubicProfile(input);
    input[1].coordinate = 100;
    input[1].value = -99;
    input.push({ coordinate: 10, value: 20 });

    expect(Object.isFrozen(input)).toBe(false);
    expect(Object.isFrozen(profile)).toBe(true);
    expect(Object.isFrozen(profile.domain)).toBe(true);
    expect(Object.isFrozen(profile.points)).toBe(true);
    for (const point of profile.points) expect(Object.isFrozen(point)).toBe(true);
    expect(Reflect.set(profile.domain, 0, -100)).toBe(false);
    expect(Reflect.set(profile.points[1], "value", 99)).toBe(false);
    expect(Reflect.set(profile.points, 0, input[0])).toBe(false);
    expect(profile.domain).toEqual([0, 3]);
    expect(profile.points).toHaveLength(3);
    const sample = sampleMonotoneCubicProfile(profile, 1);
    expect(sample.value).toBe(1);
    expect(sample.derivative).toBeCloseTo(9 / 7, 14);
  });

  it("supports more than eight CPU points without widening the bounded GLSL profile", () => {
    const profile = createMonotoneCubicProfile(
      Array.from({ length: 9 }, (_, coordinate) => ({ coordinate, value: 2 * coordinate - 3 })),
    );
    expect(profile.points).toHaveLength(9);
    expect(sampleMonotoneCubicProfile(profile, 7.5)).toEqual({ value: 12, derivative: 2 });
    expect(MAX_CUBIC_HERMITE_PROFILE_KNOTS).toBe(8);
    expect(surfaceFieldsGlsl).toContain("const int STRATA_KIT_MAX_PROFILE_KNOTS = 8;");
  });

  it.each([{ points: [] }, { points: [{ coordinate: 0, value: 0 }] }])(
    "rejects fewer than two points",
    ({ points }) => {
      expect(() => createMonotoneCubicProfile(points)).toThrow();
    },
  );

  it("rejects over-budget input before reading or allocating its points", () => {
    let readEntry = false;
    const overBudget = new Proxy([], {
      get(_target, property) {
        if (property === "length") return 65_537;
        readEntry = true;
        throw new Error("Entries must not be read before the resource bound is checked");
      },
    });
    expect(() => createMonotoneCubicProfile(overBudget)).toThrow();
    expect(readEntry).toBe(false);
  });

  it.each([Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY, "1", null, undefined])(
    "rejects a nonfinite or nonnumeric point scalar %s",
    (invalid) => {
      expect(() =>
        createMonotoneCubicProfile([
          { coordinate: 0, value: 0 },
          { coordinate: invalid as never, value: 1 },
        ]),
      ).toThrow();
      expect(() =>
        createMonotoneCubicProfile([
          { coordinate: 0, value: 0 },
          { coordinate: 1, value: invalid as never },
        ]),
      ).toThrow();
    },
  );

  it.each(
    [
      [
        { coordinate: 0, value: 0 },
        { coordinate: 0, value: 1 },
      ],
      [
        { coordinate: 1, value: 0 },
        { coordinate: 0, value: 1 },
      ],
      [
        { coordinate: -Number.MAX_VALUE, value: 0 },
        { coordinate: Number.MAX_VALUE, value: 1 },
      ],
      [
        { coordinate: 0, value: -Number.MAX_VALUE },
        { coordinate: 1, value: Number.MAX_VALUE },
      ],
      [
        { coordinate: 0, value: 0 },
        { coordinate: Number.MIN_VALUE, value: 1 },
      ],
      [
        { coordinate: 0, value: 0 },
        { coordinate: 1e200, value: 1e-200 },
      ],
      [
        { coordinate: 0, value: 0 },
        { coordinate: 1e200, value: -1e-200 },
      ],
    ].map((points) => ({ points })),
  )(
    "rejects unordered points or unrepresentable spans, differences, and secants: %j",
    ({ points }) => {
      expect(() => createMonotoneCubicProfile(points)).toThrow();
    },
  );

  it.each([Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY, "0.5", null, undefined])(
    "rejects a nonfinite or nonnumeric sample coordinate %s",
    (coordinate) => {
      const profile = createMonotoneCubicProfile([
        { coordinate: 0, value: 0 },
        { coordinate: 1, value: 1 },
      ]);
      expect(() => sampleMonotoneCubicProfile(profile, coordinate as never)).toThrow();
    },
  );
});
