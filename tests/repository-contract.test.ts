import { readFileSync, readdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

const directory = dirname(fileURLToPath(import.meta.url));
const packageDirectory = resolve(directory, '..');
const sourceDirectory = resolve(packageDirectory, 'src');
const pureEntrypoints = [
  'index.ts',
  'noise.ts',
  'sdf.ts',
  'terrain.ts',
  'materials.ts',
  'shaders.ts',
  'surfaceFields.ts',
  'validation.ts',
];

describe('strata-procedural repository boundary', () => {
  it('keeps pure entrypoints renderer/framework free and forbids implicit randomness', () => {
    for (const entrypoint of pureEntrypoints) {
      const source = readFileSync(resolve(sourceDirectory, entrypoint), 'utf8');
      expect(source).not.toMatch(/from ['"](?:three|react|@react-three\/fiber)['"]/);
      expect(source).not.toContain('Math.random');
    }
  });

  it('does not add hidden source entrypoints outside the declared export contract', () => {
    const declared = new Set([
      'index.ts',
      'noise.ts',
      'sdf.ts',
      'terrain.ts',
      'materials.ts',
      'shaders.ts',
      'surfaceFields.ts',
      'three.ts',
      'r3f.tsx',
      'validation.ts',
    ]);
    expect(readdirSync(sourceDirectory).filter((entry) => /\.tsx?$/.test(entry)).sort()).toEqual([...declared].sort());
  });
});
