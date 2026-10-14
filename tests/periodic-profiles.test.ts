import { describe, expect, it } from 'vitest';

import { createPeriodicRidgeProfile, sampleCosineProfile } from '../src/periodicProfiles.ts';

describe('periodic ridge profile', () => {
  const profile = createPeriodicRidgeProfile({ crest: 0.75, risePower: 2 });

  it('matches independently derived CPU vectors with derivatives per cycle', () => {
    const vectors = [
      [0, 0, 0],
      [0.375, 0.5, 2.0943951023931953],
      [0.75, 1, 0],
      [0.875, 0.5, -6],
      [1, 0, 0],
      [-0.125, 0.5, -6],
      [-0.625, 0.5, 2.0943951023931953],
    ];
    for (const [coordinate, value, derivative] of vectors) {
      expect(profile(coordinate).value).toBeCloseTo(value, 14);
      expect(profile(coordinate).derivative).toBeCloseTo(derivative, 14);
    }
  });

  it('repeats through positive and negative cycles without depending on call order', () => {
    const coordinates = [-4.875, -0.625, 0, 0.125, 0.375, 0.75, 0.875, 5.375];
    const samples = coordinates.map(profile);
    for (const index of [7, 1, 5, 0, 3, 6, 2, 4, 1]) {
      expect(profile(coordinates[index])).toEqual(samples[index]);
    }
    for (const coordinate of coordinates) {
      for (const cycles of [-20, -1, 0, 1, 20]) {
        expect(profile(coordinate + cycles)).toEqual(profile(coordinate));
      }
    }
  });

  it('returns exact zero slopes at wraps and crests and approaches them on both sides', () => {
    const asymmetric = createPeriodicRidgeProfile({ crest: 0.75, risePower: 1.6 });
    for (const coordinate of [-3, -0, 0, 1, 5, -2.25, 0.75, 4.75]) {
      expect(asymmetric(coordinate).derivative).toBe(0);
      expect(Object.is(asymmetric(coordinate).derivative, -0)).toBe(false);
    }
    expect(asymmetric(-Number.MIN_VALUE)).toEqual({ value: 0, derivative: 0 });
    for (const join of [0, 0.75]) {
      for (const side of [-1, 1]) {
        let previous = Number.POSITIVE_INFINITY;
        for (const epsilon of [1e-3, 1e-5, 1e-7]) {
          const slope = Math.abs(asymmetric(join + side * epsilon).derivative);
          expect(slope).toBeLessThan(previous);
          previous = slope;
        }
        expect(previous).toBeLessThan(0.001);
      }
    }
  });

  it('matches independent central finite differences across each segment', () => {
    for (const risePower of [1.6, 2, 4.5]) {
      const sampler = createPeriodicRidgeProfile({ crest: 0.7, risePower });
      for (const coordinate of [-1.89, -0.62, -0.19, 0.14, 0.49, 0.77, 0.93, 2.35]) {
        const epsilon = 1e-6;
        const numerical =
          (sampler(coordinate + epsilon).value - sampler(coordinate - epsilon).value) /
          (2 * epsilon);
        expect(sampler(coordinate).derivative).toBeCloseTo(numerical, 7);
      }
    }
  });

  it('retains the asymmetric rise and fall under reversal of the scalar coordinate', () => {
    expect(profile(0.125).value).toBeCloseTo(0.06698729810778067, 14);
    expect(profile(-0.125).value).toBe(0.5);
    expect(profile(0.125).derivative).toBeGreaterThan(0);
    expect(profile(-0.125).derivative).toBeLessThan(0);
  });

  it('captures constructor options and returns independent sample records', () => {
    const options = { crest: 0.75, risePower: 2 };
    const sampler = createPeriodicRidgeProfile(options);
    options.crest = 0.2;
    options.risePower = 7;
    const sample = sampler(0.875);
    sample.value = 42;
    sample.derivative = 42;
    expect(sampler(0.875)).toEqual({ value: 0.5, derivative: -6 });
  });

  it('rejects missing, nonfinite, and nonrepresentable constructor parameters', () => {
    for (const crest of [undefined, NaN, Infinity, -Infinity, -1, 0, 1, 2, Number.MIN_VALUE]) {
      expect(() => createPeriodicRidgeProfile({ crest: crest as number, risePower: 2 })).toThrow(
        /createPeriodicRidgeProfile/
      );
    }
    for (const risePower of [undefined, NaN, Infinity, -Infinity, -1, 0, 1]) {
      expect(() => createPeriodicRidgeProfile({ crest: 0.75, risePower: risePower as number })).toThrow(
        /createPeriodicRidgeProfile/
      );
    }
    expect(() => createPeriodicRidgeProfile(null as never)).toThrow(/options/);
    expect(() => createPeriodicRidgeProfile(undefined as never)).toThrow(/options/);
  });

  it('supports narrow finite segments but rejects derivative overflow when sampled', () => {
    const tiny = createPeriodicRidgeProfile({ crest: 1e-308, risePower: 2 });
    expect(Number.isFinite(tiny(0.5e-308).derivative)).toBe(true);
    const overflow = createPeriodicRidgeProfile({ crest: 6e-309, risePower: 2 });
    expect(() => overflow(3e-309)).toThrow(/derivative/);
    expect(overflow(0)).toEqual({ value: 0, derivative: 0 });
    const nearOne = createPeriodicRidgeProfile({ crest: 1 - Number.EPSILON, risePower: 2 });
    expect(nearOne(1 - Number.EPSILON / 2)).toEqual({ value: 0.5, derivative: -6755399441055744 });
  });
});

