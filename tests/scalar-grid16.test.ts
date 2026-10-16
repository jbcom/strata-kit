import { runInNewContext } from "node:vm";
import { describe, expect, it, vi } from "vitest";
import {
  packScalarGrid16 as packFromRoot,
  sampleScalarGrid16 as sampleFromRoot,
} from "../src/index.ts";
import {
  packScalarGrid16,
  sampleScalarGrid16,
  type ScalarGrid16,
  type ScalarGrid16Input,
} from "../src/terrain.ts";

function handGrid(
  width: number,
  height: number,
  codes: readonly number[],
  min = 0,
  range = 1,
): ScalarGrid16 {
  return {
    width,
    height,
    min,
    range,
    data: new Uint8Array(codes.flatMap((code) => [Math.floor(code / 256), code % 256])),
  };
}

const basic: ScalarGrid16Input = { width: 2, height: 1, values: [0, 1], min: 0, range: 1 };

describe("scalar grid 16 public encoding contract", () => {
  it("exposes the same codec functions through the public root and terrain entry points", () => {
    expect(packFromRoot).toBe(packScalarGrid16);
    expect(sampleFromRoot).toBe(sampleScalarGrid16);
    const grid = packFromRoot(basic);
    expect(sampleFromRoot(grid, 1, 0)).toBe(1);
  });

  it("packs documented signed endpoints and midpoint in high-byte-first row-major order", () => {
    const grid = packScalarGrid16({
      width: 3,
      height: 1,
      values: [-10, 10, 0],
      min: -10,
      range: 20,
    });
    expect([...grid.data]).toEqual([0, 0, 255, 255, 128, 0]);
    expect(grid.width).toBe(3);
    expect(grid.height).toBe(1);
    expect(grid.min).toBe(-10);
    expect(grid.range).toBe(20);
    expect(sampleScalarGrid16(grid, 0, 0)).toBe(-10);
    expect(sampleScalarGrid16(grid, 1, 0)).toBe(10);
    expect(sampleScalarGrid16(grid, 2, 0)).toBeCloseTo(10 / 65535, 12);
  });

  it("encodes the byte carry and rounds an exact half-code upward", () => {
    const grid = packScalarGrid16({
      width: 4,
      height: 1,
      values: [255, 256, 257, 0.5],
      min: 0,
      range: 65535,
    });
    expect([...grid.data]).toEqual([0, 255, 1, 0, 1, 1, 0, 1]);
  });

  it("clamps finite out-of-range values before subtraction or scaling can overflow", () => {
    const grid = packScalarGrid16({
      width: 4,
      height: 1,
      values: [-Number.MAX_VALUE, -10, 10, Number.MAX_VALUE],
      min: -10,
      range: 20,
    });
    expect([...grid.data]).toEqual([0, 0, 0, 0, 255, 255, 255, 255]);
  });

  it("encodes explicit range endpoints even when their subtraction loses range precision", () => {
    const min = 1;
    const range = 3e-16;
    const maximum = min + range;
    expect(maximum).toBeGreaterThan(min);
    expect((maximum - min) / range).toBeLessThan(0.75);
    const grid = packScalarGrid16({ width: 2, height: 1, values: [min, maximum], min, range });
    expect([...grid.data]).toEqual([0, 0, 255, 255]);
    expect(sampleScalarGrid16(grid, 0, 0)).toBe(min);
    expect(sampleScalarGrid16(grid, 1, 0)).toBe(maximum);
  });

  it("accepts an ArrayLike source and owns frozen copied metadata with mutable independent bytes", () => {
    const values = { 0: 0, 1: 0.5, 2: 1, length: 3 };
    const input: ScalarGrid16Input = { width: 3, height: 1, values, min: 0, range: 1 };
    const first = packScalarGrid16(input);
    const second = packScalarGrid16(input);
    expect(Object.isFrozen(first)).toBe(true);
    expect(first).not.toBe(second);
    expect(first.data).not.toBe(second.data);
    expect(first.data).toBeInstanceOf(Uint8Array);
    expect(first.data.byteLength).toBe(6);
    values[0] = 1;
    input.width = 1;
    input.min = 100;
    input.range = 100;
    expect(first.width).toBe(3);
    expect(first.min).toBe(0);
    expect(first.range).toBe(1);
    expect(sampleScalarGrid16(first, 0, 0)).toBe(0);
    expect(Reflect.set(first, "width", 99)).toBe(false);
    first.data[0] = 255;
    first.data[1] = 255;
    expect(sampleScalarGrid16(first, 0, 0)).toBe(1);
    expect(sampleScalarGrid16(second, 0, 0)).toBe(0);
  });

  it("copies frozen numeric input without retaining or changing it", () => {
    const values = Object.freeze([-1, 0, 1]);
    const input = Object.freeze({ width: 3, height: 1, values, min: -1, range: 2 });
    const grid = packScalarGrid16(input);
    expect(values).toEqual([-1, 0, 1]);
    expect(grid.data).toEqual(new Uint8Array([0, 0, 128, 0, 255, 255]));
    grid.data.fill(0);
    expect(values).toEqual([-1, 0, 1]);
  });

  it("bounds sample-center quantization error by one half of a code step", () => {
    const values = [-100, -33.7, 0, 0.1, 123.456, 500, 899.99, 900];
    const grid = packScalarGrid16({
      width: values.length,
      height: 1,
      values,
      min: -100,
      range: 1000,
    });
    values.forEach((value, column) => {
      expect(Math.abs(sampleScalarGrid16(grid, column, 0) - value)).toBeLessThanOrEqual(
        1000 / 131070,
      );
    });
  });

  it.each([1e-200, 1, 1e150])("preserves normalized codes under range scale %s", (scale) => {
    const min = 2 * scale;
    const range = 4 * scale;
    const grid = packScalarGrid16({
      width: 4,
      height: 1,
      values: [min, min + range / 4, min + (3 * range) / 4, min + range],
      min,
      range,
    });
    expect([...grid.data]).toEqual([0, 0, 64, 0, 191, 255, 255, 255]);
    expect(sampleScalarGrid16(grid, 0, 0) / scale).toBeCloseTo(2, 12);
    expect(sampleScalarGrid16(grid, 3, 0) / scale).toBeCloseTo(6, 12);
  });

  it("supports a representably distinct subnormal range without a reciprocal range floor", () => {
    const grid = packScalarGrid16({
      width: 2,
      height: 1,
      values: [0, Number.MIN_VALUE],
      min: 0,
      range: Number.MIN_VALUE,
    });
    expect([...grid.data]).toEqual([0, 0, 255, 255]);
    expect(sampleScalarGrid16(grid, 0, 0)).toBe(0);
    expect(sampleScalarGrid16(grid, 1, 0)).toBe(Number.MIN_VALUE);
  });
});

