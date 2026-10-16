import { describe, expect, it } from "vitest";
import {
  projectPixelFootprint2D,
  sampleBandCoverage,
  sampleSegment2D,
} from "../src/segmentCoverage.ts";

type Point2D = readonly [number, number];

function expectRelative(actual: number, expected: number): void {
  if (expected === 0) expect(actual).toBe(0);
  else expect(actual / expected).toBeCloseTo(1, 12);
}

function expectPoint(actual: Point2D, expected: Point2D): void {
  expectRelative(actual[0], expected[0]);
  expectRelative(actual[1], expected[1]);
}

describe("finite 2D segment sampling", () => {
  it("projects an interior point onto an axis and reports physical arc distance", () => {
    const result = sampleSegment2D([5, 7], [2, 3], [10, 3]);
    expect(result).toEqual({
      nearest: [5, 3],
      tangent: [1, 0],
      t: 3 / 8,
      distance: 4,
      length: 8,
      along: 3,
    });
  });

  it("uses a 3-4-5 diagonal independently of the point's normal offset", () => {
    // The point is the midpoint plus the unit normal (-4/5,3/5) times five.
    const result = sampleSegment2D([-1, 7], [0, 0], [6, 8]);
    expectPoint(result.nearest, [3, 4]);
    expectPoint(result.tangent, [3 / 5, 4 / 5]);
    expectRelative(result.t, 0.5);
    expectRelative(result.distance, 5);
    expectRelative(result.length, 10);
    expectRelative(result.along, 5);
  });

  it.each([
    { point: [-4, 7] as Point2D, nearest: [2, 3] as Point2D, t: 0, distance: Math.sqrt(52) },
    { point: [14, 6] as Point2D, nearest: [10, 3] as Point2D, t: 1, distance: 5 },
  ])("clamps endpoint projection for $point", ({ point, nearest, t, distance }) => {
    const result = sampleSegment2D(point, [2, 3], [10, 3]);
    expect(result.nearest).toEqual(nearest);
    expect(result.t).toBe(t);
    expect(result.along).toBe(t * 8);
    expectRelative(result.distance, distance);
  });

  it("returns exact endpoint values even when normalization is inexact", () => {
    const start: Point2D = [0.1, 0.2];
    const end: Point2D = [3.3, 4.7];
    for (const [point, t] of [
      [start, 0],
      [end, 1],
    ] as const) {
      const result = sampleSegment2D(point, start, end);
      expect(result.nearest).toEqual(point);
      expect(result.distance).toBe(0);
      expect(result.t).toBe(t);
      expect(result.along).toBe(t === 0 ? 0 : result.length);
    }
  });

  it("treats a coincident segment as a point with unsigned distance", () => {
    const start: Point2D = [2, -3];
    const result = sampleSegment2D([-1, 1], start, start);
    expect(result).toEqual({
      nearest: [2, -3],
      tangent: [0, 0],
      t: 0,
      distance: 5,
      length: 0,
      along: 0,
    });
    expect(result.nearest).not.toBe(start);
    expect(sampleSegment2D(start, start, start).distance).toBe(0);
  });

  it.each([1e-200, 1e-20, 1e150, 1e200])(
    "preserves a genuine nonzero segment at scale %s",
    (scale) => {
      const result = sampleSegment2D([3 * scale, 9 * scale], [0, 0], [6 * scale, 8 * scale]);
      expectPoint(result.tangent, [0.6, 0.8]);
      expectRelative(result.length, 10 * scale);
      expectRelative(result.along, 9 * scale);
      expectRelative(result.t, 0.9);
      expectPoint(result.nearest, [5.4 * scale, 7.2 * scale]);
      expectRelative(result.distance, 3 * scale);
    },
  );

  it("reverses tangent and arc coordinates while preserving geometric projection", () => {
    const forward = sampleSegment2D([4, 1], [1, -2], [7, 6]);
    const reverse = sampleSegment2D([4, 1], [7, 6], [1, -2]);
    expectPoint(reverse.nearest, forward.nearest);
    expectRelative(reverse.distance, forward.distance);
    expectRelative(reverse.length, forward.length);
    expectRelative(reverse.t, 1 - forward.t);
    expectRelative(reverse.along, forward.length - forward.along);
    expectPoint(reverse.tangent, [-forward.tangent[0], -forward.tangent[1]]);
  });

  it("is translation invariant and covariant under positive uniform scaling", () => {
    const base = sampleSegment2D([4, 1], [1, -2], [7, 6]);
    const moved = sampleSegment2D([104, -49], [101, -52], [107, -44]);
    expectPoint(moved.nearest, [base.nearest[0] + 100, base.nearest[1] - 50]);
    expectPoint(moved.tangent, base.tangent);
    expectRelative(moved.t, base.t);
    expectRelative(moved.distance, base.distance);
    expectRelative(moved.length, base.length);
    expectRelative(moved.along, base.along);
    const scaled = sampleSegment2D([28, 7], [7, -14], [49, 42]);
    expectPoint(scaled.nearest, [base.nearest[0] * 7, base.nearest[1] * 7]);
    expectPoint(scaled.tangent, base.tangent);
    expectRelative(scaled.t, base.t);
    expectRelative(scaled.distance, base.distance * 7);
    expectRelative(scaled.length, base.length * 7);
    expectRelative(scaled.along, base.along * 7);
  });

  it("does not mutate inputs or share returned coordinate arrays", () => {
    const point = Object.freeze([5, 7] as const);
    const start = Object.freeze([2, 3] as const);
    const end = Object.freeze([10, 3] as const);
    const first = sampleSegment2D(point, start, end);
    const second = sampleSegment2D(point, start, end);
    expect(point).toEqual([5, 7]);
    expect(start).toEqual([2, 3]);
    expect(end).toEqual([10, 3]);
    expect(first).not.toBe(second);
    expect(first.nearest).not.toBe(second.nearest);
    expect(first.tangent).not.toBe(second.tangent);
    expect(first.nearest).not.toBe(start);
    expect(first.nearest).not.toBe(end);
    expect(first.nearest).not.toBe(first.tangent);
  });

  it("rejects malformed/nonfinite coordinates and nonfinite derived geometry", () => {
    const invalid = [null, undefined, [], [0], [0, 1, 2], [NaN, 0], [0, Infinity], ["0", 0], {}];
    for (const value of invalid) {
      const input = value as unknown as Point2D;
      expect(() => sampleSegment2D(input, [0, 0], [1, 0])).toThrow();
      expect(() => sampleSegment2D([0, 0], input, [1, 0])).toThrow();
      expect(() => sampleSegment2D([0, 0], [1, 0], input)).toThrow();
    }
    const largest = Number.MAX_VALUE;
    expect(() => sampleSegment2D([0, 0], [-largest, 0], [largest, 0])).toThrow();
    expect(() => sampleSegment2D([-largest, 0], [largest, 0], [largest, 1])).toThrow();
    expect(() => sampleSegment2D([largest, largest], [0, 0], [0, 0])).toThrow();
    expect(() => sampleSegment2D([largest, largest], [0, 0], [1, 1])).toThrow();
    expect(() => sampleSegment2D([0, 0], [0, 0], [largest, largest])).toThrow();
  });
});

