# Release policy

`strata-procedural@0.1.0` was published through the owner's secure local npm configuration with provenance explicitly disabled. Its reviewed `v0.1.0` tag and a draft GitHub release are retained as the release record. npm trusted publishing remains pending the owner's security-key setup.

## Historical initial release

The first `0.1.0` release used the owner's existing secure local npm configuration. Do not add, print, or copy a token into this repository.

```sh
pnpm install --frozen-lockfile
pnpm verify
pnpm test:gpu
npm publish --access public --provenance=false
```

`--provenance=false` explicitly overrides the repository's future OIDC publishing default for this authorized local release. The GPU command is a muted WebGL2 readback test and belongs on a hardware-enabled render worker, not an ordinary local release shell. It must run from the final committed source and its receipt must record the SHA-256 of `src/surfaceFields.ts` and `dist/surface-fields.js`.

After registry success, the reviewed source was tagged and a draft GitHub release was prepared with its notes. Do not publish that `v0.1.0` draft:

```sh
git tag -a v0.1.0 -m "strata-kit 0.1.0"
git push origin v0.1.0
gh release create v0.1.0 --draft --title "strata-kit 0.1.0" --notes-file CHANGELOG.md
```

## Future trusted releases

The canonical GitHub repository is now `jbcom/strata-procedural`, matching the
npm package. Configure trusted publishing against that repository and `cd.yml`.
The old title in the initial-release record above is historical, not a new release instruction.

`.github/workflows/cd.yml` is the only publisher workflow. It runs only for a published GitHub release and is skipped unless the repository variable `NPM_TRUSTED_PUBLISHING_READY` is exactly `true`. Set that variable only after the owner has configured npm trusted publishing. The workflow validates the package, requires the release tag to match `package.json`, and refuses a version already present in npm before it reaches `npm publish --provenance`.

This gate keeps the existing draft and any prematurely published release from issuing an npm publish before the trust relationship is ready. The next release remains pending that owner setup; do not merge or publish its Release Please PR yet.

## Registry-consumer proof after publication

Use a new temporary directory with no workspace configuration:

```sh
npm init -y
npm install --userconfig /dev/null strata-procedural@0.1.0
node --input-type=module --eval "await import('strata-procedural'); await import('strata-procedural/surface-fields')"
```

Then install `three`, `react`, `react-dom`, and `@react-three/fiber` in a separate clean directory and import every public subpath. A local tarball verifies artifact contents before publication; only this second registry installation proves the public consumer boundary.
