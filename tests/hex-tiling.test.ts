import { describe, expect, it, vi } from "vitest";
import {
  createHexTileConfig as createFromRoot,
  sampleHexTile2D as sampleFromRoot,
} from "../src/index.ts";
import {
  createHexTileConfig,
  sampleHexTile2D,
  type HexTileOptions,
  type HexTilePair,
  type HexTileRequest,
} from "../src/materials.ts";

const F = Math.fround;
const N = 2 ** -126;
const H = 3.4028234663852886e38 / 16;
const TAU = 6.2831854820251465;
const PI = 3.1415927410125732;
const ordinaryUV: [number, number] = [0.125, 0.0625];
// Fixed CPU allowances for ideal geometric/analytic oracles at ordinary unit
// scales. Hash/seed and explicitly represented callback plans remain exact.
const GEOMETRY_TOLERANCE = 2e-6;
const TRANSPORT_TOLERANCE = 3e-6;
const flat: HexTilePair = { surface: [0.25, 0.5, 0.75, 1], normal: [0.5, 0.5, 1, 0.5] };

/** BigInt reference uses neither package mixing code nor Math.imul. */
function hash32(key: number, x: number, y: number, domain: number): number {
  const mask = 0xffffffffn;
  let hash =
    BigInt(key) ^
    ((BigInt(x >>> 0) * 374761393n) & mask) ^
    ((BigInt(domain) * 668265263n) & mask) ^
    ((BigInt(y >>> 0) * 2147483647n) & mask);
  hash = ((hash ^ (hash >> 13n)) * 1274126177n) & mask;
  return Number((hash ^ (hash >> 16n)) & mask);
}
function unit(key: number, cell: readonly number[], domain: number): number {
  return (hash32(key, cell[0], cell[1], domain) % 16777216) / 16777216;
}
function thetaAt(key: number, cell: readonly number[], strength = 1): number {
  return F(F(F(unit(key, cell, 2) * TAU) - PI) * strength);
}
function triangleWeights(
  uv: readonly number[],
  cells: readonly (readonly number[])[],
  scale = 1,
): number[] {
  // Independent oriented-area coordinates in the unskewed equilateral lattice.
  const vertices = cells.map(([x, y]) => [((x + y / 2) * scale) / Math.sqrt(12), (y * scale) / 4]);
  const area = (a: readonly number[], b: readonly number[], c: readonly number[]) =>
    (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]);
  const denominator = area(vertices[0], vertices[1], vertices[2]);
  return [
    area(uv, vertices[1], vertices[2]),
    area(vertices[0], uv, vertices[2]),
    area(vertices[0], vertices[1], uv),
  ].map((value) => value / denominator);
}
function expectTuple(
  actual: readonly number[],
  expected: readonly number[],
  tolerance: number,
): void {
  expect(actual.length).toBe(expected.length);
  expected.forEach((value, i) => {
    expect(Math.abs(actual[i] - value)).toBeLessThanOrEqual(tolerance);
  });
}
function config(patch: Partial<HexTileOptions> = {}) {
  return createHexTileConfig({
    seed: "hex-v1",
    tileScale: 1,
    rotationStrength: 0,
    offsetScale: 0,
    luminanceInfluence: 0,
    contrast: 0.5,
    ...patch,
  });
}

