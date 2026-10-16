import { describe, expect, it, vi } from "vitest";
import {
  createJitteredCellField2D,
  createSeededNoise,
  type JitteredCellField2DOptions,
  type JitteredCellSample2D,
  type LatticeSiteSampler2D,
} from "../src/index.ts";
import { createJitteredCellField2D as createFromNoise } from "../src/noise.ts";

type Site = { ix: number; iz: number; distance: number };
const patternedSite: LatticeSiteSampler2D = (ix, iz) => [
  ((((37 * ix + 19 * iz) % 17) + 17) % 17) / 16,
  ((((11 * ix - 23 * iz) % 17) + 17) % 17) / 16,
];

// This oracle constructs positions directly in normalized space and enumerates
// a much wider square. For all admitted jitter, an excluded cell is at least
// 8+(1-jitter)/2 away on one axis, while two candidates exist within sqrt(3.25).
// Tiny/local-precision cases have separate analytic answers below so this
// straightforward world-position oracle cannot repeat a local subtraction bug.
function referencePosition(ix: number, iz: number, site: LatticeSiteSampler2D, jitter: number) {
  const [u, v] = site(ix, iz);
  return [ix + (1 - jitter) / 2 + jitter * u, iz + (1 - jitter) / 2 + jitter * v];
}

function widerOracle(x: number, z: number, site: LatticeSiteSampler2D, jitter = 1, cellSize = 1) {
  const qx = x / cellSize;
  const qz = z / cellSize;
  const candidates: Site[] = [];
  for (let iz = Math.floor(qz) - 8; iz <= Math.floor(qz) + 8; iz++) {
    for (let ix = Math.floor(qx) - 8; ix <= Math.floor(qx) + 8; ix++) {
      const [sx, sz] = referencePosition(ix, iz, site, jitter);
      candidates.push({ ix, iz, distance: Math.hypot(sx - qx, sz - qz) });
    }
  }
  candidates.sort((a, b) => a.distance - b.distance || a.iz - b.iz || a.ix - b.ix);
  const nearest = { ...candidates[0], distance: candidates[0].distance * cellSize };
  const runnerUp = { ...candidates[1], distance: candidates[1].distance * cellSize };
  return { nearest, runnerUp, gap: runnerUp.distance - nearest.distance };
}

function expectSample(actual: JitteredCellSample2D, expected: ReturnType<typeof widerOracle>) {
  expect([actual.nearest.ix, actual.nearest.iz]).toEqual([
    expected.nearest.ix,
    expected.nearest.iz,
  ]);
  expect([actual.runnerUp.ix, actual.runnerUp.iz]).toEqual([
    expected.runnerUp.ix,
    expected.runnerUp.iz,
  ]);
  expect(actual.nearest.distance).toBeCloseTo(expected.nearest.distance, 12);
  expect(actual.runnerUp.distance).toBeCloseTo(expected.runnerUp.distance, 12);
  expect(actual.gap).toBe(actual.runnerUp.distance - actual.nearest.distance);
  expect(actual.gap).toBeCloseTo(expected.gap, 12);
}

const awayFromOrigin: LatticeSiteSampler2D = (ix, iz) => [ix < 0 ? 0 : 1, iz < 0 ? 0 : 1];
const isolatedOrigin: LatticeSiteSampler2D = (ix, iz) =>
  ix === 0 && iz === 0 ? [0, 0] : awayFromOrigin(ix, iz);