describe("scalar grid 16 independent sampling", () => {
  it("samples genuine Uint8Array bytes created in another JavaScript realm", () => {
    const data: Uint8Array = runInNewContext("new Uint8Array([0, 255, 1, 0, 1, 1, 255, 255])");
    expect(data instanceof Uint8Array).toBe(false);
    expect(ArrayBuffer.isView(data)).toBe(true);
    const grid: ScalarGrid16 = { width: 2, height: 2, min: 13, range: 65535, data };
    expect(sampleScalarGrid16(grid, 0, 0)).toBe(268);
    expect(sampleScalarGrid16(grid, 1, 1)).toBe(65548);
    // At column 1/4, the decoded row codes are 255.25 and 16576.5.
    // Halfway down their average is 8415.875, before adding the minimum.
    expect(sampleScalarGrid16(grid, 0.25, 0.5)).toBeCloseTo(8428.875, 10);
  });

  it("decodes independently authored carry bytes rather than requiring candidate-packed data", () => {
    const grid: ScalarGrid16 = {
      width: 3,
      height: 1,
      min: 0,
      range: 65535,
      data: new Uint8Array([0, 255, 1, 0, 1, 1]),
    };
    expect(sampleScalarGrid16(grid, 0, 0)).toBe(255);
    expect(sampleScalarGrid16(grid, 1, 0)).toBe(256);
    expect(sampleScalarGrid16(grid, 2, 0)).toBe(257);
    expect(sampleScalarGrid16(grid, 1.5, 0)).toBeCloseTo(256.5, 12);
  });

  it("samples a 3-by-2 asymmetric row fixture with an independent 706.75 witness", () => {
    const grid = handGrid(3, 2, [0, 100, 400, 1000, 2000, 3000], 13, 65535);
    // At column 1.25 the rows are 175 and 2250 above min. One quarter
    // of the way down gives 3/4*175 + 1/4*2250 + 13 = 706.75.
    expect(sampleScalarGrid16(grid, 1.25, 0.25)).toBeCloseTo(706.75, 10);
    const expected = [
      [13, 113, 413],
      [1013, 2013, 3013],
    ];
    expected.forEach((row, r) => {
      row.forEach((value, c) => {
        expect(sampleScalarGrid16(grid, c, r)).toBeCloseTo(value, 10);
      });
    });
    expect(sampleScalarGrid16(grid, 0.5, 0)).toBeCloseTo(63, 10);
    expect(sampleScalarGrid16(grid, 2, 0.5)).toBeCloseTo(1713, 10);
    expect(sampleScalarGrid16(grid, 1.5, 1)).toBeCloseTo(2513, 10);
    expect(sampleScalarGrid16(grid, 0, 0.5)).toBeCloseTo(513, 10);
  });

  it("uses bilinear saddle values rather than nearest, triangular, or row-swapped interpolation", () => {
    const grid = handGrid(2, 2, [0, 65535, 65535, 0]);
    expect(sampleScalarGrid16(grid, 0.25, 0.25)).toBe(3 / 8);
    expect(sampleScalarGrid16(grid, 0.75, 0.25)).toBe(5 / 8);
    expect(sampleScalarGrid16(grid, 0.5, 0.5)).toBe(0.5);
    expect(sampleScalarGrid16(grid, 0.25, 0)).toBe(0.25);
    expect(sampleScalarGrid16(grid, 1, 0.25)).toBe(0.75);
  });

  it("clamps finite outside coordinates separately while retaining interpolation along the other axis", () => {
    const grid = handGrid(3, 2, [0, 100, 400, 1000, 2000, 3000], 13, 65535);
    for (const outside of [-Number.MAX_VALUE, -1]) {
      expect(sampleScalarGrid16(grid, outside, 0.5)).toBeCloseTo(513, 10);
      expect(sampleScalarGrid16(grid, 1.5, outside)).toBeCloseTo(263, 10);
    }
    for (const outside of [3, Number.MAX_VALUE]) {
      expect(sampleScalarGrid16(grid, outside, 0.5)).toBeCloseTo(1713, 10);
      expect(sampleScalarGrid16(grid, 1.5, outside)).toBeCloseTo(2513, 10);
    }
    expect(sampleScalarGrid16(grid, -1, -1)).toBe(13);
    expect(sampleScalarGrid16(grid, Number.MAX_VALUE, Number.MAX_VALUE)).toBeCloseTo(3013, 10);
  });

  it("supports singleton axes without reading a nonexistent neighbor", () => {
    const point = handGrid(1, 1, [257], -10, 65535);
    for (const [column, row] of [
      [0, 0],
      [-100, 100],
      [Number.MAX_VALUE, -Number.MAX_VALUE],
    ]) {
      expect(sampleScalarGrid16(point, column, row)).toBe(247);
    }
    const column = handGrid(1, 3, [0, 100, 400], 13, 65535);
    expect(sampleScalarGrid16(column, 123, 0.5)).toBeCloseTo(63, 10);
    expect(sampleScalarGrid16(column, -123, 1.5)).toBeCloseTo(263, 10);
    const row = handGrid(3, 1, [0, 100, 400], 13, 65535);
    expect(sampleScalarGrid16(row, 0.5, 123)).toBeCloseTo(63, 10);
    expect(sampleScalarGrid16(row, 1.5, -123)).toBeCloseTo(263, 10);
  });

  it("reads current caller-owned bytes without mutating data or metadata", () => {
    const data = new Uint8Array([0, 0, 255, 255]);
    const grid = Object.freeze({ width: 2, height: 1, data, min: -10, range: 20 });
    const before = data.slice();
    expect(sampleScalarGrid16(grid, 0.5, 0)).toBe(0);
    expect(data).toEqual(before);
    data[0] = 255;
    data[1] = 255;
    expect(sampleScalarGrid16(grid, 0.5, 0)).toBe(10);
    expect(grid.width).toBe(2);
    expect(grid.min).toBe(-10);
    expect(grid.range).toBe(20);
  });
});

