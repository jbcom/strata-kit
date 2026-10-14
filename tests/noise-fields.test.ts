import { describe, expect, it } from "vitest";
import { createSeededNoise, seedToUint32 } from "../src/noise.js";
import {
  createFractalNoise2D,
  createSineLattice2D,
  createValueNoise2D,
  type FractalNoise2DOptions,
  type SineLattice2DOptions,
  type ValueNoise2DOptions,
} from "../src/noiseFields.js";

describe("2D value noise", () => {
  it("samples independent affine lattice grids, including negative cells", () => {
    const field = createValueNoise2D({ lattice: (i, j) => i + 2 * j });
    for (const x of [-2, -1.75, -0.5, 0, 0.25, 0.5, 1.75]) {
      for (const z of [-2, -0.75, 0, 0.5, 1.25]) {
        const ix = Math.floor(x);
        const iz = Math.floor(z);
        const fx = x - ix;
        const fz = z - iz;
        expect(field(x, z)).toBeCloseTo(
          ix + fx * fx * (3 - 2 * fx) + 2 * (iz + fz * fz * (3 - 2 * fz)),
          14,
        );
      }
    }
    expect(field(-0.5, -0.5)).toBe(-1.5);
  });
  it("preserves the bilinear polynomial rounding and four distinct corners", () => {
    const corners = [1, 2, 4, 8];
    const field = createValueNoise2D({ lattice: (i, j) => corners[i + 2 * j] });
    expect(field(0.5, 0.5)).toBe(3.75);
    const precision = createValueNoise2D({ lattice: (i, j) => [0.1, 0.2, 0.3, 0.8][i + 2 * j] });
    // Cubic weights at (.25,.75) are 5/32 and 27/32, exactly representable.
    expect(precision(0.25, 0.75)).toBe(0.337109375);
  });
  it("matches existing seeded integer corners and is sampling-order independent", () => {
    const points = [
      [-1.3, 2.4],
      [0, 0],
      [3.5, -2.75],
    ] as const;
    for (const seed of [0, -18.25, 18, "field", ""]) {
      const field = createValueNoise2D({ seed });
      const old = createSeededNoise(seed);
      for (const x of [-(2 ** 32) - 3, -3, 0, 2, 2 ** 32 + 2])
        for (const z of [-(2 ** 32) - 2, -2, 0, 7, 2 ** 32 + 7])
          expect(field(x, z)).toBe(old(x, 0, z));
      const first = points.map(([x, z]) => field(x, z));
      expect(
        points
          .toReversed()
          .map(([x, z]) => field(x, z))
          .toReversed(),
      ).toEqual(first);
      expect(points.map(([x, z]) => createValueNoise2D({ seed })(x, z))).toEqual(first);
      expect(first.every((value) => value >= -1 && value <= 1)).toBe(true);
    }
    expect(createValueNoise2D({ seed: "a" })(0.2, 0.3)).not.toBe(
      createValueNoise2D({ seed: "b" })(0.2, 0.3),
    );
  });
  it("copies the callback choice and rejects each invalid corner", () => {
    const options = { lattice: () => 2 };
    const field = createValueNoise2D(options);
    options.lattice = () => 99;
    expect(field(0.5, 0.5)).toBe(2);
    for (let invalid = 0; invalid < 4; invalid += 1) {
      expect(() =>
        createValueNoise2D({ lattice: (i, j) => (i + 2 * j === invalid ? NaN : 0) })(0.2, 0.3),
      ).toThrow(/callback result/);
    }
    expect(() =>
      createValueNoise2D({
        lattice: () => {
          throw new Error("bad");
        },
      })(0, 0),
    ).toThrow(/createValueNoise2D: callback failed/);
  });
  it("rejects ambiguous options, unresolved lattice coordinates, and overflow", () => {
    for (const options of [
      {},
      { seed: 0, lattice: () => 0 },
      { lattice: 3 },
      { seed: NaN },
      null,
    ]) {
      expect(() => createValueNoise2D(options as ValueNoise2DOptions)).toThrow();
    }
    const field = createValueNoise2D({ seed: 0 });
    for (const coordinate of [NaN, Infinity, -(2 ** 52), 2 ** 52])
      expect(() => field(coordinate, 0)).toThrow();
    expect(Number.isFinite(field(2 ** 52 - 0.5, -(2 ** 52) + 0.5))).toBe(true);
    expect(() =>
      createValueNoise2D({ lattice: (i) => (i ? Number.MAX_VALUE : -Number.MAX_VALUE) })(0.5, 0),
    ).toThrow(/difference/);
  });
});

