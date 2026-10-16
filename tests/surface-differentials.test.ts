import { describe, expect, it, vi } from "vitest";
import { sampleParametricSurfaceDifferentials as sampleFromRoot } from "../src/index.ts";
import {
  deriveReliefFrame,
  type ParametricSurfaceDifferentialOptions,
  sampleParametricSurfaceDifferentials,
} from "../src/surfaceFields.ts";

const plane = (u: number, v: number) => ({
  x: 3 * u + 2 * v + 5,
  y: -u + 4 * v - 7,
  z: 2 * u - 3 * v + 1,
});
const quadratic = (u: number, v: number) => ({ x: u * u, y: v * v, z: u * v });
const basic: ParametricSurfaceDifferentialOptions = {
  positionAt: plane,
  u: 0.5,
  v: -0.25,
  uStep: 0.25,
  vStep: 0.5,
};

function expectVector(
  actual: { x: number; y: number; z: number },
  expected: readonly number[],
): void {
  [actual.x, actual.y, actual.z].forEach((value, axis) => {
    expect(value).toBeCloseTo(expected[axis], 12);
  });
}

describe("explicit parametric surface differential sampling", () => {
  it("exports the same operation through root and surface-fields", () => {
    expect(sampleFromRoot).toBe(sampleParametricSurfaceDifferentials);
    expect(sampleFromRoot(basic)).toEqual({ du: { x: 3, y: -1, z: 2 }, dv: { x: 2, y: 4, z: -3 } });
  });

  it("returns analytic plane Jacobian columns without normalizing or choosing an orientation", () => {
    const positionAt = vi.fn(plane);
    const result = sampleParametricSurfaceDifferentials({ ...basic, positionAt });
    expect(result).toEqual({ du: { x: 3, y: -1, z: 2 }, dv: { x: 2, y: 4, z: -3 } });
    expect(positionAt).toHaveBeenCalledTimes(4);
    expect(positionAt.mock.calls).toEqual(
      expect.arrayContaining([
        [0.25, -0.25],
        [0.75, -0.25],
        [0.5, -0.75],
        [0.5, 0.25],
      ]),
    );
  });

  it("matches a coupled quadratic's exact central secants in both coordinates", () => {
    const result = sampleParametricSurfaceDifferentials({
      positionAt: quadratic,
      u: 1.5,
      v: -0.75,
      uStep: 0.125,
      vStep: 0.25,
    });
    expect(result).toEqual({ du: { x: 3, y: 0, z: -0.75 }, dv: { x: 0, y: -1.5, z: 1.5 } });
  });

  it("uses actual asymmetric clipped spans rather than pretending to return analytic derivatives", () => {
    const positionAt = vi.fn(quadratic);
    const result = sampleParametricSurfaceDifferentials({
      positionAt,
      u: 0.125,
      v: 0.875,
      uStep: 0.25,
      vStep: 0.25,
      uRange: [0, 1],
      vRange: [0, 1],
    });
    // For x=u² a secant slope is the sum of its endpoints: 0+.375.
    // For y=v² the clipped endpoints are .625 and1, so the slope is1.625.
    expect(result).toEqual({ du: { x: 0.375, y: 0, z: 0.875 }, dv: { x: 0, y: 1.625, z: 0.125 } });
    expect(result.du.x).not.toBe(2 * 0.125);
    expect(result.dv.y).not.toBe(2 * 0.875);
    expect(positionAt).toHaveBeenCalledTimes(4);
    expect(positionAt.mock.calls).toEqual(
      expect.arrayContaining([
        [0, 0.875],
        [0.375, 0.875],
        [0.125, 0.625],
        [0.125, 1],
      ]),
    );
  });

  it.each([
    { u: 0, v: 2, du: [0.25, 0, 2], dv: [0, 4.5, 0] },
    { u: 1, v: 5, du: [1.75, 0, 5], dv: [0, 9.5, 1] },
  ])("permits true one-sided secants at exact range endpoints ($u,$v)", ({ u, v, du, dv }) => {
    const result = sampleParametricSurfaceDifferentials({
      positionAt: quadratic,
      u,
      v,
      uStep: 0.25,
      vStep: 0.5,
      uRange: [0, 1],
      vRange: [2, 5],
    });
    expectVector(result.du, du);
    expectVector(result.dv, dv);
  });

  it("keeps unbounded coordinates in the caller's domain instead of imposing a unit tile", () => {
    const result = sampleParametricSurfaceDifferentials({ ...basic, u: 3, v: -4 });
    expect(result).toEqual({ du: { x: 3, y: -1, z: 2 }, dv: { x: 2, y: 4, z: -3 } });
  });

  it("copies each borrowed callback vector immediately and owns independent outputs", () => {
    const scratch = { x: 0, y: 0, z: 0 };
    const positionAt = vi.fn((u: number, v: number) => {
      Object.assign(scratch, plane(u, v));
      return scratch;
    });
    const options = Object.freeze({ ...basic, positionAt });
    const first = sampleParametricSurfaceDifferentials(options);
    const second = sampleParametricSurfaceDifferentials(options);
    expect(first).toEqual({ du: { x: 3, y: -1, z: 2 }, dv: { x: 2, y: 4, z: -3 } });
    expect(first).not.toBe(second);
    expect(first.du).not.toBe(first.dv);
    expect(first.du).not.toBe(second.du);
    expect(first.dv).not.toBe(second.dv);
    expect(first.du).not.toBe(scratch);
    expect(first.dv).not.toBe(scratch);
    Object.assign(scratch, { x: 999, y: 999, z: 999 });
    first.du.x = 42;
    expect(first.dv).toEqual({ x: 2, y: 4, z: -3 });
    expect(second).toEqual({ du: { x: 3, y: -1, z: 2 }, dv: { x: 2, y: 4, z: -3 } });
    expect(positionAt).toHaveBeenCalledTimes(8);
  });

  it("accepts frozen callback results and preserves callback exceptions", () => {
    const result = sampleParametricSurfaceDifferentials({
      ...basic,
      positionAt: (u, v) => Object.freeze(plane(u, v)),
    });
    expect(result.du).toEqual({ x: 3, y: -1, z: 2 });
    const failure = new Error("position sampler stopped");
    expect(() =>
      sampleParametricSurfaceDifferentials({
        ...basic,
        positionAt: () => {
          throw failure;
        },
      }),
    ).toThrow(failure);
  });

  it("allows zero vectors while leaving degeneracy decisions to frame construction", () => {
    const result = sampleParametricSurfaceDifferentials({
      ...basic,
      positionAt: () => ({ x: 7, y: -3, z: 5 }),
    });
    expect(result).toEqual({ du: { x: 0, y: 0, z: 0 }, dv: { x: 0, y: 0, z: 0 } });
    expect(() => deriveReliefFrame(result, { du: 0, dv: 0 })).toThrow();
  });

  it("composes with a relief frame and respects an explicitly reversed parameter direction", () => {
    for (const sign of [1, -1]) {
      const differentials = sampleParametricSurfaceDifferentials({
        ...basic,
        positionAt: (u, v) => ({ x: 2 * sign * u, y: 3 * v, z: 0 }),
      });
      expect(differentials.du.x).toBe(2 * sign);
      expect(differentials.dv.y).toBe(3);
      const frame = deriveReliefFrame(differentials, { du: 0, dv: 0 });
      expectVector(frame.normal, [0, 0, sign]);
      expectVector(frame.tangent, [sign, 0, 0]);
      expectVector(frame.bitangent, [0, 1, 0]);
    }
  });
});

