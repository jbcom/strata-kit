import { describe, expect, it } from "vitest";

import {
  analyzeUvLayout,
  bakeUvAtlas,
  createReskinPlan,
  sampleTriplanarSurface,
  type NeutralIndexedMesh,
  type SurfaceSampler,
} from "../src/reskin.ts";

const triangle = (uvs?: readonly number[]): NeutralIndexedMesh => ({
  positions: new Float32Array([0, 0, 0, 1, 0, 0, 0, 1, 0]),
  indices: new Uint16Array([0, 1, 2]),
  ...(uvs === undefined ? {} : { uvs: new Float32Array(uvs) }),
});

const where: SurfaceSampler = {
  sample(u, v) {
    return {
      color: [Math.round(u * 255), Math.round(v * 255), 0, 255],
      roughness: u,
      bump: v * 2 - 1,
    };
  },
};

describe("model-neutral UV diagnostics", () => {
  it("reports each unsafe UV failure and sends it to triplanar projection", () => {
    const missing = analyzeUvLayout(triangle());
    expect(missing.hasUv).toBe(false);
    expect(createReskinPlan(triangle()).projection).toBe("triplanar");

    expect(analyzeUvLayout(triangle([0.5, 0.5, 0.5, 0.5, 0.5, 0.5])).degenerate).toBeGreaterThan(
      0.99,
    );
    expect(analyzeUvLayout(triangle([0, 0, 2, 0, 0, 2])).outside).toBeGreaterThan(0.99);

    const doubled: NeutralIndexedMesh = {
      positions: new Float32Array([0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 1, 0, 1, 0, 1, 1]),
      uvs: new Float32Array([0, 0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1]),
      indices: new Uint16Array([0, 1, 2, 3, 4, 5]),
    };
    const overlap = analyzeUvLayout(doubled, { gridSize: 64 });
    expect(overlap.overlap).toBeGreaterThan(0.99);
    expect(createReskinPlan(doubled, { gridSize: 64 }).projection).toBe("triplanar");
  });

  it("accepts one clean atlas and measures triangle coverage instead of its bounds", () => {
    const report = analyzeUvLayout(triangle([0, 0, 1, 0, 0, 1]), { gridSize: 64 });
    expect(report).toMatchObject({ hasUv: true, outside: 0, degenerate: 0, overlap: 0 });
    expect(report.coverage).toBeCloseTo(0.5, 1);
    expect(report.stretched).toBe(0);
    expect(createReskinPlan(triangle([0, 0, 1, 0, 0, 1]), { gridSize: 64 }).projection).toBe("uv");
  });

  it("keeps relative UV stretch and projection choice under uniform coordinate scales", () => {
    const uvs = [0, 0, 1, 0, 0, 1];
    const unit = analyzeUvLayout(triangle(uvs), { gridSize: 64 });
    const scaled: NeutralIndexedMesh = {
      ...triangle(uvs),
      positions: new Float32Array([0, 0, 0, 20, 0, 0, 0, 20, 0]),
    };
    const transformed = analyzeUvLayout(scaled, { gridSize: 64 });
    expect(transformed.stretched).toBe(unit.stretched);
    expect(createReskinPlan(scaled, { gridSize: 64 }).projection).toBe("uv");
  });

  it("uses exact positive-area triangle intersections and rejects charts too small to reach the grid", () => {
    const tiny = [0.001, 0.001, 0.0011, 0.001, 0.001, 0.0011];
    const duplicated: NeutralIndexedMesh = {
      positions: new Float32Array([0, 0, 0, 1, 0, 0, 0, 1, 0, 2, 0, 0, 3, 0, 0, 2, 1, 0]),
      uvs: new Float32Array([...tiny, ...tiny]),
      indices: new Uint16Array([0, 1, 2, 3, 4, 5]),
    };
    const report = analyzeUvLayout(duplicated);
    expect(report.coverage).toBe(0);
    expect(report.overlap).toBe(1);
    expect(createReskinPlan(duplicated).projection).toBe("triplanar");
    expect(() => bakeUvAtlas(duplicated, where, { width: 16, height: 16 })).toThrow(
      "bakeUvAtlas: UV layout overlaps and cannot be baked safely",
    );

    const oneTiny = triangle(tiny);
    expect(createReskinPlan(oneTiny).projection).toBe("triplanar");
    expect(() => bakeUvAtlas(oneTiny, where, { width: 16, height: 16 })).toThrow(
      "bakeUvAtlas: UV triangle 0 does not reach an atlas pixel",
    );
  });

  it("allows charts that share only an edge", () => {
    const adjacent: NeutralIndexedMesh = {
      positions: new Float32Array([0, 0, 0, 1, 0, 0, 0, 1, 0, 1, 0, 1, 1, 1, 1, 0, 1, 1]),
      uvs: new Float32Array([0, 0, 1, 0, 0, 1, 1, 0, 1, 1, 0, 1]),
      indices: new Uint16Array([0, 1, 2, 3, 4, 5]),
    };
    expect(analyzeUvLayout(adjacent, { gridSize: 64 }).overlap).toBe(0);
    expect(createReskinPlan(adjacent, { gridSize: 64 }).projection).toBe("uv");
    expect(bakeUvAtlas(adjacent, where, { width: 16, height: 16, padding: 0 }).covered).toBe(1);
  });

  it("detects a positive Float32 sliver even when its overlap area is below an absolute epsilon", () => {
    const sliver: NeutralIndexedMesh = {
      positions: new Float32Array([0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 1, 0]),
      uvs: new Float32Array([0, 0, 0.1, 0, 0, 0.1, 0.05, 0.05 - 1e-8, 0.1, 0.05, 0.05, 0.1]),
      indices: new Uint16Array([0, 1, 2, 3, 4, 5]),
    };
    expect(analyzeUvLayout(sliver).overlap).toBe(1);
    expect(createReskinPlan(sliver).projection).toBe("triplanar");
    expect(() => bakeUvAtlas(sliver, where, { width: 64, height: 64 })).toThrow(
      "bakeUvAtlas: UV layout overlaps and cannot be baked safely",
    );
  });

  it("rejects malformed finite layouts and invalid triangle indices before analysis", () => {
    expect(() =>
      analyzeUvLayout({ ...triangle([0, 0, 1, 0, 0, 1]), positions: new Float32Array([0, 0]) }),
    ).toThrow("analyzeUvLayout: positions length must be a positive multiple of 3");
    expect(() =>
      analyzeUvLayout({ ...triangle([0, 0, 1, 0, 0, 1]), indices: new Uint16Array([0, 1, 3]) }),
    ).toThrow("analyzeUvLayout: indices[2] is outside the positions array");
    expect(() => analyzeUvLayout(triangle([0, 0, Number.NaN, 0, 0, 1]))).toThrow(
      "analyzeUvLayout: uvs[2] must be finite",
    );
  });

  it("filters disjoint V ranges before charging U-sweep pair work", () => {
    const count = 4097;
    const positions = new Float32Array(count * 9);
    const uvs = new Float32Array(count * 6);
    const indices = new Uint32Array(count * 3);
    for (let triangleIndex = 0; triangleIndex < count; triangleIndex += 1) {
      const vertex = triangleIndex * 3;
      positions.set([0, 0, 0, 1, 0, 0, 0, 1, 0], vertex * 3);
      const bottom = triangleIndex / count;
      const top = (triangleIndex + 1) / count;
      uvs.set([0, bottom, 0.1, bottom, 0, top], vertex * 2);
      indices.set([vertex, vertex + 1, vertex + 2], triangleIndex * 3);
    }
    expect(analyzeUvLayout({ positions, uvs, indices }).overlap).toBe(0);
  });
});