describe("seeded hex tile configuration", () => {
  it("applies offset headroom after the declared Float32 upload rounding", () => {
    const raw = H * (1 + 2 ** -26);
    expect(raw).toBeGreaterThan(H);
    expect(F(raw)).toBe(H);
    expect(config({ offsetScale: raw }).offsetScale).toBe(H);
  });
  it("exposes complete root/materials operations with owned frozen Float32 controls", () => {
    const options = { seed: "hex-v1", tileScale: 1.6 };
    const a = createFromRoot(options);
    const b = createHexTileConfig(options);
    expect(a).toEqual(b);
    expect(a).not.toBe(b);
    expect(Object.isFrozen(a)).toBe(true);
    expect(a).toEqual({
      mode: "integer-v1",
      seedKey: 150275656,
      tileScale: F(1.6),
      rotationStrength: 1,
      offsetScale: 3,
      luminanceInfluence: F(0.6),
      contrast: 0.6,
      gainExponent: 1.3219281435012817,
      normalChannels: "rg",
      inputNormalYSign: 1,
    });
    options.seed = "changed";
    options.tileScale = 99;
    expect(a.seedKey).toBe(150275656);
    expect(sampleFromRoot(a, ordinaryUV, [1, 0], [0, 1], () => flat)).toEqual(
      sampleHexTile2D(b, ordinaryUV, [1, 0], [0, 1], () => flat),
    );
  });

  it.each([
    [0, 890022063],
    ["0", 890022063],
    [1, 873244444],
    [-1, 348981803],
    ["hex-v1", 150275656],
    ["🧱", 3962313840],
  ] as const)("preserves the frozen UTF-16 seed vector %s", (seed, key) => {
    expect(createHexTileConfig({ seed, tileScale: 1 }).seedKey).toBe(key);
  });

  it("reads inherited controls exactly once and does not require own-property registration", () => {
    const counts = new Map<string, number>();
    const values = {
      seed: "hex-v1",
      tileScale: 1.6,
      rotationStrength: 0.5,
      offsetScale: 2,
      luminanceInfluence: 0.25,
      contrast: 0.75,
      normalChannels: "ra",
      inputNormalYSign: -1,
    };
    const prototype = Object.fromEntries(
      Object.entries(values).map(([key, value]) => [key, value]),
    );
    for (const [key, value] of Object.entries(values))
      Object.defineProperty(prototype, key, {
        get: () => {
          counts.set(key, (counts.get(key) ?? 0) + 1);
          return value;
        },
      });
    const result = createHexTileConfig(Object.create(prototype));
    expect(result.seedKey).toBe(150275656);
    expect(result.normalChannels).toBe("ra");
    expect([...counts.values()]).toEqual(new Array(8).fill(1));
  });

  it("compiles raw contrast before upload rounding and accepts exactly normal exponent bounds", () => {
    const high = createHexTileConfig({ seed: 0, tileScale: 1, contrast: 1 - 2 ** -53 });
    expect(high.contrast).toBe(1 - 2 ** -53);
    expect(F(high.contrast)).toBe(1);
    expect(high.gainExponent).toBe(53);
    expect(config({ contrast: 0.5 }).gainExponent).toBe(1);
    expect(config({ contrast: 0.75 }).gainExponent).toBe(2);
    expect(config({ contrast: N * Math.log(2) }).gainExponent).toBe(N);
    expect(() => config({ contrast: Number.MIN_VALUE })).toThrow();
    expect(() => config({ contrast: 2 ** -130 })).toThrow();
    expect(config({ tileScale: N, offsetScale: 0 }).tileScale).toBe(N);
    expect(config({ tileScale: H, offsetScale: 1 }).tileScale).toBe(H);
  });

  it("rejects missing or invalid scalar/enumerated controls before sampling", () => {
    const patches = [
      { seed: undefined },
      { seed: null },
      { seed: NaN },
      { seed: Infinity },
      { seed: {} },
      { tileScale: undefined },
      { tileScale: 0 },
      { tileScale: -1 },
      { tileScale: NaN },
      { tileScale: Infinity },
      { tileScale: N / 2 },
      { tileScale: 1e39 },
      { rotationStrength: -1 },
      { rotationStrength: 1 + Number.EPSILON },
      { luminanceInfluence: -1 },
      { luminanceInfluence: 1 + Number.EPSILON },
      { offsetScale: -1 },
      { offsetScale: Infinity },
      { offsetScale: 2 * H },
      { tileScale: H, offsetScale: 2 },
      { tileScale: H, offsetScale: 17 },
      { contrast: 0 },
      { contrast: 1 },
      { contrast: NaN },
      { contrast: Infinity },
      { normalChannels: "rb" },
      { normalChannels: "RG" },
      { inputNormalYSign: 0 },
      { inputNormalYSign: "1" },
    ];
    for (const patch of patches)
      expect(() =>
        createHexTileConfig({ seed: 0, tileScale: 1, ...patch } as unknown as HexTileOptions),
      ).toThrow();
    expect(() => createHexTileConfig(null as unknown as HexTileOptions)).toThrow();
  });
});