describe("jittered two-nearest cell fields", () => {
  it("exports a callable factory through root and noise", () => {
    expect(typeof createJitteredCellField2D).toBe("function");
    expect(createFromNoise).toBe(createJitteredCellField2D);
    expect(typeof createJitteredCellField2D({ seed: "cells" })).toBe("function");
  });

  it.each([0, 0.25, 0.5, 0.75, 1])(
    "matches an independent radius-eight oracle at jitter %s",
    (jitter) => {
      const field = createJitteredCellField2D({ site: patternedSite, jitter });
      for (const x of [-3.125, -1, -0.75, -0.125, 0, 0.375, 0.875, 1, 1.125, 4.75]) {
        for (const z of [-2.375, -0.5, 0, 0.625, 2.125]) {
          expectSample(field(x, z), widerOracle(x, z, patternedSite, jitter));
        }
      }
    },
  );

  it("finds an engineered runner-up two cells away that a radius-one search misses", () => {
    const site: LatticeSiteSampler2D = (ix, iz) => {
      if (iz === 0 && (ix === 0 || ix === 1)) return [0, 0];
      if (ix === 2 && iz === 0) return [0, 0.5];
      return [
        Math.abs(ix - 0.99) > Math.abs(ix + 1 - 0.99) ? 0 : 1,
        Math.abs(iz - 0.5) > Math.abs(iz + 1 - 0.5) ? 0 : 1,
      ];
    };
    const sample = createJitteredCellField2D({ site })(0.99, 0.5);
    expect([sample.nearest.ix, sample.nearest.iz]).toEqual([1, 0]);
    expect([sample.runnerUp.ix, sample.runnerUp.iz]).toEqual([2, 0]);
    expect(sample.nearest.distance).toBeCloseTo(Math.hypot(0.01, 0.5), 14);
    expect(sample.runnerUp.distance).toBeCloseTo(1.01, 14);
    expectSample(sample, widerOracle(0.99, 0.5, site));
  });

  it("breaks exact center ties by row then column, including negative cell boundaries", () => {
    const field = createJitteredCellField2D({ site: () => [0.91, 0.03], jitter: 0 });
    const atOrigin = field(0, 0);
    expect([atOrigin.nearest.ix, atOrigin.nearest.iz]).toEqual([-1, -1]);
    expect([atOrigin.runnerUp.ix, atOrigin.runnerUp.iz]).toEqual([0, -1]);
    expect(atOrigin.nearest.distance).toBe(Math.hypot(0.5, 0.5));
    expect(atOrigin.gap).toBe(0);
    const negative = field(-1, -2);
    expect([negative.nearest.ix, negative.nearest.iz]).toEqual([-2, -3]);
    expect([negative.runnerUp.ix, negative.runnerUp.iz]).toEqual([-1, -3]);
    expectSample(negative, widerOracle(-1, -2, patternedSite, 0));
  });

  it("retains separate lattice identities at coincident full-jitter sites", () => {
    const site: LatticeSiteSampler2D = (ix, iz) => {
      if (ix === -1 && iz === 0) return [1, 0];
      if (ix === 0 && iz === 0) return [0, 0];
      return awayFromOrigin(ix, iz);
    };
    const sample = createJitteredCellField2D({ site })(0, 0);
    expect(sample).toEqual({
      nearest: { ix: -1, iz: 0, distance: 0 },
      runnerUp: { ix: 0, iz: 0, distance: 0 },
      gap: 0,
    });
    expect(sample.nearest).not.toBe(sample.runnerUp);
  });

  it.each([-1e-20, 1e-20])("preserves an origin-site displacement of %s on either axis", (tiny) => {
    const field = createJitteredCellField2D({ site: isolatedOrigin });
    for (const [x, z] of [
      [tiny, 0],
      [0, tiny],
    ]) {
      const sample = field(x, z);
      expect([sample.nearest.ix, sample.nearest.iz]).toEqual([0, 0]);
      expect(sample.nearest.distance).toBe(Math.abs(tiny));
    }
  });

  it("preserves full-jitter subnormal offsets instead of subtracting and readding a half", () => {
    for (const offset of [
      [Number.MIN_VALUE, 0],
      [0, Number.MIN_VALUE],
    ] as const) {
      const site: LatticeSiteSampler2D = (ix, iz) =>
        ix === 0 && iz === 0 ? offset : awayFromOrigin(ix, iz);
      const sample = createJitteredCellField2D({ site })(0, 0);
      expect([sample.nearest.ix, sample.nearest.iz]).toEqual([0, 0]);
      expect(sample.nearest.distance).toBe(Number.MIN_VALUE);
    }
  });

  it("keeps local site distances when a large world-space position would round away its offset", () => {
    const x = 2 ** 51;
    const sample = createJitteredCellField2D({ site: () => [0.1, 0.25] })(x, 0.25);
    expect([sample.nearest.ix, sample.nearest.iz]).toEqual([x, 0]);
    expect(sample.nearest.distance).toBe(0.1);
    expect(Object.keys(sample).sort()).toEqual(["gap", "nearest", "runnerUp"]);
    expect(Object.keys(sample.nearest).sort()).toEqual(["distance", "ix", "iz"]);
  });

  it("scales distances and gap while preserving identities at well-conditioned scales", () => {
    const base = createJitteredCellField2D({ site: patternedSite, jitter: 0.5 })(0.375, -0.625);
    for (const cellSize of [0.125, 8, 1024]) {
      const actual = createJitteredCellField2D({ site: patternedSite, jitter: 0.5, cellSize })(
        0.375 * cellSize,
        -0.625 * cellSize,
      );
      expectSample(actual, {
        nearest: { ...base.nearest, distance: base.nearest.distance * cellSize },
        runnerUp: { ...base.runnerUp, distance: base.runnerUp.distance * cellSize },
        gap: (base.runnerUp.distance - base.nearest.distance) * cellSize,
      });
    }
  });

  it("translates lattice identities when the callback is translated with the query", () => {
    const dx = 7,
      dz = -11;
    const original = createJitteredCellField2D({ site: patternedSite });
    const translated = createJitteredCellField2D({
      site: (ix, iz) => patternedSite(ix - dx, iz - dz),
    });
    const sample = original(-0.375, 1.125);
    expectSample(translated(-0.375 + dx, 1.125 + dz), {
      nearest: { ...sample.nearest, ix: sample.nearest.ix + dx, iz: sample.nearest.iz + dz },
      runnerUp: { ...sample.runnerUp, ix: sample.runnerUp.ix + dx, iz: sample.runnerUp.iz + dz },
      gap: sample.gap,
    });
  });

  it("ranks before scaling and computes gap literally from rounded output distances", () => {
    const site: LatticeSiteSampler2D = (ix, iz) => {
      if (ix === 0 && iz === 0) return [0.75, 0];
      if (ix === -1 && iz === 0) return [0.2499999999999999, 0];
      return awayFromOrigin(ix, iz);
    };
    const sample = createJitteredCellField2D({ site, cellSize: 0.8 })(0, 0);
    expect([sample.nearest.ix, sample.nearest.iz]).toEqual([0, 0]);
    expect([sample.runnerUp.ix, sample.runnerUp.iz]).toEqual([-1, 0]);
    expect(sample.nearest.distance).toBe(0.6000000000000001);
    expect(sample.runnerUp.distance).toBe(sample.nearest.distance);
    expect(sample.gap).toBe(0);
  });

  it("allows scaled distance underflow without reranking the normalized winners", () => {
    const site: LatticeSiteSampler2D = (ix, iz) => {
      if (ix === 0 && iz === 0) return [0.25, 0];
      if (ix === -1 && iz === 0) return [0.5, 0];
      return awayFromOrigin(ix, iz);
    };
    const sample = createJitteredCellField2D({ site, cellSize: Number.MIN_VALUE })(0, 0);
    expect(sample).toEqual({
      nearest: { ix: 0, iz: 0, distance: 0 },
      runnerUp: { ix: -1, iz: 0, distance: 0 },
      gap: 0,
    });
  });
});

