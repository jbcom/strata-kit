import { describe, expect, it } from 'vitest';

import { createSeededTerrainField, type SeededTerrainOptions } from '../src/terrain.ts';

const pairedBiomes = [
  { type: 'forest' as const, center: [-10, 0] as const, radius: 10 },
  { type: 'desert' as const, center: [10, 0] as const, radius: 10 },
];

describe('seeded terrain fields', () => {
  it('blends biome profiles continuously and deterministically when requested', () => {
    const options = { seed: 'blended-biomes', biomes: pairedBiomes, biomeBlend: 0.5 };
    const first = createSeededTerrainField(options);
    const second = createSeededTerrainField(options);

    expect(first.heightAt(-0.001, 0)).toBeCloseTo(first.heightAt(0.001, 0), 2);
    expect(first.heightAt(-0.001, 0)).toBe(second.heightAt(-0.001, 0));
    expect(first.heightAt(12, -3)).toBe(second.heightAt(12, -3));
  });

  it('captures an optional biome blend and preserves a single biome profile exactly', () => {
    const mutable: SeededTerrainOptions = {
      seed: 'captured-blend',
      biomes: [{ type: 'mountain', center: [0, 0], radius: 10 }],
      biomeBlend: 0.25,
    };
    const captured = createSeededTerrainField(mutable);
    const legacy = createSeededTerrainField({
      seed: 'captured-blend',
      biomes: [{ type: 'mountain', center: [0, 0], radius: 10 }],
    });
    const beforeMutation = captured.heightAt(3, -2);

    mutable.biomeBlend = 0;
    mutable.biomes[0] = { type: 'marsh', center: [3, -2], radius: 1 };

    expect(captured.heightAt(3, -2)).toBe(beforeMutation);
    expect(captured.heightAt(3, -2)).toBe(legacy.heightAt(3, -2));
  });

  it('rejects invalid blends and overflowed blended biome distances', () => {
    for (const biomeBlend of [-1, Number.NaN, Number.POSITIVE_INFINITY]) {
      expect(() =>
        createSeededTerrainField({ seed: 'invalid-blend', biomes: pairedBiomes, biomeBlend }),
      ).toThrow('createSeededTerrainField: biomeBlend must be a non-negative finite number');
    }

    const overflowed = createSeededTerrainField({
      seed: 'overflowed-distance',
      biomeBlend: 1,
      biomes: [
        { type: 'forest', center: [0, 0], radius: Number.MIN_VALUE },
        { type: 'desert', center: [1, 0], radius: Number.MIN_VALUE },
      ],
    });
    expect(() => overflowed.heightAt(Number.MAX_VALUE, 0)).toThrow(
      'heightAt: normalized biome distances must include a finite value',
    );
  });

  it('keeps exact biome centers finite when a valid radius is smaller than a Float32 value', () => {
    const tinyRadius = createSeededTerrainField({
      seed: 'tiny-radius-center',
      biomeBlend: 1,
      biomes: [
        { type: 'forest', center: [0, 0], radius: Number.MIN_VALUE },
        { type: 'desert', center: [1, 0], radius: Number.MIN_VALUE },
      ],
    });
    const legacyForest = createSeededTerrainField({
      seed: 'tiny-radius-center',
      biomes: [{ type: 'forest', center: [0, 0], radius: Number.MIN_VALUE }],
    });

    expect(tinyRadius.heightAt(0, 0)).toBe(legacyForest.heightAt(0, 0));
    expect(Number.isFinite(tinyRadius.heightAt(1, 0))).toBe(true);
  });

  it('blends a large biome list without spreading it into a function call', () => {
    const field = createSeededTerrainField({
      seed: 'many-biomes',
      biomeBlend: 1,
      biomes: Array.from({ length: 200_000 }, () => ({
        type: 'forest' as const,
        center: [0, 0] as const,
        radius: 10,
      })),
    });

    expect(Number.isFinite(field.heightAt(0, 0))).toBe(true);
  });

  it('rejects unrepresentable and oversized heightfields before allocation', () => {
    const field = createSeededTerrainField({ seed: 'heightfield-guards', biomes: pairedBiomes });

    expect(() => field.createHeightfield({ width: 1_001, depth: 1_000, cellSize: 1 })).toThrow(
      'createHeightfield: vertex count must not exceed 1000000',
    );
    expect(() => field.createHeightfield({ width: 2, depth: 2, cellSize: Number.MIN_VALUE })).toThrow(
      'createHeightfield: x axis samples must remain distinct after Float32 quantization',
    );
  });

  it('caps scatter work while retaining an empty result and seeded output', () => {
    const field = createSeededTerrainField({ seed: 'scatter-budget', biomes: pairedBiomes });

    expect(field.scatter({ count: 0, area: 1 })).toEqual([]);
    expect(field.scatter({ count: 3, area: 4, seed: 'stable' })).toEqual(
      field.scatter({ count: 3, area: 4, seed: 'stable' }),
    );
    expect(() => field.scatter({ count: 1_000_001, area: 1 })).toThrow(
      'scatter: count must not exceed 1000000',
    );
  });
});
