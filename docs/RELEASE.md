# Release preparation

This document records the intended public release path. The commands are a reviewable plan; they have not been run for this repository.

## Create the public repository after approval

```sh
gh repo create jbcom/strata-kit --public --source=. --remote=origin --push
git push --tags
```

Configure npm trusted publishing for `jbcom/strata-kit` and the `publish` GitHub Actions workflow before the first release. No token belongs in this repository.

## Validate the first release

```sh
pnpm install --frozen-lockfile
pnpm verify
pnpm test:gpu
npm publish --access public --provenance
```

The GPU command is a muted WebGL2 readback test and belongs on a hardware-enabled render worker, not an ordinary local release shell. It must run from the final committed source and its receipt must record the SHA-256 of `src/surfaceFields.ts` and `dist/surface-fields.js`.

## Registry-consumer proof after publication

Use a new temporary directory with no workspace configuration:

```sh
npm init -y
npm install --userconfig /dev/null strata-kit@0.1.0
node --input-type=module --eval "await import('strata-kit'); await import('strata-kit/surface-fields')"
```

Then install `three`, `react`, `react-dom`, and `@react-three/fiber` in a separate clean directory and import every public subpath. A local tarball verifies artifact contents before publication; only this second registry installation proves the public consumer boundary.
