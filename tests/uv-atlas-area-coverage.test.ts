import { describe, expect, it } from "vitest";

import {
  bakeUvAtlas,
  type NeutralIndexedMesh,
  type SurfaceSampler,
  type UvAtlasBakeOptions,
} from "../src/reskin.ts";

// Dyadic UVs are exactly representable in Float32. Mapping positions to UVs
// also keeps every triangle's surface-to-UV density identical.
function meshFromTriangles(...triangles: readonly number[][]): NeutralIndexedMesh {
  const uvs = triangles.flat();
  const positions = uvs.flatMap((value, index) => (index % 2 === 0 ? [value] : [value, 0]));
  return {
    positions: new Float32Array(positions),
    uvs: new Float32Array(uvs),
    indices: new Uint16Array(Array.from({ length: uvs.length / 2 }, (_, index) => index)),
  };
}

const opaque: SurfaceSampler = {
  sample: () => ({ color: [73, 101, 151, 255], roughness: 0.25, bump: -0.5, metalness: 0.75 }),
};

const oneTexel: UvAtlasBakeOptions = { width: 1, height: 1, padding: 0, coverage: "area" };
const unequalIslands = () => meshFromTriangles([0, 0, 0.25, 0, 0, 0.25], [0.5, 0, 1, 0, 0.5, 0.25]);

