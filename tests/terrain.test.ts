import { describe, expect, it } from "vitest";

import { createSeededTerrainField, type SeededTerrainOptions } from "../src/terrain.ts";

const pairedBiomes = [
  { type: "forest" as const, center: [-10, 0] as const, radius: 10 },
  { type: "desert" as const, center: [10, 0] as const, radius: 10 },
];

describe("seeded terrain fields", () => {
  it.each([1e-200, 1e200])("selects exact nearest centers at extreme radius %s", (radius) => {
    const forest = { type: "forest" as const, center: [0, 0] as const, radius };
    const desert = { type: "desert" as const, center: [2, 0] as const, radius };
    const expected = createSeededTerrainField({ seed: "nearest-tiny", biomes: [desert] }).heightAt(
      2,
      0,
    );
    for (const biomes of [
      [forest, desert],
      [desert, forest],
    ]) {
      expect(createSeededTerrainField({ seed: "nearest-tiny", biomes }).heightAt(2, 0)).toBe(
        expected,
      );
    }
  });

  it("ranks distinct overflowed nearest-biome distances and preserves true first-entry ties", () => {
    const forest = { type: "forest" as const, center: [0, 0] as const, radius: 1e-200 };
    const desert = { type: "desert" as const, center: [3, 0] as const, radius: 1e-200 };
    const seed = "nearest-overflow";
    const expected = createSeededTerrainField({ seed, biomes: [desert] }).heightAt(2, 0);
    for (const biomes of [
      [forest, desert],
      [desert, forest],
    ]) {
      expect(createSeededTerrainField({ seed, biomes }).heightAt(2, 0)).toBe(expected);
      const tie = createSeededTerrainField({ seed, biomes }).heightAt(1.5, 0);
      expect(tie).toBe(createSeededTerrainField({ seed, biomes: [biomes[0]!] }).heightAt(1.5, 0));
    }
  });

  it("blends biome profiles continuously and deterministically when requested", () => {
    const options = { seed: "blended-biomes", biomes: pairedBiomes, biomeBlend: 0.5 };
    const first = createSeededTerrainField(options);
    const second = createSeededTerrainField(options);

    expect(first.heightAt(-0.001, 0)).toBeCloseTo(first.heightAt(0.001, 0), 2);
    expect(first.heightAt(-0.001, 0)).toBe(second.heightAt(-0.001, 0));
    expect(first.heightAt(12, -3)).toBe(second.heightAt(12, -3));
  });

  it("captures an optional biome blend and preserves a single biome profile exactly", () => {
    const mutable: SeededTerrainOptions = {
      seed: "captured-blend",
      biomes: [{ type: "mountain", center: [0, 0], radius: 10 }],
      biomeBlend: 0.25,
    };
    const captured = createSeededTerrainField(mutable);
    const legacy = createSeededTerrainField({
      seed: "captured-blend",
      biomes: [{ type: "mountain", center: [0, 0], radius: 10 }],
    });
    const beforeMutation = captured.heightAt(3, -2);

    mutable.biomeBlend = 0;
    mutable.biomes[0] = { type: "marsh", center: [3, -2], radius: 1 };

    expect(captured.heightAt(3, -2)).toBe(beforeMutation);
    expect(captured.heightAt(3, -2)).toBe(legacy.heightAt(3, -2));
  });

  it("rejects invalid biome blends", () => {
    for (const biomeBlend of [-1, Number.NaN, Number.POSITIVE_INFINITY]) {
      expect(() =>
        createSeededTerrainField({ seed: "invalid-blend", biomes: pairedBiomes, biomeBlend }),
      ).toThrow("createSeededTerrainField: biomeBlend must be a non-negative finite number");
    }
  });

  it("preserves equal and near overflowed biome distances with log-space weights", () => {
    const field = createSeededTerrainField({
      seed: "overflowed-distance",
      biomeBlend: 1,
      biomes: [
        { type: "forest", center: [0, 0], radius: Number.MIN_VALUE },
        { type: "desert", center: [2, 0], radius: Number.MIN_VALUE },
      ],
    });
    const forest = createSeededTerrainField({
      seed: "overflowed-distance",
      biomes: [{ type: "forest", center: [0, 0], radius: Number.MIN_VALUE }],
    });
    const desert = createSeededTerrainField({
      seed: "overflowed-distance",
      biomes: [{ type: "desert", center: [2, 0], radius: Number.MIN_VALUE }],
    });
    const tieX = 1;
    const nearTieX = 1 + 1e-12;

    expect(field.heightAt(tieX, 0)).toBe((forest.heightAt(tieX, 0) + desert.heightAt(tieX, 0)) / 2);
    expect(field.heightAt(nearTieX, 0)).toBe(desert.heightAt(nearTieX, 0));
  });

  it("ranks overflowed coordinate differences without losing the closer biome", () => {
    const field = createSeededTerrainField({
      seed: "coordinate-overflow",
      biomeBlend: 1,
      biomes: [
        { type: "forest", center: [-Number.MAX_VALUE, 0], radius: 1 },
        { type: "desert", center: [-Number.MAX_VALUE / 2, 0], radius: 1 },
      ],
    });
    const desert = createSeededTerrainField({
      seed: "coordinate-overflow",
      biomes: [{ type: "desert", center: [-Number.MAX_VALUE / 2, 0], radius: 1 }],
    });

    expect(field.heightAt(Number.MAX_VALUE, 0)).toBe(desert.heightAt(Number.MAX_VALUE, 0));
  });

  it("preserves mixed finite and overflowed distance weights at a huge blend", () => {
    const field = createSeededTerrainField({
      seed: "mixed-overflow",
      biomeBlend: 1e308,
      biomes: [
        { type: "forest", center: [0, 0], radius: 1e-154 },
        { type: "desert", center: [2, 0], radius: 1e-154 / Math.SQRT2 },
      ],
    });
    const forest = createSeededTerrainField({
      seed: "mixed-overflow",
      biomes: [{ type: "forest", center: [0, 0], radius: 1e-154 }],
    });
    const desert = createSeededTerrainField({
      seed: "mixed-overflow",
      biomes: [{ type: "desert", center: [2, 0], radius: 1e-154 / Math.SQRT2 }],
    });
    const forestHeight = forest.heightAt(1, 0);
    const desertHeight = desert.heightAt(1, 0);
    const fartherWeight = Math.exp(-1);
    const expected = (forestHeight + desertHeight * fartherWeight) / (1 + fartherWeight);

    // The log reconstruction includes radius-division rounding, so compare beyond meaningful precision.
    expect(field.heightAt(1, 0)).toBeCloseTo(expected, 10);
  });

  it("keeps exact biome centers finite when a valid radius is smaller than a Float32 value", () => {
    const tinyRadius = createSeededTerrainField({
      seed: "tiny-radius-center",
      biomeBlend: 1,
      biomes: [
        { type: "forest", center: [0, 0], radius: Number.MIN_VALUE },
        { type: "desert", center: [1, 0], radius: Number.MIN_VALUE },
      ],
    });
    const legacyForest = createSeededTerrainField({
      seed: "tiny-radius-center",
      biomes: [{ type: "forest", center: [0, 0], radius: Number.MIN_VALUE }],
    });

    expect(tinyRadius.heightAt(0, 0)).toBe(legacyForest.heightAt(0, 0));
    expect(Number.isFinite(tinyRadius.heightAt(1, 0))).toBe(true);
  });

  it("blends a large biome list without spreading it into a function call", () => {
    const field = createSeededTerrainField({
      seed: "many-biomes",
      biomeBlend: 1,
      biomes: Array.from({ length: 200_000 }, () => ({
        type: "forest" as const,
        center: [0, 0] as const,
        radius: 10,
      })),
    });

    expect(Number.isFinite(field.heightAt(0, 0))).toBe(true);
  });

  it("rejects unrepresentable and oversized heightfields before allocation", () => {
    const field = createSeededTerrainField({ seed: "heightfield-guards", biomes: pairedBiomes });

    expect(() => field.createHeightfield({ width: 1_001, depth: 1_000, cellSize: 1 })).toThrow(
      "createHeightfield: vertex count must not exceed 1000000",
    );
    expect(() =>
      field.createHeightfield({ width: 2, depth: 2, cellSize: Number.MIN_VALUE }),
    ).toThrow("createHeightfield: x axis samples must remain distinct after Float32 quantization");
  });

  it("caps scatter work while retaining an empty result and seeded output", () => {
    const field = createSeededTerrainField({ seed: "scatter-budget", biomes: pairedBiomes });

    expect(field.scatter({ count: 0, area: 1 })).toEqual([]);
    expect(field.scatter({ count: 3, area: 4, seed: "stable" })).toEqual(
      field.scatter({ count: 3, area: 4, seed: "stable" }),
    );
    expect(() => field.scatter({ count: 1_000_001, area: 1 })).toThrow(
      "scatter: count must not exceed 1000000",
    );
  });
});
