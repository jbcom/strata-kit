#!/usr/bin/env node

import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const packageRoot = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const npm = process.platform === 'win32' ? 'npm.cmd' : 'npm';
const npmOptions = {
  encoding: 'utf8',
  env: {
    ...Object.fromEntries(
      Object.entries(process.env).filter(([key]) => !key.toLowerCase().startsWith('npm_config_'))
    ),
  },
  shell: process.platform === 'win32',
  stdio: 'pipe',
};
const pureEntrypoints = [
  'strata-procedural',
  'strata-procedural/noise',
  'strata-procedural/sdf',
  'strata-procedural/terrain',
  'strata-procedural/materials',
  'strata-procedural/shaders',
  'strata-procedural/surface-fields',
];
const allEntrypoints = [...pureEntrypoints, 'strata-procedural/three', 'strata-procedural/r3f'];

function sha256(file) {
  return createHash('sha256').update(readFileSync(file)).digest('hex');
}

function pack(destination) {
  const output = execFileSync(npm, ['pack', '--ignore-scripts', '--json', '--pack-destination', destination], {
    ...npmOptions,
    cwd: packageRoot,
  });
  const [manifest] = JSON.parse(output);
  assert(manifest?.filename, `npm pack returned no package manifest: ${output}`);
  return { manifest, tarball: path.join(destination, manifest.filename) };
}

function installConsumer(destination, args) {
  writeFileSync(path.join(destination, 'package.json'), '{"private":true,"type":"module"}\n');
  execFileSync(npm, ['install', '--no-audit', '--no-fund', ...args], {
    ...npmOptions,
    cwd: destination,
  });
}

function importEntrypoints(destination, entrypoints, message) {
  const program = `await Promise.all(${JSON.stringify(entrypoints)}.map((entry) => import(entry)));`;
  execFileSync(process.execPath, ['--input-type=module', '--eval', program], {
    cwd: destination,
    encoding: 'utf8',
    stdio: 'pipe',
  });
  process.stdout.write(`${message}\n`);
}

function assertPureConsumerHasNoAdapters(destination) {
  const program = `
    import { createRequire } from 'node:module';
    const require = createRequire(import.meta.url);
    for (const dependency of ['three', 'react', '@react-three/fiber']) {
      try {
        require.resolve(dependency);
        throw new Error(\`unexpected optional peer: \${dependency}\`);
      } catch (error) {
        if (error.message.startsWith('unexpected optional peer:')) throw error;
        if (error.code !== 'MODULE_NOT_FOUND') throw error;
      }
    }
  `;
  execFileSync(process.execPath, ['--input-type=module', '--eval', program], {
    cwd: destination,
    encoding: 'utf8',
    stdio: 'pipe',
  });
}

const firstPackDirectory = mkdtempSync(path.join(tmpdir(), 'strata-procedural-pack-a-'));
const secondPackDirectory = mkdtempSync(path.join(tmpdir(), 'strata-procedural-pack-b-'));
const pureConsumerDirectory = mkdtempSync(path.join(tmpdir(), 'strata-procedural-pure-'));
const adapterConsumerDirectory = mkdtempSync(path.join(tmpdir(), 'strata-procedural-adapter-'));

try {
  const first = pack(firstPackDirectory);
  const second = pack(secondPackDirectory);
  assert.equal(sha256(first.tarball), sha256(second.tarball), 'npm pack must be byte-for-byte reproducible');

  const packedPaths = new Set(first.manifest.files.map((file) => file.path));
  for (const required of [
    'LICENSE',
    'README.md',
    'CHANGELOG.md',
    'docs/API.md',
    'docs/ARCHITECTURE.md',
    'docs/RELEASE.md',
    'package.json',
    'dist/index.js',
    'dist/noise.js',
    'dist/sdf.js',
    'dist/terrain.js',
    'dist/materials.js',
    'dist/shaders.js',
    'dist/surface-fields.js',
    'dist/three.js',
    'dist/r3f.js',
  ]) {
    assert(packedPaths.has(required), `packed artifact is missing ${required}`);
  }
  for (const forbiddenPrefix of ['src/', 'tests/', 'scripts/', 'coverage/']) {
    assert(
      [...packedPaths].every((file) => !file.startsWith(forbiddenPrefix)),
      `packed artifact unexpectedly contains ${forbiddenPrefix}`
    );
  }

  installConsumer(pureConsumerDirectory, ['--omit=optional', first.tarball]);
  assertPureConsumerHasNoAdapters(pureConsumerDirectory);
  importEntrypoints(pureConsumerDirectory, pureEntrypoints, 'pure packed consumer imports every renderer-free entrypoint');

  installConsumer(adapterConsumerDirectory, [
    first.tarball,
    'three@0.186.1',
    'react@19.3.0',
    'react-dom@19.3.0',
    '@react-three/fiber@9.8.1',
  ]);
  importEntrypoints(adapterConsumerDirectory, allEntrypoints, 'adapter packed consumer imports every public entrypoint');

  console.log(`strata-procedural: checked ${first.manifest.entryCount} packed files and both optional-peer modes`);
} finally {
  for (const directory of [
    firstPackDirectory,
    secondPackDirectory,
    pureConsumerDirectory,
    adapterConsumerDirectory,
  ]) {
    rmSync(directory, { recursive: true, force: true });
  }
}