describe("independent cell geometry and seeded observations", () => {
  it("freezes the independent integer mixer against raw-key BigInt vectors", () => {
    const vectors = [
      [0, 0, 0, 0x00000000, 0xc4ada425, 0x895a484a],
      [1, 0, 0, 0x4bf1d490, 0x109eef77, 0xd54cb53d],
      [0xffffffff, -1, 1, 0x8cda1ff9, 0xdb5052fb, 0x94c106f2],
      [0x80000000, 4097, -4096, 0xad2351d9, 0xef6f4a1d, 0xbf27b0cd],
      [0x7fffffff, -4096, 4097, 0xc2b33174, 0xd7669b29, 0x9740f397],
      [0x12345678, -17, 31, 0xb9d5f2d6, 0x4d1be790, 0xbcaa00b9],
    ];
    for (const [key, x, y, ...expected] of vectors)
      for (let domain = 0; domain < 3; domain++)
        expect(hash32(key, x, y, domain)).toBe(expected[domain]);
  });

  it.each([
    {
      uv: [0.125, 0.0625],
      cells: [
        [0, 0],
        [0, 1],
        [1, 0],
      ],
    },
    {
      uv: [-0.125, -0.0625],
      cells: [
        [0, 0],
        [0, -1],
        [-1, 0],
      ],
    },
  ])("matches oriented triangle areas and ordered cell identities at $uv", ({ uv, cells }) => {
    const requests: HexTileRequest[] = [];
    const result = sampleHexTile2D(config(), uv as [number, number], [1, 0], [0, 1], (request) => {
      requests.push(request);
      return flat;
    });
    expect(requests.map((request) => request.cell)).toEqual(cells);
    expectTuple(result.weights, triangleWeights(uv, cells), GEOMETRY_TOLERANCE);
    for (const request of requests) expectTuple(request.uv, uv, GEOMETRY_TOLERANCE);
  });

  it("selects upper order on exact represented diagonal ties and still calls zero-weight vertices", () => {
    const requests: HexTileRequest[] = [];
    const uv: [number, number] = [0.25, 0.0669873058795929];
    const result = sampleHexTile2D(config(), uv, [0, 0], [0, 0], (request) => {
      requests.push(request);
      return flat;
    });
    expect(requests.map((request) => request.cell)).toEqual([
      [1, 1],
      [1, 0],
      [0, 1],
    ]);
    expect(requests.length).toBe(3);
    expect(result.weights[0]).toBe(0);
    const cornerRequests: HexTileRequest[] = [];
    const corner = sampleHexTile2D(config(), [0, 0], [0, 0], [0, 0], (request) => {
      cornerRequests.push(request);
      return flat;
    });
    expect(cornerRequests.map((request) => request.cell)).toEqual([
      [0, 0],
      [0, 1],
      [1, 0],
    ]);
    expect(corner.weights).toEqual([1, 0, 0]);
  });

  it("observes exact independently seeded offset domains through public callback UVs", () => {
    const cfg = config({ offsetScale: 1 });
    const requests: HexTileRequest[] = [];
    sampleHexTile2D(cfg, [0, 0], [1, 0], [0, 1], (request) => {
      requests.push(request);
      return flat;
    });
    for (const request of requests) {
      expect(request.uv).toEqual([
        unit(cfg.seedKey, request.cell, 0),
        unit(cfg.seedKey, request.cell, 1),
      ]);
      expect(request.uv[0]).not.toBe(request.uv[1]);
    }
  });

  it("rounds queries and gradient tuples once without dividing gradients by tile scale", () => {
    const captures = (scale: number, uv: [number, number], dx: [number, number]) => {
      const requests: HexTileRequest[] = [];
      sampleHexTile2D(config({ tileScale: scale }), uv, dx, [-5, 7], (request) => {
        requests.push(request);
        return flat;
      });
      return requests;
    };
    const original = captures(1, [1 + 2 ** -25, 1e-50], [2 + 2 ** -25, 3]);
    const rounded = captures(1, [1, 0], [2, 3]);
    expect(original).toEqual(rounded);
    for (const scale of [0.5, 1, 2])
      for (const request of captures(scale, ordinaryUV, [2, 3])) {
        expect(request.dUVdx).toEqual([2, 3]);
        expect(request.dUVdy).toEqual([-5, 7]);
      }
  });
});