describe("2D pixel footprint projection", () => {
  it("projects an anisotropic pixel onto normalized axes and a 3-4-5 direction", () => {
    expect(projectPixelFootprint2D([1, 0], [2, 0], [0, 3])).toBe(2);
    expect(projectPixelFootprint2D([0, 1], [2, 0], [0, 3])).toBe(3);
    expectRelative(projectPixelFootprint2D([3, 4], [2, 0], [0, 3]), 3.6);
    expectRelative(projectPixelFootprint2D([30, 40], [2, 0], [0, 3]), 3.6);
    expectRelative(projectPixelFootprint2D([-3, -4], [2, 0], [0, 3]), 3.6);
  });

  it("adds absolute contributions rather than cancelling opposing pixel vectors", () => {
    expect(projectPixelFootprint2D([1, 0], [2, 0], [-3, 1])).toBe(5);
    expect(projectPixelFootprint2D([0, 1], [2, 0], [-3, 1])).toBe(1);
  });

  it("uses the longest full pixel diagonal for a zero direction", () => {
    expect(projectPixelFootprint2D([0, 0], [3, 0], [0, 4])).toBe(5);
    expectRelative(projectPixelFootprint2D([0, 0], [2, 0], [1, 1]), Math.sqrt(10));
    expectRelative(projectPixelFootprint2D([0, 0], [2, 0], [-1, -1]), Math.sqrt(10));
    expect(projectPixelFootprint2D([0, 0], [0, 0], [0, 0])).toBe(0);
  });

  it.each([1e-200, 1e-20, 1e150, 1e200])(
    "scales pixel lengths without introducing a direction epsilon at %s",
    (s) => {
      expectRelative(projectPixelFootprint2D([3 * s, 4 * s], [2 * s, 0], [0, 3 * s]), 3.6 * s);
      expectRelative(projectPixelFootprint2D([0, 0], [3 * s, 0], [0, 4 * s]), 5 * s);
    },
  );

  it("preserves frozen vector inputs and rejects malformed or nonfinite results", () => {
    const direction = Object.freeze([3, 4] as const);
    const dx = Object.freeze([2, 0] as const);
    const dy = Object.freeze([0, 3] as const);
    projectPixelFootprint2D(direction, dx, dy);
    expect(direction).toEqual([3, 4]);
    expect(dx).toEqual([2, 0]);
    expect(dy).toEqual([0, 3]);
    for (const value of [null, [], [1], [1, 2, 3], [Infinity, 0], [0, NaN], [0, "1"]]) {
      const input = value as unknown as Point2D;
      expect(() => projectPixelFootprint2D(input, dx, dy)).toThrow();
      expect(() => projectPixelFootprint2D(direction, input, dy)).toThrow();
      expect(() => projectPixelFootprint2D(direction, dx, input)).toThrow();
    }
    const largest = Number.MAX_VALUE;
    expect(() => projectPixelFootprint2D([1, 0], [largest, 0], [largest, 0])).toThrow();
    expect(() => projectPixelFootprint2D([0, 0], [largest, 0], [largest, 0])).toThrow();
    expect(() => projectPixelFootprint2D([0, 0], [largest, 0], [-largest, 0])).toThrow();
    expect(() => projectPixelFootprint2D([1, 1], [largest, largest], [0, 0])).toThrow();
  });
});

