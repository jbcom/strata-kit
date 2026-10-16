import { describe, expect, it, vi } from "vitest";
import {
  bakeTangentNormalMap,
  packSignedVector8,
  type TangentNormalMapOptions,
} from "../src/index.ts";
import { bakeTangentNormalMap as bakeFromMaterials } from "../src/materials.ts";

const neutral = [128, 128, 255, 255];
const base = {
  width: 1,
  height: 1,
  heights: [0],
  spacingX: 1,
  spacingY: 1,
  edgeX: "clamp",
  edgeY: "clamp",
  normalYSign: -1,
} as const;

function encodedUnit(vector: readonly [number, number, number]) {
  const length = Math.hypot(...vector);
  return [...vector.map((value) => Math.round(((value / length) * 0.5 + 0.5) * 255)), 255];
}

function expectUniform(bytes: Uint8Array, expected: readonly number[], pixels: number) {
  expect(bytes).toBeInstanceOf(Uint8Array);
  expect(bytes.length).toBe(pixels * 4);
  for (let pixel = 0; pixel < pixels; pixel++)
    expect([...bytes.subarray(pixel * 4, pixel * 4 + 4)]).toEqual(expected);
}

describe("tangent normal maps from explicit height grids", () => {
  it("exports a callable bake from root and materials", () => {
    expect(typeof bakeTangentNormalMap).toBe("function");
    expect(bakeFromMaterials).toBe(bakeTangentNormalMap);
  });

  it.each(["wrap", "clamp"] as const)(
    "makes exact neutral bytes for a constant %s grid",
    (edge) => {
      expectUniform(
        bakeTangentNormalMap({
          ...base,
          width: 5,
          height: 3,
          heights: Array(15).fill(123.5),
          edgeX: edge,
          edgeY: edge,
        }),
        neutral,
        15,
      );
    },
  );

  it("uses anisotropic physical spacing and one-sided clamp slopes at every plane pixel", () => {
    // h(i,j)=7+1.5*i+4*j with physical spacings2 and4 has slopes(.75,1).
    const width = 5,
      height = 3;
    const heights = Array.from(
      { length: width * height },
      (_, index) => 7 + 1.5 * (index % width) + 4 * Math.floor(index / width),
    );
    const bytes = bakeTangentNormalMap({
      ...base,
      width,
      height,
      heights,
      spacingX: 2,
      spacingY: 4,
    });
    expectUniform(bytes, encodedUnit([-0.75, -1, 1]), width * height);
  });

  it("flips only green for the declared row-height sign", () => {
    const options = { ...base, width: 3, height: 3, heights: [0, 1, 2, 2, 3, 4, 4, 5, 6] };
    const negative = bakeTangentNormalMap(options);
    const positive = bakeTangentNormalMap({ ...options, normalYSign: 1 });
    expectUniform(negative, encodedUnit([-1, -2, 1]), 9);
    expectUniform(positive, encodedUnit([-1, 2, 1]), 9);
    for (let pixel = 0; pixel < 9; pixel++) {
      expect(positive[pixel * 4]).toBe(negative[pixel * 4]);
      expect(positive[pixel * 4 + 2]).toBe(negative[pixel * 4 + 2]);
    }
  });

  it("applies signed height scale and defaults it to one", () => {
    const options = { ...base, width: 3, height: 3, heights: [0, 1, 2, 2, 3, 4, 4, 5, 6] };
    expect(bakeTangentNormalMap(options)).toEqual(
      bakeTangentNormalMap({ ...options, heightScale: 1 }),
    );
    expectUniform(
      bakeTangentNormalMap({ ...options, heightScale: 2 }),
      encodedUnit([-2, -4, 1]),
      9,
    );
    expectUniform(bakeTangentNormalMap({ ...options, heightScale: -2 }), encodedUnit([2, 4, 1]), 9);
    expectUniform(bakeTangentNormalMap({ ...options, heightScale: 0 }), neutral, 9);
  });

  it("matches independently derived discrete periodic trigonometric derivatives at seams and interiors", () => {
    const width = 8,
      height = 6,
      amplitudeX = 0.75,
      amplitudeY = 0.4;
    const spacingX = 0.3,
      spacingY = 1.7,
      heightScale = 1.25;
    const wx = (2 * Math.PI) / width,
      wy = (2 * Math.PI) / height;
    const heights = Array.from(
      { length: width * height },
      (_, index) =>
        amplitudeX * Math.sin(wx * (index % width)) +
        amplitudeY * Math.cos(wy * Math.floor(index / width)),
    );
    const bytes = bakeTangentNormalMap({
      ...base,
      width,
      height,
      heights,
      spacingX,
      spacingY,
      heightScale,
      edgeX: "wrap",
      edgeY: "wrap",
    });
    for (let row = 0; row < height; row++) {
      for (let column = 0; column < width; column++) {
        // sin(t+w)-sin(t-w)=2*cos(t)*sin(w), not2*w*cos(t).
        const sx = (heightScale * amplitudeX * Math.sin(wx) * Math.cos(wx * column)) / spacingX;
        const sy = (-heightScale * amplitudeY * Math.sin(wy) * Math.sin(wy * row)) / spacingY;
        const length = Math.hypot(sx, sy, 1);
        const expected = [-sx / length, -sy / length, 1 / length];
        const offset = (row * width + column) * 4;
        expected.forEach((value, channel) => {
          const decoded = 2 * (bytes[offset + channel] / 255) - 1;
          expect(Math.abs(decoded - value)).toBeLessThanOrEqual(1 / 255 + 32 * Number.EPSILON);
        });
        expect(bytes[offset + 3]).toBe(255);
      }
    }
  });

  it("distinguishes wrapped discontinuous edges from clamped one-sided edges", () => {
    const options = { ...base, width: 4, heights: [0, 1, 2, 3] };
    expectUniform(bakeTangentNormalMap(options), encodedUnit([-1, 0, 1]), 4);
    const wrapped = bakeTangentNormalMap({ ...options, edgeX: "wrap" });
    expect([...wrapped.subarray(0, 4)]).toEqual(encodedUnit([1, 0, 1]));
    expect([...wrapped.subarray(4, 8)]).toEqual(encodedUnit([-1, 0, 1]));
    expect([...wrapped.subarray(12, 16)]).toEqual(encodedUnit([1, 0, 1]));
  });

  it("gives coincident wrapped neighbors zero slope on a two-sample axis", () => {
    expectUniform(
      bakeTangentNormalMap({ ...base, width: 2, heights: [0, 2], edgeX: "wrap" }),
      neutral,
      2,
    );
    expectUniform(
      bakeTangentNormalMap({ ...base, width: 2, heights: [0, 2] }),
      encodedUnit([-2, 0, 1]),
      2,
    );
    expectUniform(
      bakeTangentNormalMap({ ...base, height: 2, heights: [0, 2], edgeY: "wrap" }),
      neutral,
      2,
    );
    expectUniform(
      bakeTangentNormalMap({ ...base, height: 2, heights: [0, 2] }),
      encodedUnit([0, -2, 1]),
      2,
    );
  });

  it("keeps singleton axes flat without suppressing the other derivative", () => {
    expectUniform(
      bakeTangentNormalMap({ ...base, height: 3, heights: [0, 1, 2], spacingX: Number.MAX_VALUE }),
      [128, 37, 218, 255],
      3,
    );
    expectUniform(
      bakeTangentNormalMap({ ...base, width: 3, heights: [0, 1, 2], spacingY: Number.MAX_VALUE }),
      [37, 128, 218, 255],
      3,
    );
    expectUniform(
      bakeTangentNormalMap({
        ...base,
        heights: [Number.MAX_VALUE],
        spacingX: Number.MAX_VALUE,
        spacingY: Number.MAX_VALUE,
        heightScale: Number.MAX_VALUE,
      }),
      neutral,
      1,
    );
  });

  it("agrees with the existing byte codec for an independently normalized plane vector", () => {
    const vector = [-1 / Math.sqrt(3), -1 / Math.sqrt(3), 1 / Math.sqrt(3)];
    const bytes = bakeTangentNormalMap({
      ...base,
      width: 2,
      height: 2,
      heights: [0, 2, 3, 5],
      spacingX: 2,
      spacingY: 3,
    });
    expectUniform(bytes, [54, 54, 201, 255], 4);
    expect([...bytes.subarray(0, 4)]).toEqual([...packSignedVector8(vector)]);
  });
});

