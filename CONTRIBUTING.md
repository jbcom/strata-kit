# Contributing to Strata Kit

Strata Kit accepts focused improvements to its deterministic procedural APIs and
their optional rendering adapters. Before beginning, read [AGENTS.md](AGENTS.md),
[docs/API.md](docs/API.md), and [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md).

## Local setup

Use the maintained toolchain from `mise.toml`.

```sh
mise trust
mise install
mise exec -- pnpm install --frozen-lockfile
mise exec -- pnpm verify
```

`pnpm verify` is the required local gate: it runs linting, type checks, unit tests, the
package build, and packed-consumer checks. Run `mise exec -- pnpm test:gpu` through
the configured hardware test path when changing the CPU/GLSL scalar-relief pair.

## Contribution rules

- Keep renderer-neutral subpaths free of React, Three.js, browser APIs, game
  lifecycle, implicit randomness, and machine-specific paths.
- Preserve determinism. A public operation that makes random choices must accept or
  inherit an explicit `Seed`; changing a documented seeded output is a compatibility
  change and needs tests and release consideration.
- Keep adapters opt-in. `three` and `r3f` may convert supplied procedural data for
  their ecosystem, but do not own generation, application state, or a render loop.
- Add a focused test for every behavior change. Update the API and architecture
  documentation when exports, output layouts, validation, or limits change.
- Use Conventional Commits, for example `feat(terrain): add deterministic contour
  data` or `fix(materials): validate bake dimensions`.

Pull requests target `main`. Release automation owns version and changelog edits; do
not hand-edit them for an ordinary contribution.
