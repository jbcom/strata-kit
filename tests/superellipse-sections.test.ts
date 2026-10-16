import { describe, expect, it } from "vitest";
import {
  superellipseHalfDepth2D,
  superellipsePoint2D,
  type SuperellipseSection2D,
} from "../src/index.ts";
import {
  superellipseHalfDepth2D as halfDepthFromMesh,
  superellipsePoint2D as pointFromMesh,
  type SuperellipseSection2D as SectionFromMesh,
} from "../src/mesh.ts";

function expectRelative(actual: number, expected: number, tolerance = 1e-12) {
  expect(Number.isFinite(actual)).toBe(true);
  expect(Math.abs(actual - expected)).toBeLessThanOrEqual(
    Math.abs(expected) * tolerance + Number.MIN_VALUE,
  );
}

describe("signed-power superellipse sections", () => {
  it("exports callable samplers and the section type from root and mesh", () => {
    expect(typeof superellipsePoint2D).toBe("function");
    expect(typeof superellipseHalfDepth2D).toBe("function");
    expect(pointFromMesh).toBe(superellipsePoint2D);
    expect(halfDepthFromMesh).toBe(superellipseHalfDepth2D);
    const section: SuperellipseSection2D = { halfWidth: 2, halfDepth: 3, power: 4 };
    const meshSection: SectionFromMesh = section;
    expect(superellipsePoint2D(meshSection, 0)).toEqual([2, 0]);
  });

  it.each([2, 4, 6, 64, Number.MAX_VALUE])(
    "returns exact represented cardinal axis points with positive zeros at power %s",
    (power) => {
      const section = { halfWidth: 3, halfDepth: 7, power };
      const cardinals: readonly (readonly [number, readonly [number, number]])[] = [
        [0, [3, 0]],
        [-0, [3, 0]],
        [Math.PI / 2, [0, 7]],
        [-Math.PI / 2, [0, -7]],
        [Math.PI, [-3, 0]],
        [-Math.PI, [-3, 0]],
        [(3 * Math.PI) / 2, [0, -7]],
        [(-3 * Math.PI) / 2, [0, 7]],
        [2 * Math.PI, [3, 0]],
        [-2 * Math.PI, [3, 0]],
      ];
      for (const [angle, expected] of cardinals) {
        const point = superellipsePoint2D(section, angle);
        expect(point).toEqual(expected);
        for (let axis = 0; axis < 2; axis++) {
          if (expected[axis] === 0) expect(Object.is(point[axis], 0)).toBe(true);
        }
      }
    },
  );

  it("uses the eccentric ellipse parameter on asymmetric axes, with a 3-4-5 triangle witness", () => {
    const section = { halfWidth: 10, halfDepth: 5, power: 2 };
    const point = superellipsePoint2D(section, Math.atan2(4, 3));
    expect(point[0]).toBeCloseTo(6, 13);
    expect(point[1]).toBeCloseTo(4, 13);
    expect(point[1] / point[0]).toBeCloseTo(2 / 3, 13);
    expect(Math.abs(point[1] / point[0] - 4 / 3)).toBeGreaterThan(0.5);
  });

  it("passes the fourth-power diagonal and implicit-locus equations", () => {
    const section = { halfWidth: 2, halfDepth: 7, power: 4 };
    const diagonal = superellipsePoint2D(section, Math.PI / 4);
    // A diagonal normalized coordinate satisfies 2*q^4 = 1.
    const diagonalCoordinate = 0.8408964152537145;
    expect(diagonal[0]).toBeCloseTo(2 * diagonalCoordinate, 13);
    expect(diagonal[1]).toBeCloseTo(7 * diagonalCoordinate, 13);
    for (const angle of [-5.7, -2.3, -0.4, 0.2, 1.1, 2.8, 4.9, 6.1]) {
      const [first, second] = superellipsePoint2D(section, angle);
      expect((first / 2) ** 4 + (second / 7) ** 4).toBeCloseTo(1, 13);
    }
  });

  it("preserves the quadrant signs and reflected section symmetry", () => {
    const section = { halfWidth: 4, halfDepth: 9, power: 6 };
    const point = superellipsePoint2D(section, 0.37);
    const reflected = superellipsePoint2D(section, -0.37);
    expect(point[0]).toBeGreaterThan(0);
    expect(point[1]).toBeGreaterThan(0);
    expectRelative(reflected[0], point[0]);
    expectRelative(reflected[1], -point[1]);
    for (const [angle, firstSign, secondSign] of [
      [0.7, 1, 1],
      [2.1, -1, 1],
      [3.8, -1, -1],
      [5.3, 1, -1],
    ]) {
      const [first, second] = superellipsePoint2D(section, angle);
      expect(Math.sign(first)).toBe(firstSign);
      expect(Math.sign(second)).toBe(secondSign);
    }
  });

  it("retains tiny signed angles rather than snapping them to an axis or losing their sign at the seam", () => {
    const section = { halfWidth: 1, halfDepth: 1, power: 4 };
    const positive = superellipsePoint2D(section, 1e-200);
    const negative = superellipsePoint2D(section, -1e-200);
    expectRelative(positive[1], 1e-100);
    expectRelative(negative[1], -1e-100);
    expect(positive[0]).toBe(1);
    expect(negative[0]).toBe(1);

    const offset = 2 ** -48;
    const before = superellipsePoint2D(section, 2 * Math.PI - offset);
    const after = superellipsePoint2D(section, 2 * Math.PI + offset);
    expect(before[1]).toBeLessThan(0);
    expect(after[1]).toBeGreaterThan(0);
    expect(before[0]).toBeCloseTo(1, 13);
    expect(after[0]).toBeCloseTo(1, 13);
    const axisBefore = superellipsePoint2D(section, Math.PI / 2 - offset);
    const axisAfter = superellipsePoint2D(section, Math.PI / 2 + offset);
    expect(axisBefore[0]).toBeGreaterThan(0);
    expect(axisAfter[0]).toBeLessThan(0);
  });

  it("preserves the smallest represented signed angular offsets for an ellipse", () => {
    const section = { halfWidth: 1, halfDepth: 1, power: 2 };
    expect(superellipsePoint2D(section, Number.MIN_VALUE)).toEqual([1, Number.MIN_VALUE]);
    expect(superellipsePoint2D(section, -Number.MIN_VALUE)).toEqual([1, -Number.MIN_VALUE]);
  });

  it.each([1e20, -1e20, Number.MAX_VALUE, -Number.MAX_VALUE])(
    "keeps finite bounded coordinates for a large represented angle %s",
    (angle) => {
      const [first, second] = superellipsePoint2D({ halfWidth: 3, halfDepth: 7, power: 4 }, angle);
      expect(Number.isFinite(first)).toBe(true);
      expect(Number.isFinite(second)).toBe(true);
      expect(Math.abs(first)).toBeLessThanOrEqual(3);
      expect(Math.abs(second)).toBeLessThanOrEqual(7);
      expect((first / 3) ** 4 + (second / 7) ** 4).toBeCloseTo(1, 12);
    },
  );

  it.each([Number.MIN_VALUE, Number.MAX_VALUE])(
    "accepts the positive finite extent %s without a hidden minimum or overflow",
    (extent) => {
      const section = { halfWidth: extent, halfDepth: extent, power: 2 };
      expect(superellipsePoint2D(section, 0)).toEqual([extent, 0]);
      expect(superellipsePoint2D(section, Math.PI / 2)).toEqual([0, extent]);
      expect(superellipseHalfDepth2D(section, 0)).toBe(extent);
      const point = superellipsePoint2D(section, Math.PI / 4);
      for (const value of point) {
        expect(Number.isFinite(value)).toBe(true);
        expect(value).toBeGreaterThanOrEqual(0);
        expect(value).toBeLessThanOrEqual(extent);
      }
    },
  );

  it("permits final subnormal products to round to zero", () => {
    const section = { halfWidth: 1, halfDepth: Number.MIN_VALUE, power: 2 };
    expect(superellipsePoint2D(section, 1e-200)).toEqual([1, 0]);
    expect(superellipseHalfDepth2D(section, 1 - Number.EPSILON / 2)).toBe(0);
  });

  it("returns fresh tuples while leaving borrowed section data untouched", () => {
    const section = Object.freeze({ halfWidth: 2, halfDepth: 3, power: 4 });
    const first = superellipsePoint2D(section, 0.4);
    const second = superellipsePoint2D(section, 0.4);
    expect(first).not.toBe(second);
    expect(first).toEqual(second);
    superellipseHalfDepth2D(section, 1);
    expect(section).toEqual({ halfWidth: 2, halfDepth: 3, power: 4 });
  });
});