describe("normal bake ownership and snapshots", () => {
  it("returns fresh mutable buffers without retaining or mutating heights", () => {
    const heights = [5, 5, 5, 5];
    const options = { ...base, width: 2, height: 2, heights };
    const first = bakeTangentNormalMap(options),
      second = bakeTangentNormalMap(options);
    expect(first).not.toBe(second);
    expect(first.buffer).not.toBe(second.buffer);
    expect(heights).toEqual([5, 5, 5, 5]);
    heights[0] = 999;
    expectUniform(first, neutral, 4);
    first[0] = 0;
    expect(second[0]).toBe(128);
    expectUniform(
      bakeTangentNormalMap({ ...base, width: 2, heights: Object.freeze([0, 1]) }),
      encodedUnit([-1, 0, 1]),
      2,
    );
    expectUniform(
      bakeTangentNormalMap({ ...base, width: 2, heights: new Float32Array([0, 1]) }),
      encodedUnit([-1, 0, 1]),
      2,
    );
  });

  it("takes one sample snapshot and reads ArrayLike length once before stencils", () => {
    const input = [0, 2, 3, 5];
    const readers = input.map((value) => vi.fn().mockReturnValueOnce(value).mockReturnValue(1e6));
    const length = vi.fn(() => 4);
    const heights = Object.defineProperties(
      {},
      {
        length: { get: length },
        0: { get: readers[0] },
        1: { get: readers[1] },
        2: { get: readers[2] },
        3: { get: readers[3] },
      },
    ) as ArrayLike<number>;
    const bytes = bakeTangentNormalMap({
      ...base,
      width: 2,
      height: 2,
      heights,
      spacingX: 2,
      spacingY: 3,
    });
    expectUniform(bytes, [54, 54, 201, 255], 4);
    expect(length).toHaveBeenCalledTimes(1);
    for (const reader of readers) expect(reader).toHaveBeenCalledTimes(1);
  });

  it("captures every option control and heights reference once", () => {
    const values: TangentNormalMapOptions = {
      ...base,
      width: 2,
      height: 2,
      heights: [0, 2, 3, 5],
      spacingX: 2,
      spacingY: 3,
      heightScale: 1,
    };
    const readers = Object.fromEntries(
      Object.entries(values).map(([name, value]) => [name, vi.fn(() => value)]),
    );
    const options = Object.defineProperties(
      {},
      Object.fromEntries(Object.entries(readers).map(([name, get]) => [name, { get }])),
    ) as TangentNormalMapOptions;
    expectUniform(bakeTangentNormalMap(options), [54, 54, 201, 255], 4);
    for (const reader of Object.values(readers)) expect(reader).toHaveBeenCalledTimes(1);
  });
});

