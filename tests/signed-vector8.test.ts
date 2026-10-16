import { runInNewContext } from "node:vm";
import { describe, expect, it, vi } from "vitest";
import { decodeSignedVector8, packSignedVector8, signedVector8Glsl } from "../src/index.ts";
import { signedVector8Glsl as glslFromShaders } from "../src/shaders.ts";
import {
  decodeSignedVector8 as decodeFromTerrain,
  packSignedVector8 as packFromTerrain,
} from "../src/terrain.ts";

function normalize(vector: { x: number; y: number; z: number }) {
  const length = Math.hypot(vector.x, vector.y, vector.z);
  return { x: vector.x / length, y: vector.y / length, z: vector.z / length };
}

function mix(
  first: { x: number; y: number; z: number },
  second: { x: number; y: number; z: number },
  weight: number,
) {
  return {
    x: first.x * (1 - weight) + second.x * weight,
    y: first.y * (1 - weight) + second.y * weight,
    z: first.z * (1 - weight) + second.z * weight,
  };
}

describe("raw signed-vector byte public contract", () => {
  it("exports callable codecs from root/terrain and a shared GLSL string from root/shaders", () => {
    expect(typeof packSignedVector8).toBe("function");
    expect(typeof decodeSignedVector8).toBe("function");
    expect(packFromTerrain).toBe(packSignedVector8);
    expect(decodeFromTerrain).toBe(decodeSignedVector8);
    expect(typeof signedVector8Glsl).toBe("string");
    expect(signedVector8Glsl.length).toBeGreaterThan(0);
    expect(glslFromShaders).toBe(signedVector8Glsl);
  });

  it("packs unequal signed XYZ triples in caller order with four-byte opaque samples", () => {
    const bytes = packSignedVector8([-1, -0.5, 0, 0.25, 0.5, 0.75, 0.75, -0.25, 1]);
    expect(bytes).toBeInstanceOf(Uint8Array);
    expect(bytes.byteLength).toBe(12);
    expect([...bytes]).toEqual([0, 64, 128, 255, 159, 191, 223, 255, 223, 96, 255, 255]);
  });

  it("maps both exact endpoints and signed zero, rounding the zero half-code upward", () => {
    expect([...packSignedVector8([-1, 0, 1, -0, -1, 1])]).toEqual([
      0, 128, 255, 255, 128, 0, 255, 255,
    ]);
  });

  it("accepts zero and nonunit vectors without normalization or a unit-length precondition", () => {
    const bytes = packSignedVector8([0, 0, 0, 0, 0.25, 0]);
    expect([...bytes]).toEqual([128, 128, 128, 255, 128, 159, 128, 255]);
    const zero = decodeSignedVector8(bytes, 0);
    expect(zero.x).toBeCloseTo(1 / 255, 15);
    expect(zero.y).toBeCloseTo(1 / 255, 15);
    expect(zero.z).toBeCloseTo(1 / 255, 15);
    expect(Math.hypot(zero.x, zero.y, zero.z)).toBeGreaterThan(0);
    const nonunit = decodeSignedVector8(bytes, 1);
    expect(nonunit.y).toBeCloseTo(63 / 255, 15);
    expect(Math.hypot(nonunit.x, nonunit.y, nonunit.z)).toBeLessThan(0.26);
  });

  it("retains the small raw quantization tilt of an axis-aligned unit vector", () => {
    const bytes = packSignedVector8([0, 1, 0]);
    expect([...bytes]).toEqual([128, 255, 128, 255]);
    const decoded = decodeSignedVector8(bytes, 0);
    expect(decoded.x).toBeCloseTo(1 / 255, 15);
    expect(decoded.y).toBe(1);
    expect(decoded.z).toBeCloseTo(1 / 255, 15);
    expect(Math.hypot(decoded.x, decoded.y, decoded.z)).toBeGreaterThan(1);
  });

  it("accepts ordinary ArrayLike and Float32 inputs without changing or retaining them", () => {
    const values = { 0: -1, 1: 0, 2: 1, length: 3 };
    const first = packSignedVector8(values);
    const second = packSignedVector8(values);
    values[0] = 1;
    values.length = 0;
    expect([...first]).toEqual([0, 128, 255, 255]);
    expect(second).not.toBe(first);
    expect(second.buffer).not.toBe(first.buffer);
    first[0] = 255;
    expect([...second]).toEqual([0, 128, 255, 255]);
    const typed = new Float32Array([-0.5, 0.25, 0.75]);
    expect([...packSignedVector8(typed)]).toEqual([64, 159, 223, 255]);
    expect([...typed]).toEqual([-0.5, 0.25, 0.75]);
    expect([...packSignedVector8(Object.freeze([-1, 0, 1]))]).toEqual([0, 128, 255, 255]);
  });

  it("reads the ArrayLike length once for a successful pack", () => {
    const length = vi.fn(() => 6);
    const input = Object.defineProperty({ 0: -1, 1: 0, 2: 1, 3: 1, 4: 0, 5: -1 }, "length", {
      get: length,
    }) as unknown as ArrayLike<number>;
    expect([...packSignedVector8(input)]).toEqual([0, 128, 255, 255, 255, 128, 0, 255]);
    expect(length).toHaveBeenCalledTimes(1);
  });

  it("returns a fresh empty byte buffer for empty input", () => {
    const first = packSignedVector8([]);
    const second = packSignedVector8({ length: 0 });
    expect(first).toBeInstanceOf(Uint8Array);
    expect(first.length).toBe(0);
    expect(second.length).toBe(0);
    expect(first).not.toBe(second);
    expect(() => decodeSignedVector8(first, 0)).toThrow();
  });

  it("bounds component error for fixed axis, diagonal, and nonunit inputs", () => {
    const values = [
      0,
      1,
      0,
      3 / 5,
      4 / 5,
      0,
      1 / Math.sqrt(3),
      1 / Math.sqrt(3),
      1 / Math.sqrt(3),
      -0.91,
      0.173,
      0.49,
    ];
    const bytes = packSignedVector8(values);
    for (let index = 0; index < values.length / 3; index++) {
      const decoded = decodeSignedVector8(bytes, index);
      for (const [channel, value] of [decoded.x, decoded.y, decoded.z].entries()) {
        expect(Math.abs(value - values[index * 3 + channel])).toBeLessThanOrEqual(
          1 / 255 + 8 * Number.EPSILON,
        );
      }
    }
  });
});