describe("surface differential numeric stencil guards", () => {
  it.each([1e-200, Number.MIN_VALUE])(
    "retains genuinely distinct tiny stencils without an epsilon floor at %s",
    (step) => {
      const result = sampleParametricSurfaceDifferentials({
        positionAt: (u, v) => ({ x: u, y: v, z: 0 }),
        u: 0,
        v: 0,
        uStep: step,
        vStep: step,
      });
      expect(result).toEqual({ du: { x: 1, y: 0, z: 0 }, dv: { x: 0, y: 1, z: 0 } });
    },
  );

  it.each([1, -1])(
    "rejects a one-sided erased increment at interior coordinate %s",
    (coordinate) => {
      const step = 2 ** -53;
      const lower = coordinate - step;
      const upper = coordinate + step;
      expect((lower === coordinate) !== (upper === coordinate)).toBe(true);
      const positionAt = vi.fn(plane);
      expect(() =>
        sampleParametricSurfaceDifferentials({
          ...basic,
          positionAt,
          u: coordinate,
          uStep: step,
          uRange: [-2, 2],
        }),
      ).toThrow();
      expect(positionAt).not.toHaveBeenCalled();
    },
  );

  it("permits that one-sided stencil only at the exact boundary with an inward represented step", () => {
    const result = sampleParametricSurfaceDifferentials({
      positionAt: (u, v) => ({ x: u, y: v, z: 0 }),
      u: 1,
      v: 0,
      uStep: 2 ** -53,
      vStep: 1,
      uRange: [0, 1],
    });
    expect(result).toEqual({ du: { x: 1, y: 0, z: 0 }, dv: { x: 0, y: 1, z: 0 } });
  });

  it("rejects collapsed spans and overflowed spans before either stencil is sampled", () => {
    const positionAt = vi.fn(plane);
    const patches = [
      { u: 1, uStep: 2 ** -54 },
      { u: 1, uStep: Number.MIN_VALUE, uRange: [1, 1 + 2 ** -52] },
      { v: 1, vStep: 2 ** -54 },
      { v: 0, vStep: Number.MAX_VALUE },
      { u: 0, uStep: Number.MAX_VALUE, uRange: [-Number.MAX_VALUE, Number.MAX_VALUE] },
      { u: 1e308, uStep: 1e308 },
      { v: -1e308, vStep: 1e308 },
    ];
    for (const patch of patches) {
      expect(() =>
        sampleParametricSurfaceDifferentials({
          ...basic,
          positionAt,
          ...patch,
        } as ParametricSurfaceDifferentialOptions),
      ).toThrow();
    }
    expect(positionAt).not.toHaveBeenCalled();
  });

  it.each([1, -1])(
    "allows finite clipping to rescue raw coordinate-plus-step overflow in direction %s",
    (sign) => {
      const positionAt = vi.fn((u: number, v: number) => ({ x: u / 2, y: v, z: 0 }));
      const result = sampleParametricSurfaceDifferentials({
        positionAt,
        u: sign * 1e308,
        v: 0,
        uStep: 1e308,
        vStep: 1,
        uRange: sign > 0 ? [0, Number.MAX_VALUE] : [-Number.MAX_VALUE, 0],
      });
      expect(result).toEqual({ du: { x: 0.5, y: 0, z: 0 }, dv: { x: 0, y: 1, z: 0 } });
      expect(positionAt).toHaveBeenCalledTimes(4);
      for (const call of positionAt.mock.calls) expect(call.every(Number.isFinite)).toBe(true);
    },
  );

  it("rejects nonfinite callback positions even when only an unused-looking component is invalid", () => {
    for (const bad of [NaN, Infinity, -Infinity, undefined, "0", null]) {
      expect(() =>
        sampleParametricSurfaceDifferentials({
          ...basic,
          positionAt: () => ({ x: 0, y: 0, z: bad }),
        } as unknown as ParametricSurfaceDifferentialOptions),
      ).toThrow();
    }
    for (const value of [null, undefined, [0, 0, 0], {}]) {
      expect(() =>
        sampleParametricSurfaceDifferentials({
          ...basic,
          positionAt: () => value,
        } as unknown as ParametricSurfaceDifferentialOptions),
      ).toThrow();
    }
  });

  it("rejects overflowed position differences before a finite-looking quotient could hide them", () => {
    for (const axis of ["u", "v"] as const) {
      expect(() =>
        sampleParametricSurfaceDifferentials({
          positionAt: (u, v) => ({
            x: Math.sign(axis === "u" ? u : v) * Number.MAX_VALUE,
            y: 0,
            z: 0,
          }),
          u: 0,
          v: 0,
          uStep: 1,
          vStep: 1,
        }),
      ).toThrow();
    }
  });

  it("rejects nonfinite differential quotients from finite positions and finite coordinate spans", () => {
    for (const axis of ["u", "v"] as const) {
      expect(() =>
        sampleParametricSurfaceDifferentials({
          positionAt: (u, v) => ({ x: Math.sign(axis === "u" ? u : v), y: 0, z: 0 }),
          u: 0,
          v: 0,
          uStep: Number.MIN_VALUE,
          vStep: Number.MIN_VALUE,
        }),
      ).toThrow();
    }
  });
});

