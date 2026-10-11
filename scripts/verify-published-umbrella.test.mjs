import assert from 'node:assert/strict';
import test from 'node:test';
import {
  getPeerInstallSpecifiers,
  getRegistryMetadata,
  getInstalledPackageRecord,
} from './verify-published-umbrella.mjs';

const manifest = {
  peerDependencies: {
    react: '>=18.0.0',
    three: '>=0.150.0',
  },
};

test('uses the umbrella manifest peer ranges for the clean consumer', () => {
  assert.deepEqual(getPeerInstallSpecifiers(manifest), ['react@>=18.0.0', 'three@>=0.150.0']);
});

test('requires the registry to report the expected version and an SRI integrity', () => {
  assert.deepEqual(
    getRegistryMetadata(
      { version: '0.3.1', 'dist.integrity': 'sha512-registry-proof' },
      'strata-game-library',
      '0.3.1'
    ),
    { version: '0.3.1', integrity: 'sha512-registry-proof' }
  );

  assert.throws(
    () => getRegistryMetadata({ version: '0.3.0', 'dist.integrity': 'sha512-registry-proof' }, 'strata-game-library', '0.3.1'),
    /expected version 0\.3\.1/
  );
  assert.throws(
    () => getRegistryMetadata({ version: '0.3.1', 'dist.integrity': 'sha1-not-accepted' }, 'strata-game-library', '0.3.1'),
    /sha512 integrity/
  );
});

test('requires the clean install lockfile to match the registry version and integrity', () => {
  const lockfile = {
    packages: {
      'node_modules/strata-game-library': {
        version: '0.3.1',
        integrity: 'sha512-registry-proof',
      },
    },
  };

  assert.deepEqual(
    getInstalledPackageRecord(lockfile, 'strata-game-library', {
      version: '0.3.1',
      integrity: 'sha512-registry-proof',
    }),
    { version: '0.3.1', integrity: 'sha512-registry-proof' }
  );
  assert.throws(
    () =>
      getInstalledPackageRecord(lockfile, 'strata-game-library', {
        version: '0.3.1',
        integrity: 'sha512-different',
      }),
    /integrity does not match/
  );
});