describe("recursive affine fractal noise", () => {
  it("has analytic raw/normalized totals and anisotropic recurrence", () => {
    const recipe = {
      noise: (x: number, z: number) => x + 10 * z,
      octaves: 2,
      octaveTransform: { scale: [2, 2] as const, offset: [3, 5] as const },
    };
    expect(createFractalNoise2D({ ...recipe, normalize: false })(1, 2)).toBe(34.25);
    expect(createFractalNoise2D(recipe)(1, 2)).toBe(137 / 3);
    const visits: number[][] = [];
    const field = createFractalNoise2D({
      noise: (x, z) => {
        visits.push([x, z]);
        return 1;
      },
      octaves: 3,
      octaveTransform: { scale: [-2, 0.5], offset: [3, -1] },
      normalize: false,
    });
    expect(field(1, 2)).toBe(0.875);
    expect(visits).toEqual([
      [1, 2],
      [1, 0],
      [1, -1],
    ]);
  });
  it("retains recursive rounding instead of pre-expanded transforms", () => {
    const visits: number[] = [];
    createFractalNoise2D({
      noise: (x) => {
        visits.push(x);
        return 0;
      },
      octaves: 4,
      octaveTransform: { scale: [2.03, 2.03], offset: [17.1, 3.7] },
    })(1, 2);
    expect(visits).toEqual([1, 19.130000000000003, 55.9339, 130.645817]);
  });
  it("copies options, restores seeds, and samples zero-amplitude octaves", () => {
    const options = {
      noise: createValueNoise2D({ seed: 3 }),
      octaveTransform: { scale: [2, 3] as [number, number], offset: [4, 5] as [number, number] },
      normalize: false,
    };
    const field = createFractalNoise2D(options);
    const initial = field(-0.4, 0.7);
    options.octaveTransform.scale[0] = 9;
    options.octaveTransform.offset[1] = 100;
    options.noise = () => 999;
    options.normalize = true;
    const points = [
      [-0.4, 0.7],
      [2, 3],
      [-7, 1],
    ] as const;
    const forward = points.map(([x, z]) => field(x, z));
    expect(
      points
        .toReversed()
        .map(([x, z]) => field(x, z))
        .toReversed(),
    ).toEqual(forward);
    expect(field(-0.4, 0.7)).toBe(initial);
    let calls = 0;
    expect(
      createFractalNoise2D({
        noise: () => {
          calls += 1;
          return 3;
        },
        persistence: 0,
        octaves: 32,
      })(0, 0),
    ).toBe(3);
    expect(calls).toBe(32);
    expect(() =>
      createFractalNoise2D({ noise: () => (++calls === 34 ? NaN : 1), persistence: 0, octaves: 2 })(
        0,
        0,
      ),
    ).toThrow();
  });
  it("validates options before callbacks and labels failures", () => {
    const noise = () => 1;
    for (const patch of [
      { octaves: null },
      { persistence: null },
      { initialAmplitude: null },
      { normalize: null },
      { octaveTransform: null },
      { octaveTransform: {} },
      { octaves: 0 },
      { octaves: 33 },
      { octaves: 1.5 },
      { initialAmplitude: 0 },
      { initialAmplitude: Infinity },
      { persistence: -0.1 },
      { persistence: 1.1 },
      { normalize: 1 },
      { noise: 2 },
      { octaveTransform: { scale: [1], offset: [0, 0] } },
      { octaveTransform: { scale: [1, Infinity], offset: [0, 0] } },
    ]) {
      expect(() => createFractalNoise2D({ noise, ...patch } as FractalNoise2DOptions)).toThrow();
    }
    expect(() => createFractalNoise2D({ noise: () => Infinity })(0, 0)).toThrow(/callback result/);
    expect(() =>
      createFractalNoise2D({
        noise: () => {
          throw new Error("bad");
        },
      })(0, 0),
    ).toThrow(/callback failed/);
  });
  it("tracks the amplitude denominator only for normalized output", () => {
    const options = {
      noise: () => 0,
      octaves: 2,
      initialAmplitude: Number.MAX_VALUE,
      persistence: 1,
    };
    expect(createFractalNoise2D({ ...options, normalize: false })(0, 0)).toBe(0);
    expect(() => createFractalNoise2D(options)(0, 0)).toThrow(/amplitude total/);
  });

  it("rejects all overflowing intermediates and skips the final advance", () => {
    const big = Number.MAX_VALUE;
    expect(
      createFractalNoise2D({
        noise: () => 1,
        octaves: 1,
        octaveTransform: { scale: [big, big], offset: [big, big] },
      })(big, big),
    ).toBe(1);
    expect(() =>
      createFractalNoise2D({
        noise: () => 1,
        octaves: 2,
        octaveTransform: { scale: [2, 1], offset: [-big, 0] },
      })(big, 0),
    ).toThrow(/scaled x/);
    expect(() =>
      createFractalNoise2D({ noise: () => 1, octaves: 2, initialAmplitude: big, persistence: 1 })(
        0,
        0,
      ),
    ).toThrow();
    expect(() => createFractalNoise2D({ noise: () => big, initialAmplitude: 2 })(0, 0)).toThrow(
      /weighted sample/,
    );
    expect(() => createFractalNoise2D({ noise: () => 1 })(NaN, 0)).toThrow();
  });
});