describe("normal bake finite arithmetic", () => {
  it("avoids overflowing an intermediate product when the final slope is finite", () => {
    expectUniform(
      bakeTangentNormalMap({
        ...base,
        width: 2,
        heights: [0, 1e308],
        heightScale: 1e308,
        spacingX: 1e308,
      }),
      [0, 128, 128, 255],
      2,
    );
  });

  it("avoids overflowing an intermediate quotient when scaling first is finite", () => {
    expectUniform(
      bakeTangentNormalMap({
        ...base,
        width: 2,
        heights: [0, 1e-15],
        heightScale: 1e-15,
        spacingX: Number.MIN_VALUE,
      }),
      [0, 128, 128, 255],
      2,
    );
  });

  it("rescales two finite extreme slopes whose combined norm would overflow", () => {
    expectUniform(
      bakeTangentNormalMap({ ...base, width: 2, height: 2, heights: [-1.5e308, 0, 0, 1.5e308] }),
      [37, 37, 128, 255],
      4,
    );
  });

  it("skips unused zero-scale differences and spans while validating all heights", () => {
    const options = {
      ...base,
      width: 3,
      height: 2,
      heights: [-Number.MAX_VALUE, Number.MAX_VALUE, 0, Number.MAX_VALUE, -Number.MAX_VALUE, 0],
      spacingX: Number.MAX_VALUE,
      spacingY: Number.MAX_VALUE,
      heightScale: 0,
    };
    expectUniform(bakeTangentNormalMap(options), neutral, 6);
    expect(() => bakeTangentNormalMap({ ...options, heights: [0, 0, 0, 0, 0, NaN] })).toThrow();
  });

  it("does not form differences or double-spacing spans for coincident wrapped neighbors", () => {
    expectUniform(
      bakeTangentNormalMap({
        ...base,
        width: 2,
        height: 2,
        heights: [-Number.MAX_VALUE, Number.MAX_VALUE, Number.MAX_VALUE, -Number.MAX_VALUE],
        spacingX: Number.MAX_VALUE,
        spacingY: Number.MAX_VALUE,
        edgeX: "wrap",
        edgeY: "wrap",
        heightScale: Number.MAX_VALUE,
      }),
      neutral,
      4,
    );
  });

  it("permits a finite slope to round to zero without an arbitrary spacing or scale floor", () => {
    expectUniform(
      bakeTangentNormalMap({
        ...base,
        width: 2,
        heights: [0, 1e-300],
        heightScale: 1e-300,
        spacingX: 1e-200,
      }),
      neutral,
      2,
    );
  });

  it("rejects actually used overflowed differences, spans, or slopes", () => {
    expect(() =>
      bakeTangentNormalMap({
        ...base,
        width: 2,
        heights: [-Number.MAX_VALUE, Number.MAX_VALUE],
        heightScale: 1e-308,
      }),
    ).toThrow();
    expect(() =>
      bakeTangentNormalMap({ ...base, width: 3, heights: [0, 1, 2], spacingX: Number.MAX_VALUE }),
    ).toThrow();
    expect(() =>
      bakeTangentNormalMap({
        ...base,
        width: 2,
        heights: [0, Number.MAX_VALUE],
        spacingX: Number.MIN_VALUE,
      }),
    ).toThrow();
  });
});