describe("scalar grid 16 validation and resource bounds", () => {
  it.each(["width", "height"] as const)(
    "accepts the inclusive 4097 limit on the %s axis with a small singleton fixture",
    (axis) => {
      const input = { width: 1, height: 1, values: new Float64Array(4097), min: 0, range: 1 };
      input[axis] = 4097;
      input.values[4096] = 1;
      const grid = packScalarGrid16(input);
      expect(grid.data.length).toBe(8194);
      expect(
        sampleScalarGrid16(grid, axis === "width" ? 4096 : 0, axis === "height" ? 4096 : 0),
      ).toBe(1);
    },
  );

  it("rejects invalid dimensions before reading source values or allocating their grid", () => {
    const readLength = vi.fn(() => 0);
    const readSample = vi.fn(() => 0);
    const values = Object.defineProperties(
      {},
      { length: { get: readLength }, 0: { get: readSample } },
    ) as ArrayLike<number>;
    for (const invalid of [
      0,
      -1,
      1.5,
      4098,
      Number.MAX_SAFE_INTEGER,
      Number.MAX_SAFE_INTEGER + 1,
      NaN,
      Infinity,
    ]) {
      expect(() => packScalarGrid16({ ...basic, width: invalid, values })).toThrow();
      expect(() => packScalarGrid16({ ...basic, height: invalid, values })).toThrow();
    }
    expect(readSample).not.toHaveBeenCalled();
  });

  it("requires the exact source sample count and finite numeric values", () => {
    for (const values of [
      [],
      [0],
      [0, 1, 2],
      { 0: 0, 1: 1, length: 2.5 },
      { length: -1 },
      null,
      undefined,
    ]) {
      expect(() =>
        packScalarGrid16({ ...basic, values } as unknown as ScalarGrid16Input),
      ).toThrow();
    }
    for (const value of [NaN, Infinity, -Infinity, "0", undefined, null]) {
      expect(() =>
        packScalarGrid16({ ...basic, values: [0, value] } as unknown as ScalarGrid16Input),
      ).toThrow();
    }
    expect(() => packScalarGrid16(null as unknown as ScalarGrid16Input)).toThrow();
  });

  it("rejects nonfinite, nonpositive, overflowed, or representationally collapsed ranges", () => {
    const invalid = [
      { min: NaN },
      { min: Infinity },
      { min: -Infinity },
      { min: "0" },
      { range: NaN },
      { range: Infinity },
      { range: -Infinity },
      { range: 0 },
      { range: -1 },
      { range: "1" },
      { min: Number.MAX_VALUE, range: Number.MAX_VALUE },
      { min: 1, range: Number.MIN_VALUE },
      { min: 1e200, range: 1 },
      { min: -1e200, range: 1 },
    ];
    for (const patch of invalid) {
      expect(() =>
        packScalarGrid16({ ...basic, ...patch } as unknown as ScalarGrid16Input),
      ).toThrow();
      expect(() =>
        sampleScalarGrid16(
          { ...handGrid(2, 1, [0, 65535]), ...patch } as unknown as ScalarGrid16,
          0,
          0,
        ),
      ).toThrow();
    }
  });

  it("validates sampler metadata and exact Uint8Array storage before coordinate lookup", () => {
    const valid = handGrid(2, 1, [0, 65535]);
    for (const patch of [
      { width: 0 },
      { height: 0 },
      { width: 1.5 },
      { height: 4098 },
      { data: new Uint8Array(3) },
      { data: new Uint8Array(5) },
      { data: new Int8Array(4) },
      { data: new Uint8ClampedArray(4) },
      { data: new Uint16Array(4) },
      { data: new Float32Array(4) },
      { data: new DataView(new ArrayBuffer(4)) },
      { data: [0, 0, 255, 255] },
      { data: null },
    ]) {
      expect(() =>
        sampleScalarGrid16({ ...valid, ...patch } as unknown as ScalarGrid16, 0, 0),
      ).toThrow();
    }
    expect(() => sampleScalarGrid16(null as unknown as ScalarGrid16, 0, 0)).toThrow();
    for (const coordinate of [NaN, Infinity, -Infinity, "0", null, undefined]) {
      expect(() => sampleScalarGrid16(valid, coordinate as unknown as number, 0)).toThrow();
      expect(() => sampleScalarGrid16(valid, 0, coordinate as unknown as number)).toThrow();
    }
  });
});
