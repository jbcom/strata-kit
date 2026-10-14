import { describe, expect, it } from "vitest";

import { bakeSurface, composeSurfaceLayers, type SurfaceSampler } from "../src/materials.ts";
import { createSeededNoise } from "../src/noise.ts";
import { bakeUvAtlas, createReskinPlan, type NeutralIndexedMesh } from "../src/reskin.ts";

type Point = readonly [number, number, number];
type Pose = (point: Point) => Point;
type CoordinateSpace = "rest" | "moving";

interface InstanceBake {
  readonly atlas: ReturnType<typeof bakeUvAtlas>;
  readonly surface: ReturnType<typeof bakeSurface>;
  /** The separately posed geometry an instance would render. */
  readonly renderedPositions: Float32Array;
}

function seamAwareRestMesh(): NeutralIndexedMesh {
  // Two adjacent charts share a geometric edge but duplicate its vertices at the UV seam.
  return {
    positions: new Float32Array([
      0, 0, 0, 1, 0, 0, 1, 1, 0, 0, 1, 0, 1, 0, 0, 2, 0, 0, 2, 1, 0, 1, 1, 0,
    ]),
    uvs: new Float32Array([0, 0, 0.45, 0, 0.45, 1, 0, 1, 0.55, 0, 1, 0, 1, 1, 0.55, 1]),
    indices: new Uint16Array([0, 1, 2, 0, 2, 3, 4, 5, 6, 4, 6, 7]),
  };
}

function surfaceFor(seed: string): SurfaceSampler {
  const grain = createSeededNoise(`${seed}:grain`);
  const dust = createSeededNoise(`${seed}:dust`);
  const base: SurfaceSampler = {
    sample(u, v) {
      const value = grain(u * 1.7, v * 1.7, 3) * 0.5 + 0.5;
      return {
        color: [72 + value * 58, 88 + value * 42, 108 + value * 35, 255],
        roughness: 0.24 + value * 0.5,
        bump: 0,
      };
    },
  };
  const dustLayer: SurfaceSampler = {
    sample(u, v) {
      const value = dust(u * 3.2 + 7, v * 2.3 - 5, 11) * 0.5 + 0.5;
      return {
        color: [138 + value * 45, 123 + value * 38, 104 + value * 32, 180],
        roughness: 0.56 + value * 0.32,
        bump: 0,
      };
    },
  };
  return composeSurfaceLayers(base, [
    {
      sampler: dustLayer,
      mask(u, v) {
        return Math.min(1, Math.max(0, dust(u * 4.7 - 2, v * 3.9 + 13, 19) * 0.5 + 0.5));
      },
    },
  ]);
}

/**
 * Test-only consumer mapping: it always builds posed render positions, then selects the
 * coordinate field that the UV atlas reads. Switching to `moving` models the defect this
 * contract prevents; the returned mesh is the one actually passed to `bakeUvAtlas`.
 */
function mapInstanceForBake(
  rest: NeutralIndexedMesh,
  pose: Pose,
  coordinateSpace: CoordinateSpace,
): { readonly renderedPositions: Float32Array; readonly bakeMesh: NeutralIndexedMesh } {
  const renderedPositions = new Float32Array(rest.positions.length);
  for (let offset = 0; offset < rest.positions.length; offset += 3) {
    const point = pose([
      rest.positions[offset],
      rest.positions[offset + 1],
      rest.positions[offset + 2],
    ]);
    renderedPositions.set(point, offset);
  }
  const bakePositions =
    coordinateSpace === "rest" ? new Float32Array(rest.positions) : renderedPositions;
  return {
    renderedPositions,
    bakeMesh: {
      positions: bakePositions,
      uvs: new Float32Array(rest.uvs),
      indices: new Uint16Array(rest.indices),
    },
  };
}

function bakeInstance(
  seed: string,
  rest: NeutralIndexedMesh,
  pose: Pose,
  coordinateSpace: CoordinateSpace,
): InstanceBake {
  const sampler = surfaceFor(seed);
  const mapped = mapInstanceForBake(rest, pose, coordinateSpace);
  return {
    atlas: bakeUvAtlas(mapped.bakeMesh, sampler, { width: 32, height: 32, padding: 1 }),
    surface: bakeSurface(sampler, { width: 16, height: 16 }),
    renderedPositions: mapped.renderedPositions,
  };
}

function bytes(value: Uint8Array): number[] {
  return Array.from(value);
}

