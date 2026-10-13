import { describe, expect, it } from 'vitest';

import { createWearField } from '../src/wear.ts';

describe('wear-field-v1', () => {
  it('captures options, is pure across call order, and returns no wear at amount zero', () => {
    const options = { seed: 'wear-snapshot', scale: 1.25, amount: 0.7, edgeBias: 0.6, bottomBias: 0.8 };
    const field = createWearField(options);
    const expected = field.sample(0.3, 0.8);
    options.scale = 99;
    options.amount = 0;

    expect(field.sample(0.3, 0.8)).toEqual(expected);
    field.sample(0.9, 0.1);
    expect(field.sample(0.3, 0.8)).toEqual(expected);
    expect(createWearField({ ...options, amount: 0 }).sample(0.3, 0.8)).toMatchObject({
      chip: 0,
      steel: 0,
      oxide: 0,
      drip: 0,
    });
  });

  it('exposes normalized broad, mid, and fine bands independently of coverage amount', () => {
    const options = { seed: 'wear-bands', scale: 1.5, amount: 0.7, edgeBias: 0.4, bottomBias: 0.2 };
    const field = createWearField(options);
    const first = field.sample(0.37, 0.61);
    const repeat = field.sample(0.37, 0.61);
    const zeroAmount = createWearField({ ...options, amount: 0 }).sample(0.37, 0.61);
    const differentSeed = createWearField({ ...options, seed: 'wear-bands-other' }).sample(0.37, 0.61);

    expect(first).toMatchObject({
      broad: expect.any(Number),
      mid: expect.any(Number),
      fine: expect.any(Number),
    });
    for (const band of [first.broad, first.mid, first.fine]) {
      expect(band).toBeGreaterThanOrEqual(0);
      expect(band).toBeLessThanOrEqual(1);
    }
    expect(repeat).toEqual(first);
    expect(zeroAmount).toMatchObject({ chip: 0, steel: 0, oxide: 0, drip: 0 });
    expect([zeroAmount.broad, zeroAmount.mid, zeroAmount.fine]).toEqual([
      first.broad,
      first.mid,
      first.fine,
    ]);
    expect([differentSeed.broad, differentSeed.mid, differentSeed.fine]).not.toEqual([
      first.broad,
      first.mid,
      first.fine,
    ]);
  });

  it('keeps coherent stages ordered, uses the pinned deterministic fixture, and changes with seed', () => {
    const options = { seed: 'wear-fixture', scale: 1, amount: 1, edgeBias: 0.6, bottomBias: 0.8 };
    const sample = createWearField(options).sample(0.5, 0.5);

    expect(sample).toMatchObject({
      chip: expect.closeTo(0.6734603841281469, 12),
      steel: expect.closeTo(0, 12),
      oxide: expect.closeTo(0, 12),
      drip: expect.closeTo(0.30075636225640573, 12),
    });
    expect(sample.oxide).toBeLessThanOrEqual(sample.steel);
    expect(sample.steel).toBeLessThanOrEqual(sample.chip);
    expect(createWearField({ ...options, seed: 'other-wear-fixture' }).sample(0.5, 0.5)).not.toEqual(sample);
  });

  it('keeps masks unscaled and orients edge and gravity-down bias in normalized UV space', () => {
    const base = { seed: 'wear-direction', scale: 3, amount: 1, edgeBias: 1, bottomBias: 1 };
    const field = createWearField(base);
    const edgeAverage = average(field, 0.03, 0.5, 0.04, 0);
    const centerAverage = average(field, 0.5, 0.5, 0.04, 0);
    const topAverage = average(field, 0.5, 0.1, 0, 0.04);
    const bottomAverage = average(field, 0.5, 0.9, 0, 0.04);

    expect(edgeAverage).toBeGreaterThan(centerAverage);
    expect(bottomAverage).toBeGreaterThan(topAverage);
  });

  it('rejects invalid options and non-finite sampling coordinates', () => {
    const base = { seed: 'wear-invalid', scale: 1, amount: 1, edgeBias: 0, bottomBias: 0 };
    expect(() => createWearField({ ...base, scale: 0 })).toThrow(
      'createWearField: scale must be a positive finite number'
    );
    expect(() => createWearField({ ...base, amount: 1.1 })).toThrow(
      'createWearField: amount must be a finite number between 0 and 1'
    );
    expect(() => createWearField({ ...base, edgeBias: Number.NaN })).toThrow(
      'createWearField: edgeBias must be a finite number between 0 and 1'
    );
    expect(() => createWearField({ ...base, bottomBias: -0.1 })).toThrow(
      'createWearField: bottomBias must be a finite number between 0 and 1'
    );
    expect(() => createWearField(base).sample(Number.POSITIVE_INFINITY, 0)).toThrow(
      'createWearField: u must be finite'
    );
  });
});

function average(
  field: ReturnType<typeof createWearField>,
  u: number,
  v: number,
  uStep: number,
  vStep: number
): number {
  const samples = Array.from({ length: 9 }, (_, index) => {
    const offset = index - 4;
    return field.sample(u + offset * uStep, v + offset * vStep).chip;
  });
  return samples.reduce((total, value) => total + value, 0) / samples.length;
}
