# Strata Kit delivery state

Updated 2026-10-13.

## Verified current line

- Canonical repository: `jbcom/strata-kit`, initial independent history at
  `7db80041`, current starting main `9892a7dc`.
- Canonical local checkout: `~/src/jbcom/strata-kit`, SSH origin.
- Historical monorepo preserved at `~/src/jbcom/strata-game-library`, including
  its dirty trim plan and linked worktrees. No branches or unfinished PRs deleted.
- Published distribution: `strata-procedural@0.1.0`. The repository/brand is
  Strata Kit; npm rejected the desired `strata-kit` package identifier.
- Baseline `pnpm verify` passed: 16 tests, typecheck, build, publint, ESM type
  resolution, reproducible packed artifact, pure and adapter consumers.
- GitHub descriptions now distinguish the canonical procedural library from
  the historical framework. Current documentation is in the successor.

## This change

Reconcile local identity, truthful docs, discovery metadata, and latest stable
maintainer tools from mise. Add a source-grounded modernization design and
candidate provenance table. No new sampler, wear, mesh, or layering API is
claimed to exist in this change.

Current change validation: `pnpm verify` passed on Node 22.23.1 and Node 26.7.0
(the local tested runtime), including 16 tests and clean packed consumers.
`actionlint` passed for CI/CD, and `git diff --check` passed. A read-only
architecture review found and resolved scale/domain/provenance ambiguities.
CodeRabbit's suggested tool pins were rejected because the owner's toolchain
instructions explicitly require latest stable tools from mise; stale setup
instructions were corrected.

## Pending gates

- Owner review of `PROCEDURAL_MODERNIZATION.md`, followed by the sampler
  implementation plan review, before implementing the new public subsystem.
- New APIs need red/green deterministic tests, final artifact review, and
  visual comparison against permitted neutral donor fixtures.
- The 2026-10-13 pool status check observed no route to the two Mac render
  hosts and a status timeout on the third test host. This is an observed
  transport condition, not proof that hosts are powered off. No browser was
  driven, and no new visual PASS is claimed.
- Trusted npm publishing still needs its existing owner setup. Keep
  `NPM_TRUSTED_PUBLISHING_READY` gated; do not merge/publish release PRs merely
  because this documentation/configuration change passes.
- Consumer games adopt only a released registry version, in separate owned
  changes, then remove only the replaced local implementation.

## Next authorized work after design review

Write the explicit sampler/wear implementation plan against the approved
contract. Keep the original 0.1.0 bake fixtures intact. Add sampler bakes and
coherent wear in the existing materials entrypoint, then independently review
reskinning and neutral geometry. Preserve game palettes, assets, body semantics,
and scene ownership with their consumers.
