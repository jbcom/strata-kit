import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, relative } from 'node:path';
import { getPublishablePackages, workspaceRoot } from './workspace-packages.mjs';

function run(command, args, options = {}) {
  return execFileSync(command, args, {
    cwd: workspaceRoot,
    encoding: 'utf8',
    maxBuffer: 64 * 1024 * 1024,
    ...options,
  });
}

function exportTargets(value) {
  if (typeof value === 'string') return [value];
  if (!value || typeof value !== 'object') return [];
  return Object.values(value).flatMap(exportTargets);
}

function targetExists(files, target) {
  const normalized = target.replace(/^\.\//, '');
  if (!normalized.includes('*')) return files.has(normalized);

  const [prefix, suffix] = normalized.split('*');
  return [...files].some((file) => file.startsWith(prefix) && file.endsWith(suffix));
}

function metadataErrors(manifest, directory) {
  const errors = [];
  const required = ['name', 'version', 'description', 'license', 'repository', 'homepage', 'bugs'];

  for (const key of required) {
    if (!manifest[key]) errors.push(`${directory}: missing package metadata field ${key}`);
  }

  if (manifest.publishConfig?.access !== 'public') {
    errors.push(`${directory}: publishConfig.access must be public`);
  }
  if (!manifest.files?.length) errors.push(`${directory}: files allowlist is required`);
  if (!manifest.exports) errors.push(`${directory}: exports map is required`);
  if (manifest.packageManager) errors.push(`${directory}: published manifests must not pin a package manager`);

  return errors;
}

const temporaryDirectory = await mkdtemp(join(tmpdir(), 'strata-pack-'));

try {
  const packages = await getPublishablePackages();
  const errors = [];
  const tarballs = [];

  if (packages.length !== 1 || packages[0]?.manifest.name !== 'strata-kit') {
    throw new Error('Only the strata-kit package may be publishable during the trim.');
  }

  for (const { directory, manifest } of packages) {
    const displayDirectory = relative(workspaceRoot, directory);
    errors.push(...metadataErrors(manifest, displayDirectory));

    const packed = JSON.parse(
      run('pnpm', ['--dir', directory, 'pack', '--json', '--pack-destination', temporaryDirectory])
    );
    const files = new Set(packed.files.map((file) => file.path));
    tarballs.push(packed.filename);

    for (const requiredFile of ['LICENSE', 'README.md', 'docs/API.md', 'docs/ARCHITECTURE.md', 'package.json']) {
      if (!files.has(requiredFile)) {
        errors.push(`${displayDirectory}: packed artifact is missing ${requiredFile}`);
      }
    }

    for (const [subpath, conditions] of Object.entries(manifest.exports ?? {})) {
      for (const target of exportTargets(conditions)) {
        if (!targetExists(files, target)) {
          errors.push(`${displayDirectory}: export ${subpath} points to missing packed file ${target}`);
        }
      }
    }

    const packedManifest = JSON.parse(
      run('tar', ['-xOf', packed.filename, 'package/package.json'])
    );
    const packedManifestText = JSON.stringify(packedManifest);
    if (packedManifestText.includes('workspace:')) {
      errors.push(`${displayDirectory}: packed manifest still contains workspace: dependency ranges`);
    }

    for (const file of packed.files.filter((item) => item.path.endsWith('.d.ts'))) {
      const declaration = run('tar', ['-xOf', packed.filename, `package/${file.path}`]);
      if (/\b(?:from\s+|import\s*(?:\(\s*)?)['"]@strata-game-library\//.test(declaration)) {
        errors.push(`${displayDirectory}: packed declaration ${file.path} references a private workspace package`);
      }
    }
  }

  if (errors.length) {
    throw new Error(`Package validation failed:\n- ${errors.join('\n- ')}`);
  }

  const coreConsumerDirectory = join(temporaryDirectory, 'core-consumer');
  await mkdir(coreConsumerDirectory);
  await writeFile(
    join(coreConsumerDirectory, 'package.json'),
    JSON.stringify({ name: 'strata-kit-core-consumer', private: true, type: 'module' }, null, 2)
  );
  run('npm', ['install', '--omit=optional', '--ignore-scripts', '--no-audit', '--no-fund', ...tarballs], {
    cwd: coreConsumerDirectory,
    stdio: 'pipe',
  });
  for (const optionalPeer of ['three', 'react', '@react-three/fiber']) {
    if (existsSync(join(coreConsumerDirectory, 'node_modules', optionalPeer))) {
      throw new Error(`Pure consumer unexpectedly installed optional peer ${optionalPeer}.`);
    }
  }
  await writeFile(
    join(coreConsumerDirectory, 'consumer.mjs'),
    [
      "import { bakeSurface, createSeededTerrainField, createSurfacePlan } from 'strata-kit';",
      "const field = createSeededTerrainField({ seed: 'node-24', biomes: [{ type: 'forest', center: [0, 0], radius: 10 }] });",
      "const first = field.sample({ x: 1, y: 0, z: -2 });",
      "const second = field.sample({ x: 1, y: 0, z: -2 });",
      "if (JSON.stringify(first) !== JSON.stringify(second)) throw new Error('pure terrain is not deterministic');",
      "const bake = bakeSurface(createSurfacePlan({ seed: 'node-24' }), { width: 2, height: 2 });",
      "if (bake.color.length !== 16) throw new Error('pure material bake is unavailable');",
      "console.log('core-consumer-node24-ok');",
    ].join('\n')
  );
  run('mise', ['exec', 'node@24', '--', 'node', 'consumer.mjs'], {
    cwd: coreConsumerDirectory,
    stdio: 'inherit',
  });

  const consumerDirectory = join(temporaryDirectory, 'consumer');
  await mkdir(consumerDirectory);
  await writeFile(
    join(consumerDirectory, 'package.json'),
    JSON.stringify({ name: 'strata-package-consumer', private: true, type: 'module' }, null, 2)
  );
  run(
    'npm',
    [
      'install',
      '--ignore-scripts',
      '--legacy-peer-deps',
      '--no-audit',
      '--no-fund',
      ...tarballs,
      'react@latest',
      'react-dom@latest',
      'three@latest',
      '@react-three/fiber@latest',
      '@react-three/drei@latest',
      'typescript@latest',
      'zustand@latest',
      'yuka@latest',
    ],
    { cwd: consumerDirectory, stdio: 'pipe' }
  );
  await writeFile(
    join(consumerDirectory, 'consumer.mjs'),
    [
      "import { createSeededTerrainField, createSurfacePlan, bakeSurface } from 'strata-kit';",
      "import { createSeededNoise } from 'strata-kit/noise';",
      "import { sdSphere } from 'strata-kit/sdf';",
      "import { seededSurfaceNoiseGlsl } from 'strata-kit/shaders';",
      "import { createThreeHeightfieldGeometry } from 'strata-kit/three';",
      "import { StrataHeightfield } from 'strata-kit/r3f';",
      "const field = createSeededTerrainField({ seed: 'consumer', biomes: [{ type: 'forest', center: [0, 0], radius: 10 }] });",
      "const mesh = field.createHeightfield({ width: 3, depth: 3, cellSize: 1 });",
      "const geometry = createThreeHeightfieldGeometry(mesh);",
      "if (geometry.getAttribute('position').count !== 9) throw new Error('Three geometry export is not executable');",
      "if (createSeededNoise('consumer')(1, 2) === createSeededNoise('different')(1, 2)) throw new Error('seeded noise is not keyed');",
      "if (sdSphere({ x: 0, y: 0, z: 0 }, { x: 0, y: 0, z: 0 }, 1) !== -1) throw new Error('SDF export is not executable');",
      "if (!seededSurfaceNoiseGlsl.includes('strataKitNoise')) throw new Error('shader export is unavailable');",
      "if (bakeSurface(createSurfacePlan({ seed: 'consumer' }), { width: 2, height: 2 }).color.length !== 16) throw new Error('material bake export is unavailable');",
      "if (typeof StrataHeightfield !== 'function') throw new Error('R3F adapter export is unavailable');",
      "console.log('consumer-smoke-ok');",
    ].join('\n')
  );
  run('node', ['consumer.mjs'], { cwd: consumerDirectory, stdio: 'inherit' });
  await writeFile(
    join(consumerDirectory, 'consumer.ts'),
    [
      "import { createSeededTerrainField, createSurfacePlan } from 'strata-kit';",
      "import { createSeededNoise } from 'strata-kit/noise';",
      "import { sdSphere } from 'strata-kit/sdf';",
      "import { seededSurfaceNoiseGlsl } from 'strata-kit/shaders';",
      "import { createThreeHeightfieldGeometry } from 'strata-kit/three';",
      "import { StrataHeightfield } from 'strata-kit/r3f';",
      'void createSeededTerrainField;',
      'void createSurfacePlan;',
      'void createSeededNoise;',
      'void sdSphere;',
      'void seededSurfaceNoiseGlsl;',
      'void createThreeHeightfieldGeometry;',
      'void StrataHeightfield;',
    ].join('\n')
  );
  run('node', ['node_modules/typescript/bin/tsc', '--noEmit', '--skipLibCheck', '--module', 'NodeNext', '--moduleResolution', 'NodeNext', 'consumer.ts'], {
    cwd: consumerDirectory,
    stdio: 'inherit',
  });

  console.log(`Validated ${packages.length} package tarballs, a Node 24 pure consumer, and a clean adapter consumer install.`);
} finally {
  await rm(temporaryDirectory, { recursive: true, force: true });
}