describe("analytic scalar-slope and gradient transport", () => {
  it.each(["rg", "ra"] as const)(
    "keeps input Y convention independent of %s channel packing",
    (normalChannels) => {
      for (const inputNormalYSign of [1, -1] as const)
        for (const [a, b] of [
          [1, 0],
          [0, 1],
          [1, 2],
        ]) {
          const cfg = config({ seed: "🧱", rotationStrength: 1, normalChannels, inputNormalYSign });
          const requests: HexTileRequest[] = [];
          const denominator = Math.sqrt(1 + a * a + b * b);
          const encodedX = (1 - a / denominator) / 2;
          const encodedY = (1 - (inputNormalYSign * b) / denominator) / 2;
          const normal: [number, number, number, number] =
            normalChannels === "rg"
              ? [encodedX, encodedY, 0.9, 0.1]
              : [encodedX, 0.1, 0.9, encodedY];
          const result = sampleHexTile2D(cfg, ordinaryUV, [2, 3], [-5, 7], (request) => {
            requests.push(request);
            return { surface: flat.surface, normal };
          });
          const weights = triangleWeights(
            ordinaryUV,
            requests.map((request) => request.cell),
          );
          const expected = [0, 0];
          for (let i = 0; i < requests.length; i++) {
            const angle = thetaAt(cfg.seedKey, requests[i].cell);
            // h(q)=a*qU+b*qV gives this inverse-rotated normal by the chain
            // rule. It is a signed XY vector, not a unit-normal reconstruction.
            expected[0] +=
              weights[i] * (-(a * Math.cos(angle) + b * Math.sin(angle)) / denominator);
            expected[1] += weights[i] * ((a * Math.sin(angle) - b * Math.cos(angle)) / denominator);
            for (const [actual, source] of [
              [requests[i].dUVdx, [2, 3]],
              [requests[i].dUVdy, [-5, 7]],
            ] as const) {
              // Independent polar-angle rotation, rather than copying matrix code.
              const radius = Math.hypot(...source),
                direction = Math.atan2(source[1], source[0]) + angle;
              expectTuple(
                actual,
                [radius * Math.cos(direction), radius * Math.sin(direction)],
                TRANSPORT_TOLERANCE * radius,
              );
            }
          }
          expectTuple(result.normalXY, expected, TRANSPORT_TOLERANCE);
          expect(Math.hypot(...result.normalXY)).toBeLessThan(1);
        }
    },
  );

  it("ignores blue and unused packing channels and keeps weights independent of normal data", () => {
    for (const normalChannels of ["rg", "ra"] as const) {
      const cfg = config({ rotationStrength: 0.5, normalChannels });
      const first: [number, number, number, number] =
        normalChannels === "rg" ? [0.75, 0.25, 0, 0] : [0.75, 0, 0, 0.25];
      const second: [number, number, number, number] =
        normalChannels === "rg" ? [0.75, 0.25, 1, 1] : [0.75, 1, 1, 0.25];
      const run = (normal: typeof first) =>
        sampleHexTile2D(cfg, ordinaryUV, [1, 0], [0, 1], () => ({ surface: flat.surface, normal }));
      expect(run(first)).toEqual(run(second));
    }
  });
});