describe("positive-area UV atlas coverage", () => {
  it.each([false, true])(
    "reaches a valid subpixel chart at 2048 with reversed winding %s",
    (reverse) => {
      const side = 1 / 65_536;
      const mesh = meshFromTriangles(reverse ? [0, 0, 0, side, side, 0] : [0, 0, side, 0, 0, side]);
      const options = { width: 2048, height: 2048, padding: 0 };
      expect(() => bakeUvAtlas(mesh, opaque, options)).toThrow("does not reach an atlas pixel");
      expect(() => bakeUvAtlas(mesh, opaque, { ...options, coverage: "pixel-center" })).toThrow(
        "does not reach an atlas pixel",
      );
      const atlas = bakeUvAtlas(mesh, opaque, { ...options, coverage: "area" });
      const texel = 2047 * 2048;
      expect(atlas.covered).toBe(1 / (2048 * 2048));
      expect(Array.from(atlas.color.slice(texel * 4, texel * 4 + 4))).toEqual([73, 101, 151, 255]);
      expect(atlas.roughness[texel]).toBe(64);
      expect(atlas.bump[texel]).toBe(64);
      expect(atlas.metalness?.[texel]).toBe(191);
    },
  );

  it.each([false, true])(
    "samples exact square and clipped-triangle centroids with reversed winding %s",
    (reverse) => {
      const mesh = meshFromTriangles(reverse ? [0, 0, 0, 1, 1, 0] : [0, 0, 1, 0, 0, 1]);
      const calls: number[][] = [];
      const atlas = bakeUvAtlas(
        mesh,
        {
          sample(u, v) {
            calls.push([u, v]);
            return {
              color: [Math.round(u * 255), Math.round(v * 255), 0, 255],
              roughness: u,
              bump: 0,
            };
          },
        },
        { width: 2, height: 2, padding: 0, coverage: "area" },
      );
      // u+v<=1 fills the bottom-left square and half of its two neighbours.
      // Each half-square is a right triangle; its centroid is its vertex mean.
      expect(calls).toHaveLength(3);
      for (const [u, v] of [
        [0.25, 0.25],
        [2 / 3, 1 / 6],
        [1 / 6, 2 / 3],
      ]) {
        expect(calls.some(([a, b]) => Math.abs(a - u) < 1e-12 && Math.abs(b - v) < 1e-12)).toBe(
          true,
        );
      }
      expect(atlas.covered).toBe(3 / 4);
      expect(Array.from(atlas.color.slice(4, 8))).toEqual([0, 0, 0, 0]);
      expect(Array.from(atlas.color.slice(8, 12))).toEqual([64, 64, 0, 255]);
    },
  );

  it("weights disjoint same-texel islands by area and blends color in linear light", () => {
    const atlas = bakeUvAtlas(
      unequalIslands(),
      {
        sample(u) {
          const byte = u < 0.4 ? 0 : 255;
          return { color: [byte, byte, byte, 255], roughness: 0, bump: 0 };
        },
      },
      oneTexel,
    );
    // Areas are 1/32 and 1/16: white supplies 2/3 of linear irradiance.
    // The standard sRGB transfer encodes 2/3 linear white as byte 213.
    expect(Array.from(atlas.color)).toEqual([213, 213, 213, 255]);
    expect(atlas.covered).toBe(1);
    expect(atlas.metalness).toBeUndefined();
  });

  it("allows a shared UV diagonal and merges its two positive-area halves", () => {
    const mesh = meshFromTriangles([0, 0, 1, 0, 0, 1], [1, 0, 1, 1, 0, 1]);
    mesh.positions.set([3, 0, 0, 3, 1, 0, 2, 1, 0], 9);
    const atlas = bakeUvAtlas(
      mesh,
      {
        sample(u) {
          const byte = u < 1 ? 0 : 255;
          return { color: [byte, byte, byte, 255], roughness: 0, bump: 0 };
        },
      },
      oneTexel,
    );
    // Two half-square triangles have zero interior overlap and equal area.
    expect(Array.from(atlas.color)).toEqual([188, 188, 188, 255]);
    expect(atlas.covered).toBe(1);
  });

  it("normalises every material channel by area times alpha", () => {
    const atlas = bakeUvAtlas(
      unequalIslands(),
      {
        sample(u) {
          return u < 0.4
            ? { color: [0, 0, 0, 255], roughness: 0, bump: -1, metalness: 0 }
            : { color: [255, 255, 255, 128], roughness: 1, bump: 1, metalness: 1 };
        },
      },
      oneTexel,
    );
    // Relative premultiplied weights are 255:256. White contributes 256/511;
    // alpha is (255 + 2*128)/3, while bump is (256-255)/511.
    expect(Array.from(atlas.color)).toEqual([188, 188, 188, 170]);
    expect(Array.from(atlas.roughness)).toEqual([128]);
    expect(Array.from(atlas.bump)).toEqual([128]);
    expect(Array.from(atlas.metalness ?? [])).toEqual([128]);
  });

  it("keeps fractional sampler alpha until the final atlas encoding", () => {
    const atlas = bakeUvAtlas(
      unequalIslands(),
      {
        sample(u) {
          return u < 0.4
            ? { color: [0, 0, 0, 0.49], roughness: 0, bump: -1, metalness: 0 }
            : { color: [255, 255, 255, 0.51], roughness: 1, bump: 1, metalness: 1 };
        },
      },
      oneTexel,
    );
    // Alpha is (0.49+2*0.51)/3 = 0.50333 byte units. Material white
    // weight is 1.02/1.51, before any byte rounding can erase the first island.
    expect(Array.from(atlas.color)).toEqual([214, 214, 214, 1]);
    expect(atlas.roughness[0]).toBe(172);
    expect(atlas.bump[0]).toBe(172);
    expect(atlas.metalness?.[0]).toBe(172);
  });

  it("samples all three triplanar axes of a tilted surface at its area centroid", () => {
    const mesh = meshFromTriangles([0, 0, 0.25, 0, 0, 0.25]);
    // Cross product is (1,1,1), so all three plane weights are exactly equal.
    mesh.positions.set([0, 0, 0, 1, -1, 0, 1, 0, -1]);
    const calls: number[][] = [];
    const atlas = bakeUvAtlas(
      mesh,
      {
        sample(u, v) {
          calls.push([u, v]);
          return u === v
            ? { color: [0, 0, 0, 255], roughness: 0, bump: -1, metalness: 0 }
            : { color: [255, 255, 255, 255], roughness: 1, bump: 1, metalness: 1 };
        },
      },
      oneTexel,
    );
    expect(calls).toHaveLength(3);
    expect(calls[0][0]).toBeCloseTo(-1 / 3, 12);
    expect(calls[0][1]).toBeCloseTo(-1 / 3, 12);
    for (const [u, v] of calls.slice(1)) {
      expect(u).toBeCloseTo(2 / 3, 12);
      expect(v).toBeCloseTo(-1 / 3, 12);
    }
    expect(Array.from(atlas.color)).toEqual([213, 213, 213, 255]);
    expect(atlas.roughness[0]).toBe(170);
    expect(atlas.bump[0]).toBe(170);
    expect(atlas.metalness?.[0]).toBe(170);
  });

  it("maps clipped UV centroids to model coordinates with scale in a nonsquare atlas", () => {
    const mesh = meshFromTriangles([0, 0, 1, 0, 0, 1]);
    mesh.positions.set([10, 20, 0, 12, 20, 0, 10, 23, 0]);
    const calls: number[][] = [];
    bakeUvAtlas(
      mesh,
      {
        sample(u, v) {
          calls.push([u, v]);
          return opaque.sample(u, v);
        },
      },
      { width: 4, height: 2, padding: 0, coverage: "area", scale: 2 },
    );
    // Bottom-left full rectangle centroid is UV (1/8,1/4), transformed
    // through x=10+2u,y=20+3v and finally multiplied by scale 2.
    expect(calls).toContainEqual([20.5, 41.5]);
    // Bottom-right clipped triangle has UV centroid (5/6,1/12).
    expect(calls.some(([u, v]) => Math.abs(u - 70 / 3) < 1e-12 && Math.abs(v - 40.5) < 1e-12)).toBe(
      true,
    );
  });

  it("keeps thin positive-area charts touching the right and top atlas boundaries", () => {
    const side = 1 / 262_144;
    const mesh = meshFromTriangles([0, 1, side, 1, 0, 1 - side], [1, 0, 1, side, 1 - side, 0]);
    const atlas = bakeUvAtlas(mesh, opaque, { width: 4, height: 2, padding: 0, coverage: "area" });
    expect(atlas.covered).toBe(2 / 8);
    expect(Array.from({ length: 8 }, (_, index) => atlas.color[index * 4 + 3])).toEqual([
      255, 0, 0, 0, 0, 0, 0, 255,
    ]);
  });

  it("excludes transparent contributions from material channels without reducing geometric coverage", () => {
    const atlas = bakeUvAtlas(
      unequalIslands(),
      {
        sample(u) {
          return u < 0.4
            ? { color: [0, 0, 0, 255], roughness: 0, bump: -1, metalness: 0 }
            : { color: [255, 255, 255, 0], roughness: 1, bump: 1, metalness: 1 };
        },
      },
      oneTexel,
    );
    expect(Array.from(atlas.color)).toEqual([0, 0, 0, 85]);
    expect(atlas.roughness[0]).toBe(0);
    expect(atlas.bump[0]).toBe(0);
    expect(atlas.metalness?.[0]).toBe(0);
    expect(atlas.covered).toBe(1);
  });

  it("distinguishes covered transparent neutral bump from an unwritten texel", () => {
    const atlas = bakeUvAtlas(
      meshFromTriangles([0, 0, 0.125, 0, 0, 0.125]),
      {
        sample: () => ({ color: [255, 255, 255, 0], roughness: 1, bump: 1, metalness: 1 }),
      },
      { width: 2, height: 2, padding: 0, coverage: "area" },
    );
    expect(Array.from(atlas.color)).toEqual(Array(16).fill(0));
    expect(Array.from(atlas.bump)).toEqual([0, 0, 128, 0]);
    expect(Array.from(atlas.roughness)).toEqual([0, 0, 0, 0]);
    expect(Array.from(atlas.metalness ?? [])).toEqual([0, 0, 0, 0]);
    expect(atlas.covered).toBe(1 / 4);
  });

  it("requires consistent metalness presence across same-texel contributions, including transparent ones", () => {
    expect(() =>
      bakeUvAtlas(
        unequalIslands(),
        {
          sample(u) {
            return u < 0.4
              ? { color: [0, 0, 0, 255], roughness: 0, bump: 0, metalness: 0 }
              : { color: [255, 255, 255, 0], roughness: 0, bump: 0 };
          },
        },
        oneTexel,
      ),
    ).toThrow("metalness presence must be consistent");
  });

  it("pads deterministically in four-connected rings without changing pre-padding coverage", () => {
    const mesh = meshFromTriangles([0, 0, 0.125, 0, 0, 0.125]);
    const options: UvAtlasBakeOptions = { width: 4, height: 4, padding: 1, coverage: "area" };
    const first = bakeUvAtlas(mesh, opaque, options);
    expect(bakeUvAtlas(mesh, opaque, options)).toEqual(first);
    expect(first.covered).toBe(1 / 16);
    const written = Array.from({ length: 16 }, (_, index) => first.color[index * 4 + 3]);
    expect(written).toEqual([0, 0, 0, 0, 0, 0, 0, 0, 255, 0, 0, 0, 255, 255, 0, 0]);
    for (const texel of [8, 12, 13]) {
      expect(Array.from(first.color.slice(texel * 4, texel * 4 + 4))).toEqual([73, 101, 151, 255]);
      expect(first.roughness[texel]).toBe(64);
      expect(first.bump[texel]).toBe(64);
      expect(first.metalness?.[texel]).toBe(191);
    }
  });

  it("preserves default pixel-center bytes and callback coordinates", () => {
    const mesh = meshFromTriangles([0, 0, 1, 0, 0, 1]);
    const calls: number[][] = [];
    const sampler: SurfaceSampler = {
      sample(u, v) {
        calls.push([u, v]);
        return opaque.sample(u, v);
      },
    };
    const options = { width: 8, height: 8, padding: 2 };
    const omitted = bakeUvAtlas(mesh, sampler, options);
    const defaultCalls = calls.splice(0);
    const explicit = bakeUvAtlas(mesh, sampler, { ...options, coverage: "pixel-center" });
    expect(explicit).toEqual(omitted);
    expect(calls).toEqual(defaultCalls);
    expect(calls).toHaveLength(28);
    expect(calls).toContainEqual([3 / 16, 3 / 16]);
    expect(omitted.covered).toBe(28 / 64);
  });

  it.each(["invalid", "", null, 0, {}, true])("rejects invalid runtime coverage %j", (coverage) => {
    const options = { ...oneTexel, coverage } as unknown as UvAtlasBakeOptions;
    expect(() => bakeUvAtlas(meshFromTriangles([0, 0, 1, 0, 0, 1]), opaque, options)).toThrow(
      /coverage/,
    );
  });

  it("preserves exact overlap, outside, degeneracy and stretch rejection", () => {
    const options: UvAtlasBakeOptions = { width: 16, height: 16, padding: 0, coverage: "area" };
    const valid = [0, 0, 0.25, 0, 0, 0.25];
    expect(() => bakeUvAtlas(meshFromTriangles(valid, valid), opaque, options)).toThrow("overlaps");
    expect(() =>
      bakeUvAtlas(meshFromTriangles([-1 / 65_536, 0, 1, 0, 0, 1]), opaque, options),
    ).toThrow("outside the unit atlas");
    expect(() => bakeUvAtlas(meshFromTriangles([0, 0, 0.25, 0, 0.5, 0]), opaque, options)).toThrow(
      "degenerate triangles",
    );
    const stretched = meshFromTriangles(valid, [0.5, 0, 0.5 + 1 / 64, 0, 0.5, 1 / 64]);
    stretched.positions.set([0, 0, 0, 1, 0, 0, 0, 1, 0], 0);
    stretched.positions.set([2, 0, 0, 3, 0, 0, 2, 1, 0], 9);
    expect(() => bakeUvAtlas(stretched, opaque, options)).toThrow("too stretched");
  });

  it("preserves finite-input, dimension, padding and combined-work limits", () => {
    const mesh = meshFromTriangles([0, 0, 1, 0, 0, 1]);
    expect(() => bakeUvAtlas(mesh, opaque, { ...oneTexel, width: 0 })).toThrow("positive integers");
    expect(() => bakeUvAtlas(mesh, opaque, { ...oneTexel, width: 4096, height: 4096 })).toThrow(
      "pixel count",
    );
    expect(() => bakeUvAtlas(mesh, opaque, { ...oneTexel, padding: -1 })).toThrow(
      "non-negative integer",
    );
    expect(() =>
      bakeUvAtlas(mesh, opaque, { width: 2048, height: 2048, padding: 64, coverage: "area" }),
    ).toThrow("combined raster and padding work exceeds 67108864");
    const excessiveRaster = meshFromTriangles(
      ...Array.from({ length: 17 }, () => [0, 0, 1, 0, 0, 1]),
    );
    expect(() =>
      bakeUvAtlas(excessiveRaster, opaque, {
        width: 2048,
        height: 2048,
        padding: 0,
        coverage: "area",
      }),
    ).toThrow("triangle raster work exceeds 67108864");
    mesh.uvs = new Float32Array([Number.NaN, 0, 1, 0, 0, 1]);
    expect(() => bakeUvAtlas(mesh, opaque, oneTexel)).toThrow("uvs[0] must be finite");
  });

  it("validates sampler output and triplanar options in area mode", () => {
    const mesh = meshFromTriangles([0, 0, 0.25, 0, 0, 0.25]);
    expect(() => bakeUvAtlas(mesh, opaque, { ...oneTexel, scale: 0 })).toThrow(
      "scale must be a positive finite number",
    );
    expect(() =>
      bakeUvAtlas(
        mesh,
        { sample: () => ({ color: [0, 0, 0, 255], roughness: Number.NaN, bump: 0 }) },
        oneTexel,
      ),
    ).toThrow("roughness must be between 0 and 1");
  });
});