describe("explicit sine lattice", () => {
  it("uses numeric phases and stable string phases with explicit coefficients", () => {
    const options = { seed: 0, coefficients: [0, Math.PI / 2] as const, multiplier: 0.75 };
    const lattice = createSineLattice2D(options);
    expect(lattice(7, 0)).toBe(0);
    expect(lattice(0, 1)).toBe(0.75);
    expect(lattice(0, -1)).toBe(0.25);
    expect(createSineLattice2D({ ...options, seed: Math.PI / 2 })(0, 0)).toBe(0.75);
    const string = createSineLattice2D({ ...options, seed: "0" });
    const phaseValue = Math.sin(seedToUint32("0")) * 0.75;
    expect(string(0, 0)).toBe(phaseValue - Math.floor(phaseValue));
    expect(string(0, 0)).not.toBe(lattice(0, 0));
    expect(string(0, -1)).toBe(createSineLattice2D({ ...options, seed: "0" })(0, -1));
  });
  it("copies tuple data and rejects malformed options, coordinates, and arithmetic", () => {
    const options = {
      seed: 0,
      coefficients: [0, Math.PI / 2] as [number, number],
      multiplier: 0.75,
    };
    const lattice = createSineLattice2D(options);
    options.coefficients[1] = 0;
    options.multiplier = 10;
    options.seed = 99;
    expect(lattice(0, 1)).toBe(0.75);
    for (const patch of [
      { seed: undefined },
      { seed: Infinity },
      { multiplier: 0 },
      { multiplier: -1 },
      { multiplier: NaN },
      { coefficients: [1] },
      { coefficients: [1, Infinity] },
    ]) {
      expect(() => createSineLattice2D({ ...options, ...patch } as SineLattice2DOptions)).toThrow();
    }
    for (const x of [0.5, NaN, Infinity, 2 ** 52]) expect(() => lattice(x, 0)).toThrow();
    expect(() =>
      createSineLattice2D({ seed: 0, coefficients: [Number.MAX_VALUE, 0], multiplier: 1 })(2, 0),
    ).toThrow(/x product/);
  });
});