describe("jittered cell determinism, snapshots, and work bounds", () => {
  it("uses fixed existing seeded lattice channels and remains query-order independent", () => {
    const points = [
      [-2.125, 0.375],
      [0, 0],
      [1.75, -3.125],
      [4.25, 2.75],
    ] as const;
    for (const seed of [0, -19.25, "cells", ""]) {
      const lattice = createSeededNoise(seed);
      const site: LatticeSiteSampler2D = (ix, iz) => [
        (lattice(ix, 0, iz) + 1) / 2,
        (lattice(ix, 1, iz) + 1) / 2,
      ];
      const field = createJitteredCellField2D({ seed });
      const expected = points.map(([x, z]) => widerOracle(x, z, site));
      points.forEach(([x, z], index) => {
        expectSample(field(x, z), expected[index]);
      });
      points.toReversed().forEach(([x, z], index) => {
        expectSample(field(x, z), expected[points.length - 1 - index]);
      });
      points.forEach(([x, z], index) => {
        expectSample(createJitteredCellField2D({ seed })(x, z), expected[index]);
      });
    }
    const random = vi.spyOn(Math, "random").mockImplementation(() => {
      throw new Error("No global random source");
    });
    try {
      expect(Number.isFinite(createJitteredCellField2D({ seed: "fixed" })(0.2, 0.3).gap)).toBe(
        true,
      );
    } finally {
      random.mockRestore();
    }
  });

  it.each([0, 2 * (Math.sqrt(10) - 3) - 1e-12, 2 * (Math.sqrt(10) - 3) + 1e-12, 1])(
    "visits exactly 25 distinct radius-two sites with no persistent cache at jitter %s",
    (jitter) => {
      const site = vi.fn(patternedSite);
      const field = createJitteredCellField2D({ site, jitter });
      expect(site).not.toHaveBeenCalled();
      field(-0.25, 2.75);
      expect(site).toHaveBeenCalledTimes(25);
      const identities = new Set(site.mock.calls.map(([ix, iz]) => `${ix},${iz}`));
      const expected = new Set<string>();
      for (let iz = 0; iz <= 4; iz++) for (let ix = -3; ix <= 1; ix++) expected.add(`${ix},${iz}`);
      expect(identities).toEqual(expected);
      field(-0.25, 2.75);
      expect(site).toHaveBeenCalledTimes(50);
    },
  );

  it("snapshots constructor getters once and preserves the captured callback choice", () => {
    let site: LatticeSiteSampler2D = patternedSite;
    let cellSize = 2,
      jitter = 0.5;
    const getSite = vi.fn(() => site),
      getSize = vi.fn(() => cellSize),
      getJitter = vi.fn(() => jitter);
    const options = Object.defineProperties(
      {},
      { site: { get: getSite }, cellSize: { get: getSize }, jitter: { get: getJitter } },
    ) as JitteredCellField2DOptions;
    const field = createJitteredCellField2D(options);
    site = () => [1, 1];
    cellSize = 8;
    jitter = 0;
    expectSample(field(0.75, -1.25), widerOracle(0.75, -1.25, patternedSite, 0.5, 2));
    expect(getSite).toHaveBeenCalledTimes(1);
    expect(getSize).toHaveBeenCalledTimes(1);
    expect(getJitter).toHaveBeenCalledTimes(1);
  });

  it("copies each callback pair immediately and reads each component once", () => {
    const scratch: [number, number] = [0, 0];
    const shared = createJitteredCellField2D({
      site: (ix, iz) => {
        const pair = patternedSite(ix, iz);
        scratch[0] = pair[0];
        scratch[1] = pair[1];
        return scratch;
      },
    });
    expectSample(shared(0.375, -0.625), widerOracle(0.375, -0.625, patternedSite));
    const first = vi.fn(() => 0.25),
      second = vi.fn(() => 0.75);
    const pair = Object.defineProperties([0, 0], { 0: { get: first }, 1: { get: second } }) as [
      number,
      number,
    ];
    createJitteredCellField2D({ site: () => pair })(0.2, 0.3);
    expect(first).toHaveBeenCalledTimes(25);
    expect(second).toHaveBeenCalledTimes(25);
  });

  it("returns fresh mutable results and independent nearest/runner-up records", () => {
    const field = createJitteredCellField2D({ site: patternedSite });
    const first = field(0.375, -0.625),
      second = field(0.375, -0.625);
    expect(first).not.toBe(second);
    expect(first.nearest).not.toBe(second.nearest);
    expect(first.runnerUp).not.toBe(second.runnerUp);
    expect(first.nearest).not.toBe(first.runnerUp);
    expect(Reflect.set(first.nearest, "distance", 999)).toBe(true);
    expect(Reflect.set(first, "gap", 999)).toBe(true);
    expectSample(second, widerOracle(0.375, -0.625, patternedSite));
    expectSample(field(0.375, -0.625), widerOracle(0.375, -0.625, patternedSite));
  });

  it("wraps callback failures with the original cause", () => {
    const cause = new Error("site unavailable");
    const field = createJitteredCellField2D({
      site: () => {
        throw cause;
      },
    });
    let caught: unknown;
    try {
      field(0, 0);
    } catch (error) {
      caught = error;
    }
    expect(caught).toBeInstanceOf(Error);
    expect((caught as Error).message).toMatch(/createJitteredCellField2D/);
    expect((caught as Error).cause).toBe(cause);
  });
});