describe("independent raw signed-vector decoding", () => {
  it("decodes authored bytes with XYZ channel order, four-byte stride, and ignored alpha", () => {
    const bytes = new Uint8Array([0, 128, 255, 17, 255, 0, 64, 0]);
    const first = decodeSignedVector8(bytes, 0);
    expect(first.x).toBe(-1);
    expect(first.y).toBeCloseTo(1 / 255, 15);
    expect(first.z).toBe(1);
    const second = decodeSignedVector8(bytes, 1);
    expect(second.x).toBe(1);
    expect(second.y).toBe(-1);
    expect(second.z).toBeCloseTo(-127 / 255, 15);
    bytes[3] = 255;
    bytes[7] = 233;
    expect(decodeSignedVector8(bytes, 0)).toEqual(first);
    expect(decodeSignedVector8(bytes, 1)).toEqual(second);
  });

  it("uses the view offset rather than interpreting its entire underlying buffer", () => {
    const backing = new Uint8Array([11, 22, 33, 44, 0, 255, 0, 1, 55, 66, 77, 88]);
    const view = backing.subarray(4, 8);
    expect(decodeSignedVector8(view, 0)).toEqual({ x: -1, y: 1, z: -1 });
    expect([...backing]).toEqual([11, 22, 33, 44, 0, 255, 0, 1, 55, 66, 77, 88]);
  });

  it("returns fresh independent vectors and observes later caller byte mutations", () => {
    const bytes = new Uint8Array([0, 255, 0, 255]);
    const first = decodeSignedVector8(bytes, 0);
    const second = decodeSignedVector8(bytes, 0);
    expect(first).not.toBe(second);
    expect(first).toEqual({ x: -1, y: 1, z: -1 });
    first.x = 0.5;
    expect(second.x).toBe(-1);
    bytes[0] = 255;
    expect(decodeSignedVector8(bytes, 0)).toEqual({ x: 1, y: 1, z: -1 });
    expect(second).toEqual({ x: -1, y: 1, z: -1 });
  });

  it("accepts a genuine Uint8Array from another JavaScript realm", () => {
    const bytes: Uint8Array = runInNewContext("new Uint8Array([255, 0, 128, 19])");
    expect(bytes instanceof Uint8Array).toBe(false);
    expect(ArrayBuffer.isView(bytes)).toBe(true);
    const vector = decodeSignedVector8(bytes, 0);
    expect(vector.x).toBe(1);
    expect(vector.y).toBe(-1);
    expect(vector.z).toBeCloseTo(1 / 255, 15);
  });

  it("leaves interpolation and final normalization to the caller", () => {
    const bytes = new Uint8Array([128, 255, 128, 255, 201, 201, 201, 255]);
    const first = decodeSignedVector8(bytes, 0);
    const second = decodeSignedVector8(bytes, 1);
    expect(second.x).toBeCloseTo(147 / 255, 15);
    expect(second.y).toBeCloseTo(147 / 255, 15);
    expect(second.z).toBeCloseTo(147 / 255, 15);
    const afterBlend = normalize(mix(first, second, 0.37));
    expect(afterBlend.x).toBeCloseTo(0.24059348, 7);
    expect(afterBlend.y).toBeCloseTo(0.94033481, 7);
    expect(afterBlend.z).toBeCloseTo(0.24059348, 7);
    const beforeBlend = normalize(mix(normalize(first), normalize(second), 0.37));
    expect(
      Math.hypot(
        afterBlend.x - beforeBlend.x,
        afterBlend.y - beforeBlend.y,
        afterBlend.z - beforeBlend.z,
      ),
    ).toBeGreaterThan(3e-4);
    expect([...bytes]).toEqual([128, 255, 128, 255, 201, 201, 201, 255]);
  });
});

