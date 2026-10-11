import { execFileSync } from 'node:child_process';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { getPublishablePackages } from './workspace-packages.mjs';

const registry = 'https://registry.npmjs.org/';

function run(command, args, options = {}) {
  try {
    return execFileSync(command, args, {
      encoding: 'utf8',
      stdio: 'pipe',
      ...options,
    });
  } catch (error) {
    const detail = error.stderr?.toString().trim() || error.message;
    throw new Error(`${command} ${args.join(' ')} failed: ${detail}`);
  }
}

function parseJson(output, description) {
  try {
    return JSON.parse(output);
  } catch (error) {
    throw new Error(`Could not parse ${description}: ${error.message}`);
  }
}

export function getPeerInstallSpecifiers(manifest) {
  return Object.entries(manifest.peerDependencies ?? {})
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([name, range]) => {
      if (typeof range !== 'string' || range.length === 0) {
        throw new Error(`Peer dependency ${name} must declare a non-empty version range`);
      }
      return `${name}@${range}`;
    });
}

export function getRegistryMetadata(value, name, expectedVersion) {
  const metadata = Array.isArray(value) ? value[0] : value;
  const version = metadata?.version;
  const integrity = metadata?.['dist.integrity'] ?? metadata?.dist?.integrity;

  if (version !== expectedVersion) {
    throw new Error(`${name} registry metadata reported version ${version ?? 'none'}, expected version ${expectedVersion}`);
  }
  if (typeof integrity !== 'string' || !integrity.startsWith('sha512-')) {
    throw new Error(`${name}@${expectedVersion} registry metadata must include a sha512 integrity`);
  }

  return { version, integrity };
}

export function getInstalledPackageRecord(lockfile, name, expected) {
  const installed = lockfile.packages?.[`node_modules/${name}`];
  if (!installed) {
    throw new Error(`Clean registry install did not record ${name} in package-lock.json`);
  }
  if (installed.version !== expected.version) {
    throw new Error(`${name} clean install resolved ${installed.version ?? 'no version'}, expected ${expected.version}`);
  }
  if (installed.integrity !== expected.integrity) {
    throw new Error(`${name} clean install integrity does not match npm view metadata`);
  }

  return { version: installed.version, integrity: installed.integrity };
}

async function main() {
  const publishablePackages = await getPublishablePackages();
  if (publishablePackages.length !== 1 || publishablePackages[0].manifest.name !== 'strata-game-library') {
    throw new Error('Published-registry verification expects exactly one public package: strata-game-library');
  }

  const { manifest } = publishablePackages[0];
  const specifier = `${manifest.name}@${manifest.version}`;
  const registryMetadata = getRegistryMetadata(
    parseJson(
      run('npm', [
        'view',
        specifier,
        'version',
        'dist.integrity',
        '--json',
        `--registry=${registry}`,
        '--userconfig=/dev/null',
      ]),
      `${specifier} npm view response`
    ),
    manifest.name,
    manifest.version
  );

  const temporaryDirectory = await mkdtemp(join(tmpdir(), 'strata-registry-consumer-'));
  try {
    await writeFile(
      join(temporaryDirectory, 'package.json'),
      JSON.stringify({ name: 'strata-registry-consumer', private: true, type: 'module' }, null, 2)
    );

    run(
      'npm',
      [
        'install',
        '--ignore-scripts',
        '--no-audit',
        '--no-fund',
        '--save-exact',
        `--registry=${registry}`,
        '--userconfig=/dev/null',
        specifier,
        ...getPeerInstallSpecifiers(manifest),
      ],
      { cwd: temporaryDirectory }
    );

    const lockfile = parseJson(
      await readFile(join(temporaryDirectory, 'package-lock.json'), 'utf8'),
      'clean consumer package-lock.json'
    );
    getInstalledPackageRecord(lockfile, manifest.name, registryMetadata);

    await writeFile(
      join(temporaryDirectory, 'consumer.mjs'),
      [
        "await import('strata-game-library');",
        "await import('strata-game-library/core');",
        "await import('strata-game-library/r3f');",
        "console.log('registry-consumer-imports-ok');",
      ].join('\n')
    );
    run('node', ['consumer.mjs'], { cwd: temporaryDirectory, stdio: 'inherit' });
  } finally {
    await rm(temporaryDirectory, { recursive: true, force: true });
  }

  console.log(`Verified ${specifier} from ${registry} with matching integrity and root/core/r3f imports.`);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  await main();
}
