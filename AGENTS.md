# Strata Procedural agent guide

Strata Procedural is a public ESM library for deterministic procedural layering in 3D space.
Its npm distribution is `strata-procedural`; use that name in consumer imports and
package-facing documentation.

## Public boundary

The package exports only the root API and the subpaths declared in `package.json`:
`noise`, `sdf`, `terrain`, `materials`, `mesh`, `shaders`, `surface-fields`, `three`, and
`r3f`. Do not document, import, or depend on deep source paths.

The root and the renderer-neutral subpaths must not import React, Three.js, browser
APIs, game state, assets, or a global random source. Built-in random generators use
an explicit `Seed`; injected samplers must be deterministic and independent of call
order to preserve that guarantee. `three` and `r3f` are opt-in adapters with optional peers; they
receive precomputed data and must not create a game loop or simulation state.

`surface-fields` is generic scalar-profile and local relief-frame math. It does not
choose a coordinate projection, own geometry deformation, encode maps, or decide a
consumer's rendering policy. Preserve that boundary when changing it.

## Working agreement

Keep internal handoffs, cross-project research, source checkout paths, and agent
coordination in gitignored `.agent-state/`. Never commit or push them. Public
documentation describes this package's behavior, API, and contribution process.

Use the maintained toolchain from `mise.toml`:

```sh
mise trust
mise install
mise exec -- pnpm install --frozen-lockfile
mise exec -- pnpm verify
```

Add focused tests for behavior or public-contract changes. Update `README.md`,
`docs/API.md`, `docs/ARCHITECTURE.md`, and `llms.txt` whenever the public API or its
limits change. Use Conventional Commits. Releases are prepared from `main`; do not
manually edit versions or the changelog as part of ordinary feature work.

`mise exec -- pnpm test:gpu` is the muted WebGL2 readback check for the paired
CPU/GLSL scalar-relief implementation. Run it through the configured hardware test
path when that module changes.