describe("analytic band coverage", () => {
  it("matches hand-computed cubic edge values for a resolved band", () => {
    for (const [distance, edge] of [
      [0, 1],
      [1, 1],
      [1.5, 27 / 32],
      [2, 1 / 2],
      [2.5, 5 / 32],
      [3, 0],
    ]) {
      const result = sampleBandCoverage(distance, 2, 1);
      expect(result).toEqual({
        effectiveHalfWidth: 2,
        edgeCoverage: edge,
        widthCoverage: 1,
        coverage: edge,
      });
    }
  });

  it("gives exact hard-edge interior, boundary, and exterior values with no feather", () => {
    expect(sampleBandCoverage(1, 2, 0).edgeCoverage).toBe(1);
    expect(sampleBandCoverage(2, 2, 0).edgeCoverage).toBe(0.5);
    expect(sampleBandCoverage(3, 2, 0).edgeCoverage).toBe(0);
    expect(sampleBandCoverage(2, 2, 0, 0)).toEqual(sampleBandCoverage(2, 2, 0));
  });

  it("widens subpixel geometry while conserving the authored width factor", () => {
    expect(sampleBandCoverage(0, 0.5, 0, 2)).toEqual({
      effectiveHalfWidth: 1,
      edgeCoverage: 1,
      widthCoverage: 0.5,
      coverage: 0.5,
    });
    expect(sampleBandCoverage(1, 0.5, 0, 2).coverage).toBe(0.25);
    expect(sampleBandCoverage(2, 0.5, 0, 2).coverage).toBe(0);
    // For a unit half-width and unit feather, the even cubic edge has area two.
    // A width factor of one half preserves the original full width of one.
    const samples = [0, 0.5, 1, 1.5, 2].map(
      (distance) => sampleBandCoverage(distance, 0.5, 0, 2).coverage,
    );
    const area =
      ((2 * 0.5) / 3) *
      (samples[0] + 4 * samples[1] + 2 * samples[2] + 4 * samples[3] + samples[4]);
    expectRelative(area, 1);
  });

  it("lets arbitrarily thin and zero authored widths vanish without a visibility floor", () => {
    for (const width of [0.25, 1e-8, 1e-20]) {
      const result = sampleBandCoverage(0, width, 0, 2);
      expectRelative(result.coverage, width);
      expectRelative(result.widthCoverage, width);
    }
    for (const footprint of [0, 1, 100]) {
      for (const feather of [0, 1]) {
        for (const distance of [0, 0.5, 100]) {
          expect(sampleBandCoverage(distance, 0, feather, footprint).coverage).toBe(0);
        }
      }
    }
  });

  it("keeps feather independent of authored width and selects the larger pixel feather", () => {
    expectRelative(sampleBandCoverage(0, 0.5, 2).edgeCoverage, 175 / 256);
    const featherWins = sampleBandCoverage(3, 2, 2, 2);
    expect(featherWins.effectiveHalfWidth).toBe(2);
    expect(featherWins.widthCoverage).toBe(1);
    expect(featherWins.edgeCoverage).toBe(5 / 32);
    const footprintWins = sampleBandCoverage(2, 1, 0.25, 4);
    expect(footprintWins.effectiveHalfWidth).toBe(2);
    expect(footprintWins.widthCoverage).toBe(0.5);
    expect(footprintWins.edgeCoverage).toBe(0.5);
    expect(footprintWins.coverage).toBe(0.25);
  });

  it("remains bounded and nonincreasing with unsigned distance across both thresholds", () => {
    for (const [width, feather, footprint] of [
      [2, 1, 0],
      [0.25, 0, 2],
      [0, 1, 2],
      [1, 3, 0],
    ]) {
      let previous = 1;
      for (let step = 0; step <= 160; step++) {
        const result = sampleBandCoverage(step / 16, width, feather, footprint);
        expect(result.edgeCoverage).toBeGreaterThanOrEqual(0);
        expect(result.edgeCoverage).toBeLessThanOrEqual(1);
        expect(result.widthCoverage).toBeGreaterThanOrEqual(0);
        expect(result.widthCoverage).toBeLessThanOrEqual(1);
        expect(result.coverage).toBeGreaterThanOrEqual(0);
        expect(result.coverage).toBeLessThanOrEqual(previous);
        previous = result.coverage;
      }
    }
    const delta = 2 ** -20;
    expect(sampleBandCoverage(1 + delta, 2, 1).coverage).toBeGreaterThan(1 - 1e-10);
    expect(sampleBandCoverage(3 - delta, 2, 1).coverage).toBeLessThan(1e-10);
    expect(sampleBandCoverage(1 - delta, 2, 1).coverage).toBe(1);
    expect(sampleBandCoverage(3 + delta, 2, 1).coverage).toBe(0);
  });

  it.each([1e-200, 1e-20, 1e150, 1e200])(
    "is unchanged by uniform distance scaling at %s",
    (scale) => {
      const base = sampleBandCoverage(1.5, 0.5, 0.25, 2);
      const result = sampleBandCoverage(1.5 * scale, 0.5 * scale, 0.25 * scale, 2 * scale);
      expectRelative(result.effectiveHalfWidth, base.effectiveHalfWidth * scale);
      expectRelative(result.edgeCoverage, base.edgeCoverage);
      expectRelative(result.widthCoverage, base.widthCoverage);
      expectRelative(result.coverage, base.coverage);
    },
  );

  it("returns fresh samples and rejects every negative or nonfinite scalar input", () => {
    expect(sampleBandCoverage(1, 2, 3, 4)).not.toBe(sampleBandCoverage(1, 2, 3, 4));
    for (const value of [-1, -Number.MIN_VALUE, NaN, Infinity, -Infinity, "1", null, undefined]) {
      const invalid = value as unknown as number;
      expect(() => sampleBandCoverage(invalid, 1, 1, 1)).toThrow();
      expect(() => sampleBandCoverage(1, invalid, 1, 1)).toThrow();
      expect(() => sampleBandCoverage(1, 1, invalid, 1)).toThrow();
      if (value !== undefined) expect(() => sampleBandCoverage(1, 1, 1, invalid)).toThrow();
    }
  });
});