describe("superellipse half-depth inverse", () => {
  it("returns the center depth and zero at or beyond either first-axis boundary", () => {
    const section = { halfWidth: 2, halfDepth: 7, power: 4 };
    for (const coordinate of [0, -0]) {
      expect(superellipseHalfDepth2D(section, coordinate)).toBe(7);
    }
    for (const coordinate of [-Number.MAX_VALUE, -3, -2, 2, 3, Number.MAX_VALUE]) {
      const depth = superellipseHalfDepth2D(section, coordinate);
      expect(depth).toBe(0);
      expect(Object.is(depth, 0)).toBe(true);
    }
  });

  it("matches independent ellipse and fourth-power section answers with even symmetry", () => {
    const ellipse = { halfWidth: 5, halfDepth: 10, power: 2 };
    for (const coordinate of [-3, 3]) {
      expect(superellipseHalfDepth2D(ellipse, coordinate)).toBeCloseTo(8, 13);
    }
    const quartic = { halfWidth: 8, halfDepth: 3, power: 4 };
    const expected = 3 * Math.sqrt(Math.sqrt(15 / 16));
    for (const coordinate of [-4, 4]) {
      expect(superellipseHalfDepth2D(quartic, coordinate)).toBeCloseTo(expected, 13);
    }
  });

  it.each([1e-250, 1, Number.MAX_VALUE])(
    "preserves a represented gap just inside the first-axis extent %s",
    (halfWidth) => {
      const gap = halfWidth === Number.MAX_VALUE ? 2 ** 971 : (halfWidth * Number.EPSILON) / 2;
      const coordinate = halfWidth - gap;
      const section = { halfWidth, halfDepth: 3, power: 2 };
      // Factor the ellipse equation: 1 - (x/a)^2 = ((a-x)/a)*(1+x/a).
      const expected =
        3 * Math.sqrt(((halfWidth - coordinate) / halfWidth) * (1 + coordinate / halfWidth));
      const depth = superellipseHalfDepth2D(section, coordinate);
      expect(depth).toBeGreaterThan(0);
      expectRelative(depth, expected);
      expectRelative(superellipseHalfDepth2D(section, -coordinate), expected);
    },
  );

  it("does not promise inverse recovery when high powers round a first coordinate to its axis", () => {
    const section = { halfWidth: 1, halfDepth: 2, power: 64 };
    const [first, second] = superellipsePoint2D(section, 1e-12);
    expect(first).toBe(1);
    expect(second).toBeGreaterThan(0);
    expect(superellipseHalfDepth2D(section, first)).toBe(0);
  });

  it.each([2, 2.5, 4, 6])(
    "agrees with section points away from ill-conditioned corners at power %s",
    (power) => {
      const section = { halfWidth: 2, halfDepth: 3, power };
      let previousDepth = section.halfDepth;
      for (const coordinate of [0, 0.25, 0.75, 1.25, 1.75, 2]) {
        const depth = superellipseHalfDepth2D(section, coordinate);
        expect(depth).toBeGreaterThanOrEqual(0);
        expect(depth).toBeLessThanOrEqual(previousDepth);
        previousDepth = depth;
      }
      for (const angle of [-0.9, -0.4, 0.2, 0.6, 1.1]) {
        const [first, second] = superellipsePoint2D(section, angle);
        expectRelative(superellipseHalfDepth2D(section, first), Math.abs(second));
        expect((Math.abs(first) / 2) ** power + (Math.abs(second) / 3) ** power).toBeCloseTo(1, 12);
      }
    },
  );

  it("safely saturates an overflowing negative logarithmic product or rounded central gap", () => {
    expect(
      superellipseHalfDepth2D({ halfWidth: 2, halfDepth: 3, power: Number.MAX_VALUE }, 0.25),
    ).toBe(3);
    expect(
      superellipseHalfDepth2D({ halfWidth: 1, halfDepth: 3, power: 2 }, Number.MIN_VALUE),
    ).toBe(3);
  });

  it("supports finite powers through the numeric limit without overflowing an interior inverse", () => {
    const section = { halfWidth: 2, halfDepth: 3, power: Number.MAX_VALUE };
    const depth = superellipseHalfDepth2D(section, 1);
    expect(Number.isFinite(depth)).toBe(true);
    expect(depth).toBe(3);
  });
});