describe("triplanar sampling", () => {
  it("uses normalised absolute-normal masks and blends sRGB colors in linear light", () => {
    const blackAndWhite: SurfaceSampler = {
      sample(u, v) {
        return {
          color: u === v ? [0, 0, 0, 255] : [255, 255, 255, 255],
          roughness: 1,
          bump: 0,
        };
      },
    };
    const sample = sampleTriplanarSurface(blackAndWhite, [0.75, 0.5, 0.5], [1, 1, 0]);
    expect(sample.color).toEqual([188, 188, 188, 255]);

    const scaled = sampleTriplanarSurface(where, [0.25, 0.5, 0.75], [0, 0, 4], { scale: 2 });
    expect(scaled.color[0]).toBe(Math.round(0.5 * 255));
    expect(scaled.color[1]).toBe(Math.round(1 * 255));
  });

  it("fails instead of quietly normalising invalid projections or samples", () => {
    expect(() => sampleTriplanarSurface(where, [0, 0, 0], [0, 0, 0])).toThrow(
      "sampleTriplanarSurface: normal must have non-zero finite length",
    );
    expect(() => sampleTriplanarSurface(where, [Number.NaN, 0, 0], [0, 0, 1])).toThrow(
      "sampleTriplanarSurface: point[0] must be finite",
    );
    expect(() => sampleTriplanarSurface(where, [0, 0, 0], [0, 0, 1], { scale: 0 })).toThrow(
      "sampleTriplanarSurface: scale must be a positive finite number",
    );
    expect(() =>
      sampleTriplanarSurface(
        { sample: () => ({ color: [256, 0, 0, 255], roughness: 0, bump: 0 }) },
        [0, 0, 0],
        [0, 0, 1],
      ),
    ).toThrow("sampleTriplanarSurface: sampler sample color[0] must be between 0 and 255");
  });

  it("uses the same alpha-normalised weights for every material channel", () => {
    const opaqueAndTransparent: SurfaceSampler = {
      sample(u) {
        return u === 0
          ? { color: [0, 0, 0, 255], roughness: 0, bump: -1, metalness: 0 }
          : { color: [255, 255, 255, 0], roughness: 1, bump: 1, metalness: 1 };
      },
    };
    const mixed = sampleTriplanarSurface(opaqueAndTransparent, [1, 0, 0], [1, 1, 0]);
    expect(mixed).toEqual({ color: [0, 0, 0, 128], roughness: 0, bump: -1, metalness: 0 });

    const empty = sampleTriplanarSurface(
      { sample: () => ({ color: [255, 255, 255, 0], roughness: 1, bump: 1, metalness: 1 }) },
      [0, 0, 0],
      [1, 1, 0],
    );
    expect(empty).toEqual({ color: [0, 0, 0, 0], roughness: 0, bump: 0, metalness: 0 });
  });

  it("keeps a dominant projection representable at high finite sharpness", () => {
    const sample = sampleTriplanarSurface(where, [0.4, 0.3, 0.2], [0.9, 0.8, 0], {
      sharpness: 1_000_000_000,
    });
    // The x projection is dominant and reads [z, y] = [0.2, 0.3].
    expect(sample).toEqual({ color: [51, 77, 0, 255], roughness: 0.2, bump: -0.4 });
  });
});