describe("independent gain and degeneracy witnesses", () => {
  it("matches exact k1/k2 gain witnesses before normalization", () => {
    const sample = (contrast: number, uv: [number, number], luminanceInfluence = 0) =>
      sampleHexTile2D(config({ contrast, luminanceInfluence }), uv, [0, 0], [0, 0], () => ({
        surface: [1, 1, 1, 1],
        normal: flat.normal,
      }));
    expectTuple(sample(0.5, [0, 0.0625]).weights, [0.125, 0.75, 0.125], GEOMETRY_TOLERANCE);
    // k2 maps (.125,.75,.125) to (.03125,.875,.03125).
    expectTuple(sample(0.75, [0, 0.0625]).weights, [1 / 30, 14 / 15, 1 / 30], GEOMETRY_TOLERANCE);
    // k2 maps (.25,.5,.25) to (.125,.5,.125).
    expectTuple(sample(0.75, [0, 0.125]).weights, [1 / 6, 2 / 3, 1 / 6], GEOMETRY_TOLERANCE);
    // White with influence1 doubles raw weights to (.5,1,.5): gain is
    // applied before normalization. Pre-normalizing would give the row above.
    expectTuple(sample(0.75, [0, 0.125], 1).weights, [0.25, 0.5, 0.25], GEOMETRY_TOLERANCE);
    expect(sample(0.75, [0, 0], 1).weights).toEqual([1, 0, 0]);
  });

  it("falls back to base barycentrics for black luminance and high-contrast underflow", () => {
    for (const surface of [
      [0, 0, 0, 0.75],
      [2 ** -20, 2 ** -20, 2 ** -20, 0.25],
    ] as const) {
      const result = sampleHexTile2D(
        config({ contrast: 1 - 2 ** -53, luminanceInfluence: 1 }),
        [0, 0.125],
        [0, 0],
        [0, 0],
        () => ({ surface, normal: flat.normal }),
      );
      expect(result.weights).toEqual([0.25, 0.5, 0.25]);
      expectTuple(result.surface, surface, GEOMETRY_TOLERANCE);
      expect(result.normalXY).toEqual([0, 0]);
    }
  });
});