describe("superellipse section validation", () => {
  it.each(["halfWidth", "halfDepth"] as const)("requires a positive finite %s", (axis) => {
    for (const invalid of [0, -0, -1, Number.NaN, Infinity, -Infinity, "1", null, undefined]) {
      const section = { halfWidth: 2, halfDepth: 3, power: 4, [axis]: invalid };
      expect(() => superellipsePoint2D(section as never, 0.4)).toThrow();
      expect(() => superellipsePoint2D(section as never, 0)).toThrow();
      expect(() => superellipseHalfDepth2D(section as never, 1)).toThrow();
      expect(() => superellipseHalfDepth2D(section as never, 0)).toThrow();
      expect(() => superellipseHalfDepth2D(section as never, Number.MAX_VALUE)).toThrow();
    }
  });

  it("requires a finite power of at least two", () => {
    for (const power of [
      -1,
      0,
      1,
      2 - Number.EPSILON,
      Number.NaN,
      Infinity,
      -Infinity,
      "4",
      null,
      undefined,
    ]) {
      const section = { halfWidth: 2, halfDepth: 3, power };
      expect(() => superellipsePoint2D(section as never, 0.4)).toThrow();
      expect(() => superellipsePoint2D(section as never, 0)).toThrow();
      expect(() => superellipseHalfDepth2D(section as never, 1)).toThrow();
      expect(() => superellipseHalfDepth2D(section as never, 0)).toThrow();
      expect(() => superellipseHalfDepth2D(section as never, Number.MAX_VALUE)).toThrow();
    }
  });

  it("requires finite numeric angles and inverse coordinates", () => {
    const section = { halfWidth: 2, halfDepth: 3, power: 4 };
    for (const invalid of [Number.NaN, Infinity, -Infinity, "0", null, undefined]) {
      expect(() => superellipsePoint2D(section, invalid as never)).toThrow();
      expect(() => superellipseHalfDepth2D(section, invalid as never)).toThrow();
    }
  });
});