describe("UV atlas baking", () => {
  it("samples each pixel centre through its triangle surface and remains call-order deterministic", () => {
    const mesh = triangle([0, 0, 1, 0, 0, 1]);
    const first = bakeUvAtlas(mesh, where, { width: 8, height: 8, padding: 0 });
    sampleTriplanarSurface(where, [0.9, 0.8, 0.7], [1, 1, 1]);
    const second = bakeUvAtlas(mesh, where, { width: 8, height: 8, padding: 0 });
    expect(second).toEqual(first);
    // Pixel (1, 6) has atlas uv (1.5 / 8, 1 - 6.5 / 8), therefore point (u, v, 0).
    const pixel = (6 * 8 + 1) * 4;
    expect(first.color[pixel]).toBe(Math.round((1.5 / 8) * 255));
    expect(first.color[pixel + 1]).toBe(Math.round((1.5 / 8) * 255));
    // At this coarse size the top-left rule assigns the diagonal's eight centres
    // to one side, so 28 of 64 centres belong to this winding.
    expect(first.covered).toBe(28 / 64);
  });

  it("pads only from written texels, bounds padding, and rejects overlapping layouts", () => {
    const mesh = triangle([0, 0, 0.5, 0, 0, 1]);
    const bare = bakeUvAtlas(mesh, where, { width: 16, height: 16, padding: 0 });
    const padded = bakeUvAtlas(mesh, where, { width: 16, height: 16, padding: 2 });
    const inside = (8 * 16 + 7) * 4;
    const pastEdge = (8 * 16 + 8) * 4;
    expect(bare.color[pastEdge + 3]).toBe(0);
    expect(padded.color[pastEdge]).toBe(padded.color[inside]);
    expect(() => bakeUvAtlas(mesh, where, { width: 16, height: 16, padding: 17 })).toThrow(
      "bakeUvAtlas: padding must not exceed the largest atlas dimension",
    );

    const doubled: NeutralIndexedMesh = {
      positions: new Float32Array([0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 1, 0, 1, 0, 1, 1]),
      uvs: new Float32Array([0, 0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1]),
      indices: new Uint16Array([0, 1, 2, 3, 4, 5]),
    };
    expect(() => bakeUvAtlas(doubled, where, { width: 16, height: 16 })).toThrow(
      "bakeUvAtlas: UV layout overlaps and cannot be baked safely",
    );
  });

  it("rejects every clipped or degenerate chart and caps combined raster and padding work", () => {
    const outside = triangle([-0.00001, 0, 1, 0, 0, 1]);
    const degenerate = triangle([0.5, 0.5, 0.500000000001, 0.5, 0.5, 0.500000000001]);
    expect(createReskinPlan(outside).projection).toBe("triplanar");
    expect(createReskinPlan(degenerate).projection).toBe("triplanar");
    expect(() => bakeUvAtlas(outside, where, { width: 16, height: 16 })).toThrow(
      "bakeUvAtlas: UV layout extends outside the unit atlas",
    );
    expect(() => bakeUvAtlas(degenerate, where, { width: 16, height: 16 })).toThrow(
      "bakeUvAtlas: UV layout contains degenerate triangles",
    );
    expect(() =>
      bakeUvAtlas(triangle([0, 0, 1, 0, 0, 1]), where, { width: 2048, height: 2048, padding: 64 }),
    ).toThrow("bakeUvAtlas: combined raster and padding work exceeds 67108864");
  });
});