describe("jittered cell validation and finite limits", () => {
  it("requires exactly one valid seed or site callback", () => {
    for (const options of [
      undefined,
      null,
      {},
      { seed: 0, site: patternedSite },
      { site: 1 },
      { site: null },
      { seed: undefined },
      { seed: null },
      { seed: NaN },
      { seed: Infinity },
      { seed: {} },
    ]) {
      expect(() => createJitteredCellField2D(options as never)).toThrow();
    }
  });

  it("validates scalar options before any callback", () => {
    const site = vi.fn(patternedSite);
    for (const cellSize of [0, -0, -1, NaN, Infinity, -Infinity, "1", null])
      expect(() => createJitteredCellField2D({ site, cellSize } as never)).toThrow();
    for (const jitter of [
      -Number.MIN_VALUE,
      1 + Number.EPSILON,
      NaN,
      Infinity,
      -Infinity,
      "1",
      null,
    ])
      expect(() => createJitteredCellField2D({ site, jitter } as never)).toThrow();
    expect(site).not.toHaveBeenCalled();
  });

  it("validates both normalized coordinates before any callback", () => {
    const site = vi.fn(patternedSite);
    const field = createJitteredCellField2D({ site });
    for (const coordinate of [
      NaN,
      Infinity,
      -Infinity,
      2 ** 52,
      -(2 ** 52),
      "0",
      null,
      undefined,
    ]) {
      expect(() => field(coordinate as never, 0)).toThrow();
      expect(() => field(0, coordinate as never)).toThrow();
    }
    const dividedOverflow = createJitteredCellField2D({ site, cellSize: Number.MIN_VALUE });
    expect(() => dividedOverflow(1, 0)).toThrow();
    expect(() => dividedOverflow(0, 1)).toThrow();
    const erased = createJitteredCellField2D({ site, cellSize: Number.MAX_VALUE });
    expect(() => erased(Number.MIN_VALUE, 0)).toThrow();
    expect(() => erased(0, Number.MIN_VALUE)).toThrow();
    expect(site).not.toHaveBeenCalled();
  });

  it("accepts the represented interior of the normalized-coordinate bound with safe identities", () => {
    const visits = vi.fn((_ix: number, _iz: number) => [0.5, 0.5] as const);
    const sample = createJitteredCellField2D({ site: visits })(2 ** 52 - 0.5, -(2 ** 52) + 0.5);
    expect(visits).toHaveBeenCalledTimes(25);
    for (const [ix, iz] of visits.mock.calls) {
      expect(Number.isSafeInteger(ix)).toBe(true);
      expect(Number.isSafeInteger(iz)).toBe(true);
    }
    expect(Number.isFinite(sample.nearest.distance)).toBe(true);
    expect(Number.isFinite(sample.runnerUp.distance)).toBe(true);
    expect(Number.isFinite(sample.gap)).toBe(true);
  });

  it("rejects invalid callback pair shapes and finite-unit component violations", () => {
    for (const pair of [
      null,
      undefined,
      [],
      [0],
      [0, 0, 0],
      [NaN, 0.5],
      [0.5, Infinity],
      [-Number.MIN_VALUE, 0],
      [0, 1 + Number.EPSILON],
      ["0", 0],
      [0, null],
    ]) {
      expect(() => createJitteredCellField2D({ site: () => pair as never })(0, 0)).toThrow();
    }
    for (let iz = -2; iz <= 2; iz++)
      for (let ix = -2; ix <= 2; ix++) {
        const field = createJitteredCellField2D({
          jitter: 0,
          site: (x, z) => (x === ix && z === iz ? [NaN, 0] : [0.5, 0.5]),
        });
        expect(() => field(0.25, 0.25)).toThrow();
      }
  });

  it("rejects nonfinite scaled outputs rather than returning infinities", () => {
    const site = vi.fn(awayFromOrigin);
    const field = createJitteredCellField2D({ site, cellSize: Number.MAX_VALUE });
    expect(() => field(0, 0)).toThrow();
    expect(site).toHaveBeenCalledTimes(25);
  });
});
