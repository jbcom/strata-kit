import { describe, expect, it, vi } from "vitest";

const noiseCalls = vi.hoisted(() => ({
  count: 0,
  watchedFirstOctave: null as { x: number; z: number } | null,
  watchedFirstOctaveCount: 0,
}));

vi.mock("../src/noise.ts", async (importOriginal) => {
  const original = await importOriginal<typeof import("../src/noise.ts")>();
  return {
    ...original,
    createSeededNoise: (...args: Parameters<typeof original.createSeededNoise>) => {
      const noise = original.createSeededNoise(...args);
      return (x: number, y: number, z?: number) => {
        noiseCalls.count += 1;
        const watched = noiseCalls.watchedFirstOctave;
        if (watched && y === 0 && Object.is(x, watched.x) && Object.is(z, watched.z)) {
          noiseCalls.watchedFirstOctaveCount += 1;
        }
        return noise(x, y, z);
      };
    },
  };
});

import { createSeededTerrainField, type SeededTerrainField } from "../src/terrain.ts";

function createUncachedHeightfield(
  field: SeededTerrainField,
  options: { width: number; depth: number; cellSize: number },
): ReturnType<SeededTerrainField["createHeightfield"]> {
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
      const slopeX = field.heightAt(worldX + cellSize, worldZ) - field.heightAt(worldX - cellSize, worldZ);
      const slopeZ = field.heightAt(worldX, worldZ + cellSize) - field.heightAt(worldX, worldZ - cellSize);
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

describe("heightfield exact-coordinate cache", () => {
  const options = { width: 9, depth: 7, cellSize: 0.1 };
  const field = createSeededTerrainField({
    seed: "heightfield-cache",
    biomeBlend: 0.35,
    biomes: [
      { type: "forest", center: [-4, 0], radius: 8 },
      { type: "desert", center: [4, 0], radius: 8 },
    ],
  });

  it("does not exceed the integer-grid five-point halo's distinct samples", () => {
    const width = 9;
    const depth = 7;
    const cellSize = 1;
    noiseCalls.count = 0;
    createSeededTerrainField({
      seed: "integer-halo",
      biomes: [{ type: "forest", center: [0, 0], radius: 8 }],
    }).createHeightfield({ width, depth, cellSize });

    const uniqueFivePointHaloSamples = (width + 2) * depth + 2 * width;
    expect(noiseCalls.count).toBeLessThanOrEqual(uniqueFivePointHaloSamples * 7);
  });

  it("keeps positions, normals, and indices byte-identical to uncached height calls", () => {
    noiseCalls.count = 0;
    const cached = field.createHeightfield(options);
    const uncached = createUncachedHeightfield(field, options);

    expect(cached.positions).toEqual(uncached.positions);
    expect(cached.normals).toEqual(uncached.normals);
    expect(cached.indices).toEqual(uncached.indices);
  });

  it("resamples a far-right height after the fixed live-entry budget is reached", () => {
    const width = 70_000;
    const depth = 2;
    const cellSize = 1;
    const farRightX = ((width - 1) - (width - 1) / 2) * cellSize;
    const firstRowZ = (-(depth - 1) / 2) * cellSize;
    noiseCalls.count = 0;
    noiseCalls.watchedFirstOctave = { x: farRightX * 0.02, z: firstRowZ * 0.02 };
    noiseCalls.watchedFirstOctaveCount = 0;

    createSeededTerrainField({
      seed: "wide-cache-budget",
      biomes: [{ type: "forest", center: [0, 0], radius: 8 }],
    }).createHeightfield({ width, depth, cellSize });

    // The selected point occurs at the right edge in the first row twice and
    // as the next row's lower Z normal sample once. An uncapped cache would
    // invoke its first octave once; the bounded cache must invoke it all three times.
    expect(noiseCalls.watchedFirstOctaveCount).toBe(3);
    noiseCalls.watchedFirstOctave = null;
  });
});
