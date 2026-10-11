import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import { createSeededTerrainField } from '../src/terrain.ts';
import { bakeSurface, createSurfacePlan } from '../src/materials.ts';

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
    expect(bakeSurface(plan, { width: 8, height: 8 })).toEqual(
      bakeSurface(plan, { width: 8, height: 8 })
    );
  });
});
