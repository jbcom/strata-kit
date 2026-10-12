# Release preparation

This document records the intended public release path. The commands are a reviewable plan; they have not been run for this repository.

## Create the public repository after approval

```sh
gh repo create jbcom/strata-kit --public --source=. --remote=origin --push
git push --tags
```

The first `0.1.0` release uses the owner's existing secure local npm configuration. Do not add, print, or copy a token into this repository. npm trusted publishing remains a follow-up after the owner completes the required security-key setup.

## Validate the first release

```sh
pnpm install --frozen-lockfile
pnpm verify
pnpm test:gpu
npm publish --access public --provenance=false
```

`--provenance=false` explicitly overrides the repository's future OIDC publishing default for this authorized local release. The GPU command is a muted WebGL2 readback test and belongs on a hardware-enabled render worker, not an ordinary local release shell. It must run from the final committed source and its receipt must record the SHA-256 of `src/surfaceFields.ts` and `dist/surface-fields.js`.

After registry success, tag the reviewed source and prepare a draft GitHub release with its notes. Do not publish that GitHub release while the OIDC workflow remains unconfigured:

```sh
git tag -a v0.1.0 -m "strata-kit 0.1.0"
git push origin v0.1.0
gh release create v0.1.0 --draft --title "strata-kit 0.1.0" --notes-file CHANGELOG.md
```

## Registry-consumer proof after publication

Use a new temporary directory with no workspace configuration:

```sh
npm init -y
npm install --userconfig /dev/null strata-procedural@0.1.0
node --input-type=module --eval "await import('strata-procedural'); await import('strata-procedural/surface-fields')"
```

Then install `three`, `react`, `react-dom`, and `@react-three/fiber` in a separate clean directory and import every public subpath. A local tarball verifies artifact contents before publication; only this second registry installation proves the public consumer boundary.