describe("signed-vector byte validation and resource bounds", () => {
  it("rejects malformed lengths and excess counts before reading any components", () => {
    for (const invalidLength of [
      -1,
      1,
      2,
      4,
      1.5,
      NaN,
      Infinity,
      -Infinity,
      Number.MAX_SAFE_INTEGER + 1,
      3 * (4097 * 4097 + 1),
      "3",
      null,
      undefined,
    ]) {
      const readLength = vi.fn(() => invalidLength);
      const readValue = vi.fn(() => {
        throw new Error("Component access must follow valid length/count checks");
      });
      const input = Object.defineProperties(
        {},
        { length: { get: readLength }, 0: { get: readValue } },
      );
      expect(() => packSignedVector8(input as never)).toThrow();
      expect(readLength).toHaveBeenCalledTimes(1);
      expect(readValue).not.toHaveBeenCalled();
    }
  });

  it("rejects missing input records and nonnumeric, nonfinite, or out-of-range components", () => {
    for (const invalid of [null, undefined])
      expect(() => packSignedVector8(invalid as never)).toThrow();
    for (const invalid of [
      NaN,
      Infinity,
      -Infinity,
      -1 - Number.EPSILON,
      1 + Number.EPSILON,
      "0",
      undefined,
      null,
    ]) {
      for (let channel = 0; channel < 3; channel++) {
        const values: unknown[] = [0, 0, 0];
        values[channel] = invalid;
        expect(() => packSignedVector8(values as never)).toThrow();
      }
    }
  });

  it("rejects partial RGBA samples and every invalid sample index", () => {
    for (const length of [1, 2, 3, 5, 7]) {
      expect(() => decodeSignedVector8(new Uint8Array(length), 0)).toThrow();
    }
    const bytes = new Uint8Array([0, 255, 0, 255]);
    for (const index of [
      -1,
      0.5,
      1,
      Number.MAX_SAFE_INTEGER,
      Number.MAX_SAFE_INTEGER + 1,
      NaN,
      Infinity,
      -Infinity,
      "0",
      null,
      undefined,
    ]) {
      expect(() => decodeSignedVector8(bytes, index as never)).toThrow();
    }
  });

  it("rejects other view kinds and objects spoofing a Uint8Array tag", () => {
    const invalid = [
      new Int8Array(4),
      new Uint8ClampedArray(4),
      new Uint16Array(4),
      new Float32Array(4),
      new DataView(new ArrayBuffer(4)),
      new ArrayBuffer(4),
      [0, 255, 0, 255],
      { 0: 0, 1: 255, 2: 0, 3: 255, length: 4, [Symbol.toStringTag]: "Uint8Array" },
      new Proxy(new Uint8Array(4), {}),
      null,
      undefined,
    ];
    for (const bytes of invalid) expect(() => decodeSignedVector8(bytes as never, 0)).toThrow();
    const spoofedView = new Int8Array(4);
    Object.defineProperty(spoofedView, Symbol.toStringTag, { value: "Uint8Array" });
    expect(ArrayBuffer.isView(spoofedView)).toBe(true);
    expect(Object.prototype.toString.call(spoofedView)).toBe("[object Uint8Array]");
    expect(() => decodeSignedVector8(spoofedView as never, 0)).toThrow();
  });
});
