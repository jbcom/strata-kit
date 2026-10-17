import { describe, expect, it } from "vitest";

import {
  createSeededTerrainField,
  type HeightfieldMesh,
  type SeededTerrainField,
} from "../src/terrain.ts";

function createLegacyHeightfield(
  field: SeededTerrainField,
  options: { width: number; depth: number; cellSize: number },
): HeightfieldMesh {
  const { width, depth, cellSize } = options;
  const positions = new Float32Array(width * depth * 3);
  const normals = new Float32Array(width * depth * 3);
  const indices = new Uint32Array((width - 1) * (depth - 1) * 6);
  for (let z = 0; z < depth; z += 1) {
    for (let x = 0; x < width; x += 1) {
      const offset = (z * width + x) * 3;
      const worldX = (x - (width - 1) / 2) * cellSize;
      const worldZ = (z - (depth - 1) / 2) * cellSize;
      const height = field.heightAt(worldX, worldZ);
      const slopeX =
        field.heightAt(worldX + cellSize, worldZ) - field.heightAt(worldX - cellSize, worldZ);
      const slopeZ =
        field.heightAt(worldX, worldZ + cellSize) - field.heightAt(worldX, worldZ - cellSize);
      const inverseLength = 1 / Math.hypot(-slopeX, 2 * cellSize, -slopeZ);
      positions.set([worldX, height, worldZ], offset);
      normals.set(
        [-slopeX * inverseLength, 2 * cellSize * inverseLength, -slopeZ * inverseLength],
        offset,
      );
    }
  }
  let cursor = 0;
  for (let z = 0; z < depth - 1; z += 1) {
    for (let x = 0; x < width - 1; x += 1) {
      const topLeft = z * width + x;
      indices.set(
        [topLeft, topLeft + width, topLeft + 1, topLeft + 1, topLeft + width, topLeft + width + 1],
        cursor,
      );
      cursor += 6;
    }
  }
  return { positions, normals, indices, width, depth };
}

function incidentDots(mesh: HeightfieldMesh): number[] {
  const result: number[] = [];
  for (let offset = 0; offset < mesh.indices.length; offset += 3) {
    const a = mesh.indices[offset] * 3;
    const b = mesh.indices[offset + 1] * 3;
    const c = mesh.indices[offset + 2] * 3;
    const abx = mesh.positions[b] - mesh.positions[a];
    const aby = mesh.positions[b + 1] - mesh.positions[a + 1];
    const abz = mesh.positions[b + 2] - mesh.positions[a + 2];
    const acx = mesh.positions[c] - mesh.positions[a];
    const acy = mesh.positions[c + 1] - mesh.positions[a + 1];
    const acz = mesh.positions[c + 2] - mesh.positions[a + 2];
    const crossX = aby * acz - abz * acy;
    const crossY = abz * acx - abx * acz;
    const crossZ = abx * acy - aby * acx;
    const scale = Math.max(Math.abs(crossX), Math.abs(crossY), Math.abs(crossZ));
    expect(scale).toBeGreaterThan(0);
    const inverseLength = 1 / Math.hypot(crossX / scale, crossY / scale, crossZ / scale);
    for (let corner = 0; corner < 3; corner += 1) {
      const normal = mesh.indices[offset + corner] * 3;
      result.push(
        (crossX / scale) * inverseLength * mesh.normals[normal] +
          (crossY / scale) * inverseLength * mesh.normals[normal + 1] +
          (crossZ / scale) * inverseLength * mesh.normals[normal + 2],
      );
    }
  }
  return result;
}

describe("heightfield incident normals", () => {
  it("repairs the built-in nearest-biome discontinuity without changing heightfield layout", () => {
    const field = createSeededTerrainField({
      seed: "normal-audit",
      biomes: [
        { type: "forest", center: [0, 0], radius: 0.1 },
        { type: "desert", center: [0, 0], radius: 100 },
      ],
    });
    const options = { width: 17, depth: 17, cellSize: 0.25 };
    const legacy = createLegacyHeightfield(field, options);
    const mesh = field.createHeightfield(options);

    expect(incidentDots(legacy).filter((value) => value <= 0)).toHaveLength(7);
    expect(
      incidentDots(legacy).reduce((minimum, dot) => Math.min(minimum, dot), Infinity),
    ).toBeCloseTo(-0.331134880744995, 12);
    expect(incidentDots(mesh).every((value) => value > 0)).toBe(true);
    expect(mesh.positions).toEqual(legacy.positions);
    expect(mesh.indices).toEqual(legacy.indices);
    expect(mesh.positions).toHaveLength(options.width * options.depth * 3);
    expect(mesh.normals).toHaveLength(options.width * options.depth * 3);
    expect(mesh.indices).toHaveLength((options.width - 1) * (options.depth - 1) * 6);
  });

  it("keeps smooth heightfield buffers byte-identical to central differences", () => {
    const field = createSeededTerrainField({
      seed: "smooth-heightfield-normals",
      biomes: [{ type: "forest", center: [0, 0], radius: 10 }],
    });
    const options = { width: 9, depth: 7, cellSize: 0.5 };
    const legacy = createLegacyHeightfield(field, options);
    const mesh = field.createHeightfield(options);

    expect(incidentDots(legacy).every((value) => value > 0)).toBe(true);
    expect(mesh.positions).toEqual(legacy.positions);
    expect(mesh.normals).toEqual(legacy.normals);
    expect(mesh.indices).toEqual(legacy.indices);
  });
});