describe('cosine profile', () => {
  it('matches independent quadrature values and analytic derivatives', () => {
    const vectors = [
      [0, 1, 0],
      [0.25, 0, -6.283185307179586],
      [0.5, -1, 0],
      [0.75, 0, 6.283185307179586],
      [-0.25, 0, 6.283185307179586],
    ];
    for (const [coordinate, value, derivative] of vectors) {
      expect(sampleCosineProfile(coordinate).value).toBeCloseTo(value, 14);
      expect(sampleCosineProfile(coordinate).derivative).toBeCloseTo(derivative, 14);
    }
  });

  it('preserves the unreduced coordinate multiplication order', () => {
    for (const coordinate of [-37.13, -0.125, 0.31, 2.17, 2 ** 40 + 0.125]) {
      const angle = coordinate * Math.PI * 2;
      expect(sampleCosineProfile(coordinate)).toEqual({
        value: Math.cos(angle),
        derivative: -Math.sin(angle) * Math.PI * 2,
      });
    }
  });

  it('is periodic within floating argument-reduction error and matches finite differences', () => {
    for (const coordinate of [-2.13, -0.27, 0.31, 1.89]) {
      expect(sampleCosineProfile(coordinate + 3).value).toBeCloseTo(
        sampleCosineProfile(coordinate).value,
        13
      );
      const epsilon = 1e-6;
      const numerical =
        (sampleCosineProfile(coordinate + epsilon).value -
          sampleCosineProfile(coordinate - epsilon).value) /
        (2 * epsilon);
      expect(sampleCosineProfile(coordinate).derivative).toBeCloseTo(numerical, 7);
    }
  });
});

describe('periodic numerical domain', () => {
  it('rejects nonfinite coordinates and loss of fractional-cycle resolution', () => {
    const ridge = createPeriodicRidgeProfile({ crest: 0.75, risePower: 2 });
    for (const sampler of [ridge, sampleCosineProfile]) {
      for (const coordinate of [NaN, Infinity, -Infinity, 2 ** 52, -(2 ** 52), Number.MAX_VALUE]) {
        expect(() => sampler(coordinate)).toThrow(/coordinate/);
      }
      expect(Number.isFinite(sampler(2 ** 52 - 0.5).value)).toBe(true);
      expect(Number.isFinite(sampler(-(2 ** 52) + 0.5).derivative)).toBe(true);
    }
  });
});
