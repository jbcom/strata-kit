import { describe, expect, it } from "vitest";
import { fractalNoise } from "../src/noise.ts";

describe("bounded fractal sampling", () => {
  it("rejects unbounded octave work before invoking a callback", () => {
    let calls = 0;
    expect(() =>
      fractalNoise(
        () => {
          calls += 1;
          return 0;
        },
        0,
        0,
        0,
        33,
      ),
    ).toThrow();
    expect(calls).toBe(0);
  });
  it("rejects nonfinite callback samples instead of returning contaminated data", () => {
    expect(() => fractalNoise(() => Number.NaN, 0, 0, 0)).toThrow();
    expect(() => fractalNoise(() => Number.POSITIVE_INFINITY, 0, 0, 0)).toThrow();
  });
  it("rejects overflowing scaled coordinates before passing them to a callback", () => {
    let calls = 0;
    expect(() =>
      fractalNoise(
        () => {
          calls += 1;
          return 0;
        },
        Number.MAX_VALUE,
        0,
        0,
      ),
    ).toThrow();
    expect(calls).toBe(1);
  });
  it("preserves a constant field at the supported octave ceiling", () => {
    expect(fractalNoise(() => 3, 0, 0, 0, 32)).toBe(3);
  });
});