describe("rest-bound layered surface bakes", () => {
  it("keeps fixed seam-aware rest UV bakes stable across poses, deterministic seeds, and isolated instances", () => {
    const rest = seamAwareRestMesh();
    const original = {
      positions: new Float32Array(rest.positions),
      uvs: new Float32Array(rest.uvs),
      indices: new Uint16Array(rest.indices),
    };
    expect(createReskinPlan(rest, { gridSize: 64 }).projection).toBe("uv");
    expect(rest.uvs.slice(2, 4)).not.toEqual(rest.uvs.slice(8, 10));
    expect(rest.uvs.slice(4, 6)).not.toEqual(rest.uvs.slice(14, 16));

    const foldedPose: Pose = ([x, y, z]) => [
      x * 0.63 + y * 0.38,
      y * 1.24 + Math.sin(x) * 0.27,
      z + x * 0.42,
    ];
    const raisedPose: Pose = ([x, y, z]) => [
      x * 1.16 - y * 0.31 + 0.2,
      y * 0.74 + 0.8,
      z - x * 0.51,
    ];
    const seed = "rest-bound-layer-30";

    const first = bakeInstance(seed, rest, foldedPose, "rest");
    const second = bakeInstance(seed, rest, raisedPose, "rest");
    const otherSeed = bakeInstance("rest-bound-layer-other", rest, foldedPose, "rest");
    const restored = bakeInstance(seed, rest, foldedPose, "rest");

    expect(first.renderedPositions).not.toEqual(second.renderedPositions);
    expect(first.atlas.covered).toBeLessThan(1);
    expect(first.atlas.covered).toBeGreaterThan(0.8);
    expect(first.surface.metalness).toBeUndefined();
    expect(first.atlas.metalness).toBeUndefined();
    expect(Array.from(first.surface.bump).every((value) => value === 128)).toBe(true);
    for (let pixel = 0; pixel < first.atlas.bump.length; pixel += 1) {
      const alpha = first.atlas.color[pixel * 4 + 3];
      expect(first.atlas.bump[pixel]).toBe(alpha === 0 ? 0 : 128);
    }
    expect(bytes(first.atlas.color)).toEqual(bytes(second.atlas.color));
    expect(bytes(first.atlas.roughness)).toEqual(bytes(second.atlas.roughness));
    expect(bytes(first.surface.color)).toEqual(bytes(second.surface.color));
    expect(bytes(first.surface.roughness)).toEqual(bytes(second.surface.roughness));
    expect(bytes(first.atlas.color)).not.toEqual(bytes(otherSeed.atlas.color));
    expect(bytes(first.atlas.roughness)).not.toEqual(bytes(otherSeed.atlas.roughness));
    expect(bytes(first.surface.color)).not.toEqual(bytes(otherSeed.surface.color));
    expect(bytes(first.surface.roughness)).not.toEqual(bytes(otherSeed.surface.roughness));
    expect(bytes(first.atlas.color)).toEqual(bytes(restored.atlas.color));
    expect(bytes(first.atlas.roughness)).toEqual(bytes(restored.atlas.roughness));
    expect(bytes(first.surface.color)).toEqual(bytes(restored.surface.color));
    expect(bytes(first.surface.roughness)).toEqual(bytes(restored.surface.roughness));

    expect(rest.positions).toEqual(original.positions);
    expect(rest.uvs).toEqual(original.uvs);
    expect(rest.indices).toEqual(original.indices);
    expect(first.atlas.color).not.toBe(second.atlas.color);
    expect(first.atlas.roughness).not.toBe(second.atlas.roughness);
    expect(first.surface.color).not.toBe(second.surface.color);
    expect(first.surface.roughness).not.toBe(second.surface.roughness);
    const secondAtlas = new Uint8Array(second.atlas.color);
    const secondAtlasRoughness = new Uint8Array(second.atlas.roughness);
    const secondSurface = new Uint8Array(second.surface.color);
    const secondSurfaceRoughness = new Uint8Array(second.surface.roughness);
    first.atlas.color[0] ^= 0xff;
    first.atlas.roughness[0] ^= 0xff;
    first.surface.color[0] ^= 0xff;
    first.surface.roughness[0] ^= 0xff;
    expect(second.atlas.color).toEqual(secondAtlas);
    expect(second.atlas.roughness).toEqual(secondAtlasRoughness);
    expect(second.surface.color).toEqual(secondSurface);
    expect(second.surface.roughness).toEqual(secondSurfaceRoughness);
  });

  it("would expose a moving-coordinate atlas fault when a posed instance replaces rest coordinates", () => {
    const rest = seamAwareRestMesh();
    const pose: Pose = ([x, y, z]) => [x * 0.48 + y * 0.73, y * 1.31 + 0.15, z + x * 0.66];
    const restBound = bakeInstance("rest-bound-layer-30", rest, pose, "rest");
    const movingCoordinate = bakeInstance("rest-bound-layer-30", rest, pose, "moving");

    expect(movingCoordinate.renderedPositions).toEqual(restBound.renderedPositions);
    expect(bytes(movingCoordinate.atlas.color)).not.toEqual(bytes(restBound.atlas.color));
    expect(bytes(movingCoordinate.atlas.roughness)).not.toEqual(bytes(restBound.atlas.roughness));
  });
});