describe("surface differential validation before callbacks", () => {
  it("validates every coordinate and explicit step before sampling either axis", () => {
    const positionAt = vi.fn(plane);
    for (const key of ["u", "v", "uStep", "vStep"] as const) {
      for (const value of [NaN, Infinity, -Infinity, undefined, null, "1"]) {
        expect(() =>
          sampleParametricSurfaceDifferentials({
            ...basic,
            positionAt,
            [key]: value,
          } as unknown as ParametricSurfaceDifferentialOptions),
        ).toThrow();
      }
    }
    for (const key of ["uStep", "vStep"] as const) {
      for (const value of [0, -1, -Number.MIN_VALUE]) {
        expect(() =>
          sampleParametricSurfaceDifferentials({ ...basic, positionAt, [key]: value }),
        ).toThrow();
      }
    }
    expect(positionAt).not.toHaveBeenCalled();
    expect(() =>
      sampleParametricSurfaceDifferentials(null as unknown as ParametricSurfaceDifferentialOptions),
    ).toThrow();
    expect(() =>
      sampleParametricSurfaceDifferentials({
        ...basic,
        positionAt: null,
      } as unknown as ParametricSurfaceDifferentialOptions),
    ).toThrow();
  });

  it("validates both range shapes, endpoints and query membership before invoking callbacks", () => {
    const positionAt = vi.fn(plane);
    for (const key of ["uRange", "vRange"] as const) {
      for (const value of [
        null,
        [],
        [0],
        [0, 1, 2],
        [0, 0],
        [1, 0],
        [NaN, 1],
        [-Infinity, 1],
        [0, Infinity],
        ["0", 1],
      ]) {
        expect(() =>
          sampleParametricSurfaceDifferentials({
            ...basic,
            positionAt,
            [key]: value,
          } as unknown as ParametricSurfaceDifferentialOptions),
        ).toThrow();
      }
    }
    for (const patch of [
      { u: -1, uRange: [0, 1] },
      { u: 2, uRange: [0, 1] },
      { v: -1, vRange: [0, 1] },
      { v: 2, vRange: [0, 1] },
    ]) {
      expect(() =>
        sampleParametricSurfaceDifferentials({
          ...basic,
          positionAt,
          ...patch,
        } as ParametricSurfaceDifferentialOptions),
      ).toThrow();
    }
    expect(positionAt).not.toHaveBeenCalled();
  });
});
