import { describe, expect, it } from 'vitest';

import {
  bakeSurface,
  composeSurfaceLayers,
  createSurfacePlan,
  createSurfaceSampler,
  type SurfaceSampler,
} from '../src/materials.ts';

function sampler(sample: SurfaceSampler['sample']): SurfaceSampler {
  return { sample };
}

describe('surface samplers and bakes', () => {
  it('snapshots a plan and keeps the legacy bake bytes unchanged', () => {
    const plan = createSurfacePlan({ seed: 'materials-snapshot', scale: 1.5, baseColor: [0.2, 0.4, 0.6] });
    const surface = createSurfaceSampler(plan);
    const before = surface.sample(0.25, 0.75);
    (plan.baseColor as [number, number, number])[0] = 1;
    plan.scale = 99;

    expect(surface.sample(0.25, 0.75)).toEqual(before);

    const legacy = bakeSurface(createSurfacePlan({ seed: 'surface-contract', scale: 1.5 }), {
      width: 8,
      height: 8,
    });
    expect(Array.from(legacy.color.slice(0, 16))).toEqual([
      122, 122, 122, 255, 114, 114, 114, 255, 127, 127, 127, 255, 114, 114, 114, 255,
    ]);
    expect(Array.from(legacy.roughness.slice(0, 4))).toEqual([111, 135, 156, 196]);
    expect(Array.from(legacy.bump.slice(0, 4))).toEqual([163, 101, 198, 106]);
    expect(legacy.metalness).toBeUndefined();
  });

  it('bakes sampler pixels at centers and creates an R8 metalness map only when supplied', () => {
    const calls: Array<readonly [number, number]> = [];
    const bake = bakeSurface(
      sampler((u, v) => {
        calls.push([u, v]);
        return {
          color: [u * 255, v * 255, 0, 255],
          roughness: u,
          bump: v * 2 - 1,
          metalness: 0.25,
        };
      }),
      { width: 2, height: 1 }
    );

    expect(calls).toEqual([
      [0.25, 0.5],
      [0.75, 0.5],
    ]);
    expect(Array.from(bake.color)).toEqual([64, 128, 0, 255, 191, 128, 0, 255]);
    expect(Array.from(bake.roughness)).toEqual([64, 191]);
    expect(Array.from(bake.bump)).toEqual([128, 128]);
    expect(Array.from(bake.metalness ?? [])).toEqual([64, 64]);
  });

  it('rejects unsafe dimensions and invalid or inconsistent sampled channels', () => {
    const valid = sampler(() => ({ color: [0, 0, 0, 255], roughness: 0, bump: 0 }));
    expect(() => bakeSurface(valid, { width: 0, height: 1 })).toThrow(
      'bakeSurface: width and height must be positive integers'
    );
    expect(() => bakeSurface(valid, { width: 4_194_305, height: 1 })).toThrow(
      'bakeSurface: pixel count must not exceed 4194304'
    );
    expect(() => bakeSurface(valid, { width: Number.MAX_SAFE_INTEGER, height: 2 })).toThrow(
      'bakeSurface: pixel count must be a safe integer'
    );
    expect(() =>
      bakeSurface(sampler(() => ({ color: [0, 0, 0, 256], roughness: 0, bump: 0 })), {
        width: 1,
        height: 1,
      })
    ).toThrow('bakeSurface: sample.color[3] must be a finite number between 0 and 255');
    expect(() =>
      bakeSurface(sampler(() => ({ color: [0, 0, 0, 255], roughness: Number.NaN, bump: 0 })), {
        width: 1,
        height: 1,
      })
    ).toThrow('bakeSurface: sample.roughness must be a finite number between 0 and 1');
    expect(() =>
      bakeSurface(
        sampler((u) => ({
          color: [0, 0, 0, 255],
          roughness: 0,
          bump: 0,
          ...(u < 0.5 ? { metalness: 0 } : {}),
        })),
        { width: 2, height: 1 }
      )
    ).toThrow('bakeSurface: sample.metalness must be consistently present or absent');
  });

  it('composes source-over layers in linear light with masks and snapshots the layer list', () => {
    const base = sampler(() => ({ color: [0, 0, 0, 255], roughness: 0.2, bump: -0.5, metalness: 0 }));
    const red = sampler(() => ({ color: [255, 0, 0, 128], roughness: 0.8, bump: 0.5, metalness: 1 }));
    const blue = sampler(() => ({ color: [0, 0, 255, 128], roughness: 0.4, bump: 0, metalness: 0.5 }));
    const layers = [{ sampler: red, mask: () => 0.5 }, { sampler: blue }];
    const composed = composeSurfaceLayers(base, layers);
    layers.length = 0;

    const sample = composed.sample(0.25, 0.75);
    // Linear-light compositing, then sRGB encoding: the blue top layer dominates red.
    expect(sample.color).toEqual([99, 0, 188, 255]);
    expect(sample.roughness).toBeCloseTo(0.375391003, 9);
    expect(sample.bump).toBeCloseTo(-0.12402153, 9);
    expect(sample.metalness).toBeCloseTo(0.37597847, 9);

    const transparent = composeSurfaceLayers(
      sampler(() => ({ color: [0, 0, 0, 0], roughness: 0.8, bump: 0.5 })),
      []
    ).sample(0.5, 0.5);
    expect(transparent).toEqual({ color: [0, 0, 0, 0], roughness: 0, bump: 0 });
    expect(() =>
      composeSurfaceLayers(base, [{ sampler: red, mask: () => Number.NaN }]).sample(0, 0)
    ).toThrow('composeSurfaceLayers: layer[0].mask result must be a finite number between 0 and 1');
  });

  it('preserves metalness presence through transparent output and blends missing channels as dielectric', () => {
    const transparentThenOpaque = composeSurfaceLayers(
      sampler((u) => ({
        color: [0, 0, 0, u < 0.5 ? 0 : 255],
        roughness: 0.4,
        bump: 0,
        metalness: 1,
      })),
      []
    );
    expect(transparentThenOpaque.sample(0.25, 0.5)).toEqual({
      color: [0, 0, 0, 0],
      roughness: 0,
      bump: 0,
      metalness: 0,
    });
    expect(Array.from(bakeSurface(transparentThenOpaque, { width: 2, height: 1 }).metalness ?? [])).toEqual([
      0, 255,
    ]);

    const dielectricOverMetal = composeSurfaceLayers(
      sampler(() => ({ color: [0, 0, 0, 255], roughness: 0.4, bump: 0, metalness: 1 })),
      [{ sampler: sampler(() => ({ color: [255, 255, 255, 255], roughness: 0.6, bump: 0 })), mask: () => 0.5 }]
    ).sample(0.5, 0.5);
    expect(dielectricOverMetal.metalness).toBeCloseTo(0.5, 12);
  });

  it('accumulates each sampled layer before another sampler can reuse its scratch output', () => {
    const scratch = { color: [0, 0, 0, 128] as [number, number, number, number], roughness: 0.5, bump: 0 };
    const reuseScratch = (color: [number, number, number, number]): SurfaceSampler =>
      sampler(() => {
        scratch.color = color;
        return scratch;
      });
    const composed = composeSurfaceLayers(
      sampler(() => ({ color: [0, 0, 0, 0], roughness: 0, bump: 0 })),
      [
        { sampler: reuseScratch([255, 0, 0, 128]) },
        { sampler: reuseScratch([0, 0, 255, 128]) },
      ]
    );

    const sample = composed.sample(0.5, 0.5);
    expect(sample.color[0]).toBeGreaterThan(0);
    expect(sample.color).toEqual([156, 0, 213, 192]);
  });
});