describe("hex tile ownership and finite domain guards", () => {
  it("preplans all requests, freezes fresh results, and copies reused result channels/getters once", () => {
    const uv: [number, number] = [...ordinaryUV],
      dx: [number, number] = [1, 0],
      dy: [number, number] = [0, 1];
    const channels = { surface: [0, 0, 0, 0], normal: [0.5, 0.5, 1, 0.5] };
    const counts = {
      surface: 0,
      normal: 0,
      surfaceLength: 0,
      normalLength: 0,
      surfaceValues: 0,
      normalValues: 0,
    };
    const array = (name: "surface" | "normal") =>
      new Proxy(channels[name], {
        get(target, key, receiver) {
          if (key === "length") counts[`${name}Length`]++;
          if (typeof key === "string" && /^[0-3]$/.test(key)) counts[`${name}Values`]++;
          return Reflect.get(target, key, receiver);
        },
      });
    const surface = array("surface"),
      normal = array("normal");
    const pair = {
      get surface() {
        counts.surface++;
        return surface;
      },
      get normal() {
        counts.normal++;
        return normal;
      },
    };
    const requests: HexTileRequest[] = [];
    const cfg = config();
    const result = sampleHexTile2D(cfg, uv, dx, dy, (request) => {
      requests.push(request);
      channels.surface.fill(request.cell[0] === 1 ? 0.75 : request.cell[1] === 1 ? 0.5 : 0.25);
      uv[0] = 1e30;
      dx[0] = 1e30;
      dy[0] = 1e30;
      return pair as unknown as HexTilePair;
    });
    expect(requests.length).toBe(3);
    expect(counts).toEqual({
      surface: 3,
      normal: 3,
      surfaceLength: 3,
      normalLength: 3,
      surfaceValues: 12,
      normalValues: 12,
    });
    for (const request of requests) {
      expect(Object.isFrozen(request)).toBe(true);
      for (const tuple of [request.cell, request.uv, request.dUVdx, request.dUVdy])
        expect(Object.isFrozen(tuple)).toBe(true);
      expectTuple(request.uv, ordinaryUV, GEOMETRY_TOLERANCE);
      expect(request.dUVdx).toEqual([1, 0]);
      expect(request.dUVdy).toEqual([0, 1]);
    }
    expect(requests[0]).not.toBe(requests[1]);
    const weights = triangleWeights(
      ordinaryUV,
      requests.map((request) => request.cell),
    );
    const expected = weights[0] * 0.25 + weights[1] * 0.5 + weights[2] * 0.75;
    expectTuple(result.surface, [expected, expected, expected, expected], GEOMETRY_TOLERANCE);
    channels.surface.fill(99);
    channels.normal.fill(99);
    expectTuple(result.surface, [expected, expected, expected, expected], GEOMETRY_TOLERANCE);
    expect(Object.isFrozen(result)).toBe(true);
    for (const tuple of [result.surface, result.normalXY, result.weights])
      expect(Object.isFrozen(tuple)).toBe(true);
    const second = sampleHexTile2D(cfg, ordinaryUV, [1, 0], [0, 1], () => flat);
    expect(second).not.toBe(result);
    expect(second.surface).not.toBe(result.surface);
  });

  it("validates all three plans before callbacks, including a failing third zero-weight cell", () => {
    const cfg = config({ seed: "🧱", rotationStrength: 1 });
    const cells = [
      [0, 0],
      [0, 1],
      [1, 0],
    ];
    const magnitudes = cells.map((cell) => {
      const angle = thetaAt(cfg.seedKey, cell);
      return (
        0.8 *
        Math.max(
          Math.abs(Math.cos(angle) - Math.sin(angle)),
          Math.abs(Math.cos(angle) + Math.sin(angle)),
        )
      );
    });
    expect(magnitudes[0]).toBeLessThan(0.9);
    expect(magnitudes[1]).toBeLessThan(0.95);
    expect(magnitudes[2]).toBeGreaterThan(1.1);
    const sample = vi.fn(() => flat);
    expect(() => sampleHexTile2D(cfg, [0, 0], [0.8 * H, 0.8 * H], [0, 0], sample)).toThrow();
    expect(sample).not.toHaveBeenCalled();
  });

  it("rejects malformed/nonfinite queries and grid bounds before callbacks", () => {
    const cfg = config();
    const sample = vi.fn(() => flat);
    for (const value of [
      null,
      [],
      [0],
      [0, 1, 2],
      [NaN, 0],
      [0, Infinity],
      ["0", 0],
      [2 * H, 0],
      [1e39, 0],
    ]) {
      for (const slot of [0, 1, 2]) {
        const tuples: unknown[] = [
          [0, 0],
          [1, 0],
          [0, 1],
        ];
        tuples[slot] = value;
        expect(() =>
          sampleHexTile2D(
            cfg,
            tuples[0] as [number, number],
            tuples[1] as [number, number],
            tuples[2] as [number, number],
            sample,
          ),
        ).toThrow();
      }
    }
    expect(() => sampleHexTile2D(cfg, [0, 1024.25], [0, 0], [0, 0], sample)).toThrow();
    expect(() =>
      sampleHexTile2D(config({ tileScale: N }), [H, 0], [0, 0], [0, 0], sample),
    ).toThrow();
    expect(sample).not.toHaveBeenCalled();
    for (const v of [-1024, 1024])
      expect(
        sampleHexTile2D(cfg, [0, v], [0, 0], [0, 0], () => flat).surface.every(Number.isFinite),
      ).toBe(true);
  });

  it("validates paired normalized channels and retains callback failure causes", () => {
    const cfg = config();
    for (const value of [
      null,
      {},
      { surface: [0, 0, 0], normal: flat.normal },
      { surface: [0, 0, 0, 0, 0], normal: flat.normal },
      { surface: flat.surface, normal: [0, 0, 0] },
      ...[NaN, Infinity, -1, 1 + Number.EPSILON, "0", null].map((channel) => ({
        surface: [0, 0, 0, channel],
        normal: flat.normal,
      })),
    ]) {
      expect(() =>
        sampleHexTile2D(cfg, ordinaryUV, [0, 0], [0, 0], () => value as unknown as HexTilePair),
      ).toThrow();
    }
    const failure = new Error("paired sampler stopped");
    let caught: unknown;
    try {
      sampleHexTile2D(cfg, ordinaryUV, [0, 0], [0, 0], () => {
        throw failure;
      });
    } catch (error) {
      caught = error;
    }
    expect(caught).toBeInstanceOf(Error);
    expect((caught as Error).cause).toBe(failure);
  });
});