describe("normal bake validation and resource limits", () => {
  it("rejects invalid dimensions and excessive pixel counts before sample reads", () => {
    const sample = vi.fn(() => {
      throw new Error("Sample access must follow dimension and count checks");
    });
    for (const [width, height] of [
      [0, 1],
      [1, 0],
      [-1, 1],
      [1.5, 1],
      [NaN, 1],
      [Infinity, 1],
      [Number.MAX_SAFE_INTEGER + 1, 1],
      [Number.MAX_SAFE_INTEGER, 2],
      [4194305, 1],
      [2048, 2049],
    ]) {
      const heights = Object.defineProperties(
        {},
        { length: { value: width * height }, 0: { get: sample } },
      ) as ArrayLike<number>;
      expect(() => bakeTangentNormalMap({ ...base, width, height, heights })).toThrow();
    }
    expect(sample).not.toHaveBeenCalled();
  });

  it("requires exact source length before reading any heights", () => {
    const sample = vi.fn(() => {
      throw new Error("Sample access must follow exact length check");
    });
    for (const count of [0, 3, 5, 4.5, NaN, Infinity, "4", null, undefined]) {
      const length = vi.fn(() => count);
      const heights = Object.defineProperties({}, { length: { get: length }, 0: { get: sample } });
      expect(() =>
        bakeTangentNormalMap({ ...base, width: 2, height: 2, heights: heights as never }),
      ).toThrow();
      expect(length).toHaveBeenCalledTimes(1);
    }
    expect(sample).not.toHaveBeenCalled();
  });

  it("validates all controls before source sample access", () => {
    const sample = vi.fn(() => {
      throw new Error("Invalid controls must precede sample reads");
    });
    const heights = Object.defineProperties(
      {},
      { length: { value: 1 }, 0: { get: sample } },
    ) as ArrayLike<number>;
    const patches = [
      ...[0, -0, -1, NaN, Infinity, -Infinity, "1", null, undefined].flatMap((value) => [
        { spacingX: value },
        { spacingY: value },
      ]),
      ...[NaN, Infinity, -Infinity, "1", null].map((heightScale) => ({ heightScale })),
      ...[undefined, null, "repeat", 0].flatMap((edge) => [{ edgeX: edge }, { edgeY: edge }]),
      ...[undefined, null, 0, 2, -2, NaN, "-1"].map((normalYSign) => ({ normalYSign })),
    ];
    for (const patch of patches)
      expect(() => bakeTangentNormalMap({ ...base, heights, ...patch } as never)).toThrow();
    expect(sample).not.toHaveBeenCalled();
  });

  it("rejects missing records and every nonfinite or nonnumeric sample, including zero scale", () => {
    for (const options of [null, undefined])
      expect(() => bakeTangentNormalMap(options as never)).toThrow();
    for (const heights of [null, undefined])
      expect(() => bakeTangentNormalMap({ ...base, heights } as never)).toThrow();
    for (const value of [NaN, Infinity, -Infinity, "0", null, undefined]) {
      expect(() => bakeTangentNormalMap({ ...base, heights: [value] } as never)).toThrow();
      expect(() =>
        bakeTangentNormalMap({ ...base, heights: [value], heightScale: 0 } as never),
      ).toThrow();
    }
  });
});
