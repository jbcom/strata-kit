import { describe, expect, it } from "vitest";
import {
  composeScalarField2D,
  transformScalarField2D,
  createDirectionalField2D,
  createSmoothMask2D,
} from "../src/index.ts";

describe("caller-defined scalar fields", () => {
  it("preserves observable ordered arithmetic and endpoint callback evaluation", () => {
    expect(
      composeScalarField2D(2, [
        { operation: "add", field: 3, gain: 2 },
        { operation: "multiply", field: 4 },
        { operation: "blend", field: 16, weight: 0.25 },
      ])(0, 0),
    ).toBe(28);
    const trace: string[] = [];
    const field = composeScalarField2D(() => {
      trace.push("base");
      return 5;
    }, [
      {
        operation: "blend",
        field: () => {
          trace.push("target");
          return 9;
        },
        weight: () => {
          trace.push("weight");
          return 0;
        },
      },
    ]);
    expect(field(0, 0)).toBe(5);
    expect(trace).toEqual(["base", "target", "weight"]);
  });

  it("captures the recipe while borrowing deterministic sampler identities", () => {
    const layer = { operation: "add" as const, field: 3, gain: -2 };
    const layers = [layer];
    const field = composeScalarField2D((x, z) => x + z, layers);
    layer.field = 99;
    layer.gain = 99;
    layers.length = 0;
    expect(field(10, 2)).toBe(6);
    expect(field(-2, 1)).toBe(-7);
    expect(field(10, 2)).toBe(6);
  });

  it("copies mirrored and constant-axis affine domains", () => {
    const scale: [number, number] = [2, -3];
    const offset: [number, number] = [-1, 4];
    const field = transformScalarField2D((x, z) => x + 10 * z, { scale, offset });
    scale[0] = 100;
    offset[1] = 100;
    expect(field(3, 2)).toBe(-15);
    expect(transformScalarField2D((x, z) => x + z, { scale: [0, 0], offset: [2, 3] })(9, -9)).toBe(
      5,
    );
  });

  it("keeps displacement arithmetic separate from cycle phase", () => {
    const direction: [number, number] = [0.6, 0.8];
    const offsets = [3, 4];
    const field = createDirectionalField2D({
      direction,
      wavelength: 2,
      displacement: offsets,
      phase: 1,
      profile: (coordinate) => ({ value: coordinate, derivative: 1 }),
    });
    direction[0] = 0;
    offsets[0] = 100;
    expect(field(10, 20)).toBe(15.5);
    const ordered = createDirectionalField2D({
      direction: [1, 0],
      wavelength: 1,
      displacement: [-1e16, 1],
      profile: (coordinate) => ({ value: coordinate, derivative: 1 }),
    });
    expect(ordered(1e16, 0)).toBe(1);
  });

  it("uses radial smooth transitions including reversed edges", () => {
    const radial = createSmoothMask2D({ shape: { kind: "radial", center: [0, 0] }, edges: [2, 4] });
    expect(radial(0, 0)).toBe(0);
    expect(radial(3, 0)).toBe(0.5);
    expect(radial(3, 4)).toBe(1);
    const reversed = createSmoothMask2D({
      shape: { kind: "radial", center: [0, 0] },
      edges: [4, 2],
    });
    expect(reversed(0, 0)).toBe(1);
    expect(reversed(3, 0)).toBe(0.5);
    expect(reversed(3, 4)).toBe(0);
  });

  it("retains the box-max corner contour instead of Euclidean distance", () => {
    const shape = {
      kind: "box-max" as const,
      center: [1, -2] as [number, number],
      halfExtents: [2, 3] as [number, number],
    };
    const edges: [number, number] = [0, 2];
    const mask = createSmoothMask2D({ shape, edges });
    shape.center[0] = 100;
    shape.halfExtents[0] = 100;
    edges[1] = 100;
    expect(mask(4, 2)).toBe(0.5);
    expect(mask(1, -2)).toBe(0);
    expect(mask(5, -2)).toBe(1);
  });

  it("rejects nonfinite intermediate and callback values", () => {
    expect(() => composeScalarField2D(Infinity, [])).toThrow();
    expect(() => composeScalarField2D(() => NaN, [])(0, 0)).toThrow();
    expect(() =>
      composeScalarField2D(Number.MAX_VALUE, [{ operation: "multiply", field: 2 }])(0, 0),
    ).toThrow();
    expect(() =>
      composeScalarField2D(1, [{ operation: "blend", field: 2, weight: 1.1 }])(0, 0),
    ).toThrow();
    expect(() => transformScalarField2D(() => 1, { scale: [2, 1] })(Number.MAX_VALUE, 0)).toThrow();
    expect(() =>
      createDirectionalField2D({
        direction: [1, 0],
        wavelength: 1,
        profile: () => ({ value: 1, derivative: Infinity }),
      })(0, 0),
    ).toThrow();
    expect(() =>
      createSmoothMask2D({ shape: { kind: "radial", center: [0, 0] }, edges: [0, 1] })(Infinity, 0),
    ).toThrow();
  });

  it("rejects malformed, sparse or oversized recipes before sampling", () => {
    expect(() => composeScalarField2D(1, new Array(2))).toThrow();
    expect(() =>
      composeScalarField2D(
        1,
        Array.from({ length: 65 }, () => ({ operation: "add" as const, field: 1 })),
      ),
    ).toThrow();
    expect(() =>
      createDirectionalField2D({
        direction: [2, 0],
        wavelength: 1,
        profile: (coordinate) => ({ value: coordinate, derivative: 1 }),
      }),
    ).toThrow();
    expect(() =>
      createDirectionalField2D({
        direction: [1, 0],
        wavelength: 1,
        displacement: new Array(1),
        profile: (coordinate) => ({ value: coordinate, derivative: 1 }),
      }),
    ).toThrow();
    expect(() =>
      createSmoothMask2D({ shape: { kind: "radial", center: [0, 0] }, edges: [1, 1] }),
    ).toThrow();
    expect(() =>
      createSmoothMask2D({
        shape: { kind: "box-max", center: [0, 0], halfExtents: [0, 1] },
        edges: [0, 1],
      }),
    ).toThrow();
  });
});
