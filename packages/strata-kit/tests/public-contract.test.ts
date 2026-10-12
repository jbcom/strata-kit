import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import { bakeSurface, createSurfaceBakeManifest, createSurfacePlan, sampleSurface } from '../src/materials.ts';
import { createSeededNoise, createSeededRandom, fractalNoise, seedToUint32 } from '../src/noise.ts';
import {
  opIntersection,
  opSmoothSubtraction,
  opSmoothUnion,
  opSubtraction,
  opUnion,
  sdBox,
  sdPlane,
  sdSphere,
} from '../src/sdf.ts';
import { seededSurfaceNoiseGlsl } from '../src/shaders.ts';
import { createSeededTerrainField, type Biome } from '../src/terrain.ts';
import { createThreeHeightfieldGeometry } from '../src/three.ts';

const directory = dirname(fileURLToPath(import.meta.url));
const manifest = JSON.parse(readFileSync(resolve(directory, '../package.json'), 'utf8')) as {
  exports: Record<string, unknown>;
  name: string;
  peerDependencies?: Record<string, string>;
};

describe('strata-kit public contract', () => {
  it('publishes only the procedural spine and optional renderer adapters', () => {
    expect(manifest.name).toBe('strata-kit');
    expect(Object.keys(manifest.exports).sort()).toEqual([
      '.',
      './materials',
      './noise',
      './r3f',
      './sdf',
      './shaders',
      './terrain',
      './three',
    ]);
    expect(manifest.peerDependencies).toMatchObject({
      '@react-three/fiber': expect.any(String),
      react: expect.any(String),
      three: expect.any(String),
    });
    expect(manifest).toMatchObject({ engines: { node: '>=22' } });
  });

  it('makes terrain and surface bakes deterministic for an explicit seed', () => {
    const field = createSeededTerrainField({
      seed: 'public-contract',
      biomes: [{ type: 'mountain', center: [0, 0], radius: 40 }],
    });
    const first = field.sample({ x: 3.5, y: 2, z: -7.25 });
    const second = field.sample({ x: 3.5, y: 2, z: -7.25 });
    const changed = createSeededTerrainField({
      seed: 'different-seed',
      biomes: [{ type: 'mountain', center: [0, 0], radius: 40 }],
    }).sample({ x: 3.5, y: 2, z: -7.25 });

    expect(first).toEqual(second);
    expect(first).toEqual({
      height: -12.613173602975714,
      caveDistance: 5.953289595456592,
      distance: 14.613173602975714,
    });
    expect(first.height).not.toBe(changed.height);

    const aboveGround = field.sample({ x: 3.5, y: first.height + 2, z: -7.25 });
    const belowGround = field.sample({ x: 3.5, y: first.height - 2, z: -7.25 });
    expect(aboveGround.distance).toBeGreaterThan(0);
    expect(belowGround.distance).toBeLessThan(0);

    const carvedCave = Array.from({ length: 1681 }, (_, index) => {
      const x = (index % 41) - 20;
      const z = Math.floor(index / 41) - 20;
      const y = -6;
      return { point: { x, y, z }, sample: field.sample({ x, y, z }) };
    }).find(({ point, sample }) => sample.caveDistance < 0 && point.y < sample.height);
    expect(carvedCave).toBeDefined();
    expect(carvedCave?.sample.distance).toBeGreaterThan(0);

    const plan = createSurfacePlan({ seed: 'surface-contract', scale: 1.5 });
    const bake = bakeSurface(plan, { width: 8, height: 8 });
    expect(bake).toEqual(bakeSurface(plan, { width: 8, height: 8 }));
    expect(Array.from(bake.color.slice(0, 16))).toEqual([
      122, 122, 122, 255, 114, 114, 114, 255, 127, 127, 127, 255, 114, 114, 114, 255,
    ]);
    expect(Array.from(bake.roughness.slice(0, 4))).toEqual([111, 135, 156, 196]);
    expect(Array.from(bake.bump.slice(0, 4))).toEqual([163, 101, 198, 106]);
    expect(bake).not.toEqual(
      bakeSurface(createSurfacePlan({ seed: 'other-surface-contract', scale: 1.5 }), {
        width: 8,
        height: 8,
      })
    );

    const manifest = createSurfaceBakeManifest(plan, bake);
    expect(manifest.baseColor).toEqual([0.5, 0.5, 0.5]);
    expect(manifest.maps).toEqual([
      { name: 'color', format: 'rgba8', channels: 4, byteStride: 4 },
      { name: 'roughness', format: 'r8', channels: 1, byteStride: 1 },
      { name: 'bump', format: 'r8', channels: 1, byteStride: 1 },
    ]);
    const color = Array.from(bake.color.slice(0, manifest.maps[0].byteStride));
    expect(color).toEqual(sampleSurface(plan, 0.5 / 8, 0.5 / 8).color);
    expect(bake.roughness[0]).toBeGreaterThanOrEqual(0);
    expect(bake.bump[0]).toBeGreaterThanOrEqual(0);

    const geometry = createThreeHeightfieldGeometry(
      field.createHeightfield({ width: 3, depth: 2, cellSize: 1 })
    );
    expect(Array.from(geometry.getAttribute('uv').array)).toEqual([0, 0, 0.5, 0, 1, 0, 0, 1, 0.5, 1, 1, 1]);
    expect(seededSurfaceNoiseGlsl).toContain('float strataKitNoise(vec3 point, float seed)');
    expect(seededSurfaceNoiseGlsl).toContain('return mix(lower, upper, local.z);');
  });

  it('rejects non-finite public inputs before they contaminate generated data', () => {
    expect(() => sdSphere({ x: 0, y: 0, z: 0 }, { x: 0, y: 0, z: 0 }, Number.NaN)).toThrow(
      'sdSphere: radius must be a positive finite number'
    );
    expect(() => opSmoothUnion(0, 1, Number.NaN)).toThrow(
      'opSmoothUnion: radius must be a positive finite number'
    );
    expect(() => createSeededNoise('finite')(Number.NaN, 0)).toThrow(
      'createSeededNoise: x must be finite'
    );
    expect(() => fractalNoise(createSeededNoise('finite'), 0, 0, 0, 0)).toThrow(
      'fractalNoise: octaves must be a positive integer'
    );
    expect(() => seedToUint32(Number.POSITIVE_INFINITY)).toThrow(
      'seedToUint32: seed must be a string or finite number'
    );
    expect(() =>
      createSurfacePlan({ seed: 'finite', scale: Number.POSITIVE_INFINITY })
    ).toThrow('createSurfacePlan: scale must be a positive finite number');
    expect(() => createSurfacePlan({ seed: 'finite', baseColor: [0, Number.NaN, 0] })).toThrow(
      'createSurfacePlan: baseColor[1] must be a finite number between 0 and 1'
    );
    expect(() =>
      createSeededTerrainField({
        seed: 'finite',
        biomes: [{ type: 'forest', center: [Number.NaN, 0], radius: 10 }],
      })
    ).toThrow('createSeededTerrainField: biomes[0].center[0] must be finite');

    const field = createSeededTerrainField({
      seed: 'finite',
      biomes: [{ type: 'forest', center: [0, 0], radius: 10 }],
    });
    expect(() => field.createHeightfield({ width: 2, depth: 2, cellSize: Number.POSITIVE_INFINITY })).toThrow(
      'createHeightfield: cellSize must be a positive finite number'
    );
  });

  it('keeps all signed-distance operators finite and validates their geometric inputs', () => {
    expect(opUnion(2, -3)).toBe(-3);
    expect(opIntersection(2, -3)).toBe(2);
    expect(opSubtraction(2, -3)).toBe(3);
    expect(opSmoothUnion(2, -3, 1)).toBeLessThanOrEqual(-3);
    expect(opSmoothSubtraction(2, -3, 1)).toBeGreaterThanOrEqual(3);
    expect(sdPlane({ x: 1, y: 4, z: -2 }, 1)).toBe(3);
    expect(sdBox({ x: 2, y: 0, z: 0 }, { x: 0, y: 0, z: 0 }, { x: 1, y: 1, z: 1 })).toBe(1);
    expect(() => sdBox({ x: 0, y: 0, z: 0 }, { x: 0, y: 0, z: 0 }, { x: 0, y: 1, z: 1 })).toThrow(
      'sdBox: halfExtents.x must be a positive finite number'
    );
    expect(() => sdPlane({ x: 0, y: Number.NaN, z: 0 })).toThrow('sdPlane: point.y must be finite');
    expect(() =>
      sdSphere(
        { x: Number.MAX_VALUE, y: 0, z: 0 },
        { x: -Number.MAX_VALUE, y: 0, z: 0 },
        1
      )
    ).toThrow('sdSphere: result must be finite');
    expect(() =>
      sdBox(
        { x: Number.MAX_VALUE, y: 0, z: 0 },
        { x: -Number.MAX_VALUE, y: 0, z: 0 },
        { x: 1, y: 1, z: 1 }
      )
    ).toThrow('sdBox: result must be finite');
  });

  it('generates finite terrain meshes and reproducible scatter across biome profiles', () => {
    const biomes = ['marsh', 'forest', 'desert', 'tundra', 'savanna', 'mountain', 'scrubland'] as const;
    for (const type of biomes) {
      const field = createSeededTerrainField({
        seed: type,
        biomes: [{ type, center: [0, 0], radius: 8 }],
      });
      expect(Number.isFinite(field.heightAt(1, -1))).toBe(true);
      expect(field.sample({ x: 1, y: -3, z: -1 }).caveDistance).toBeLessThanOrEqual(1000);
    }

    const field = createSeededTerrainField({
      seed: 'mesh-and-scatter',
      biomes: [
        { type: 'forest', center: [0, 0], radius: 2 },
        { type: 'desert', center: [10, 0], radius: 20 },
      ],
    });
    const mesh = field.createHeightfield({ width: 3, depth: 3, cellSize: 1 });
    expect([...mesh.positions, ...mesh.normals].every(Number.isFinite)).toBe(true);
    expect(mesh.indices).toHaveLength(24);
    expect(field.scatter({ count: 3, area: 4, seed: 'scatter' })).toEqual(
      field.scatter({ count: 3, area: 4, seed: 'scatter' })
    );
    expect(() => field.scatter({ count: -1, area: 4 })).toThrow('scatter: count must be a non-negative integer');

    const mutableOptions = {
      seed: 'captured-seed',
      biomes: [{ type: 'forest' as const, center: [0, 0] as const, radius: 8 }],
    };
    const captured = createSeededTerrainField(mutableOptions);
    mutableOptions.seed = 'mutated-after-construction';
    expect(captured.scatter({ count: 3, area: 4 })).toEqual(
      captured.scatter({ count: 3, area: 4, seed: 'captured-seed' })
    );

    const mutableBiomes: Biome[] = [{ type: 'forest', center: [0, 0], radius: 8 }];
    const snapshotField = createSeededTerrainField({ seed: 'captured-biomes', biomes: mutableBiomes });
    const snapshotHeight = snapshotField.heightAt(100, 0);
    mutableBiomes.push({ type: 'mountain', center: [100, 0], radius: 8 });
    expect(snapshotField.heightAt(100, 0)).toBe(snapshotHeight);

    expect(() => field.createHeightfield({ width: 2, depth: 2, cellSize: 1e39 })).toThrow(
      'createHeightfield: grid extent must fit finite Float32 positions'
    );
  });

  it('keys random streams and bake provenance with every surface input', () => {
    const first = createSeededRandom('random');
    const second = createSeededRandom('random');
    expect([first(), first(), first()]).toEqual([second(), second(), second()]);
    expect(seedToUint32('random')).not.toBe(seedToUint32('other-random'));

    const callerColor: [number, number, number] = [0.1, 0.2, 0.3];
    const plan = createSurfacePlan({ seed: 'custom-color', scale: 2, baseColor: callerColor });
    const bake = bakeSurface(plan, { width: 2, height: 2 });
    callerColor[0] = 0.9;
    expect(plan.baseColor).toEqual([0.1, 0.2, 0.3]);
    expect(createSurfaceBakeManifest(plan, bake).baseColor).toEqual([0.1, 0.2, 0.3]);
    expect(() => bakeSurface(plan, { width: 0, height: 2 })).toThrow(
      'bakeSurface: width and height must be positive integers'
    );
    expect(() => createSurfacePlan({ seed: 'color', baseColor: [0.1, 0.2] as never })).toThrow(
      'createSurfacePlan: baseColor must contain exactly three channels'
    );
  });
});
