# Strata Kit

Strata Kit is a small, renderer-neutral TypeScript library for deterministic
procedural layering in 3D space. It currently supplies seeded noise, signed-distance
composition, biome-shaped terrain fields, surface-map bakes, scalar relief profiles,
and optional Three.js and React Three Fiber views.

The project is named **Strata Kit**. Install it from npm as
[`strata-procedural`](https://www.npmjs.com/package/strata-procedural): npm rejected
`strata-kit` because its name was too similar to an existing package.

## Install

```sh
pnpm add strata-procedural
```

The published package is ESM-only and supports Node.js 22 and newer. The core imports
have no renderer dependency. `three`, `react`, and `@react-three/fiber` are optional
peer dependencies used only by the adapter subpaths.

## Start with a terrain field

```ts
import { createSeededTerrainField } from 'strata-procedural';

const terrain = createSeededTerrainField({
  seed: 'coast-01',
  biomes: [{ type: 'mountain', center: [0, 0], radius: 80 }],
});

const height = terrain.heightAt(12, -4);
const mesh = terrain.createHeightfield({ width: 64, depth: 64, cellSize: 2 });
const placements = terrain.scatter({ count: 40, area: 120 });
```

The same seed and inputs produce the same field, heightfield, and scatter sequence.
`HeightfieldMesh` is plain typed-array data, so it can be consumed by any renderer or
asset pipeline.

## Bake a surface layer

```ts
import {
  bakeSurface,
  createSurfaceBakeManifest,
  createSurfacePlan,
} from 'strata-procedural';

const plan = createSurfacePlan({
  seed: 'slate-01',
  scale: 1.5,
  baseColor: [0.28, 0.31, 0.34],
});
const bake = bakeSurface(plan, { width: 512, height: 512 });
const manifest = createSurfaceBakeManifest(plan, bake);
```

`bake.color` is tightly packed RGBA8 data. `bake.roughness` is R8. `bake.bump` is
R8 data that represents the signed `[-1, 1]` bump sample remapped into `[0, 255]`.
The manifest records their layout and normalized plan inputs. Encoding the buffers into
image files and applying them to a material remain consumer work.

## Public imports

| Import | Use it for |
| --- | --- |
| `strata-procedural` | Root API: noise, SDFs, terrain, material bakes, and scalar relief |
| `strata-procedural/noise` | Seed normalization, random streams, value noise, and fractal sums |
| `strata-procedural/sdf` | Sphere, plane, box, and boolean/smooth distance operations |
| `strata-procedural/terrain` | Seeded terrain fields, heightfields, and scatter data |
| `strata-procedural/materials` | Surface plans, samples, bakes, and bake manifests |
| `strata-procedural/shaders` | GLSL seeded value-noise chunk |
| `strata-procedural/surface-fields` | C1 scalar profiles, relief derivatives and frames, matching GLSL |
| `strata-procedural/three` | `HeightfieldMesh` to `THREE.BufferGeometry` conversion |
| `strata-procedural/r3f` | `StrataHeightfield` React Three Fiber component |

Only these package-exported paths are public API. See [docs/API.md](docs/API.md) for
the exported symbols and [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) for boundaries
and intentional limits. [docs/PROCEDURAL_MODERNIZATION.md](docs/PROCEDURAL_MODERNIZATION.md)
is the proposal for extracting and modernizing further procedural capabilities; it
does not extend the current API.

## Scalar relief profiles

`surface-fields` evaluates clamped C1 cubic-Hermite profiles and their analytic
derivatives. A consumer chooses the scalar coordinate and supplies its derivatives
over the surface; Strata Kit applies the chain rule and can derive a local
first-order relief frame from caller-supplied surface differentials.

```ts
import {
  createCubicHermiteProfile,
  deriveReliefFrame,
  projectScalarProfileDerivative,
  sampleCubicHermiteProfile,
} from 'strata-procedural/surface-fields';

const profile = createCubicHermiteProfile([
  { coordinate: 0, value: 0, derivative: 0 },
  { coordinate: 0.5, value: 0.012, derivative: 0.03 },
  { coordinate: 1, value: 0, derivative: 0 },
]);
const sample = sampleCubicHermiteProfile(profile, coordinate);
const relief = projectScalarProfileDerivative(sample, { du: dqDu, dv: dqDv });
const frame = deriveReliefFrame({ du: dPDu, dv: dPDv }, relief.derivatives);
```

The CPU and GLSL evaluators use the same maximum of eight knots.
`deriveReliefFrame` is a local approximation based on `dP + N * dH`; it is not the
exact tangent frame of a curved, physically displaced surface. Consumers that change
geometry need a curvature-aware path.

## Optional views

```ts
import { createThreeHeightfieldGeometry } from 'strata-procedural/three';

const geometry = createThreeHeightfieldGeometry(mesh);
```

`strata-procedural/r3f` exports `StrataHeightfield`, which receives a precomputed
`HeightfieldMesh` and an optional Three `Material`. Neither adapter creates terrain,
simulation state, or a render loop.

## Develop

```sh
mise trust
mise install
mise exec -- pnpm install --frozen-lockfile
mise exec -- pnpm verify
```

`pnpm verify` runs Biome, TypeScript, unit tests, the build, and package-consumer
checks. Run `mise exec -- pnpm test:gpu` separately when changing the CPU/GLSL
scalar-relief pair; it is a muted WebGL2 readback test and belongs on the configured
hardware test path.

See [CONTRIBUTING.md](CONTRIBUTING.md) for contribution expectations and
[llms.txt](llms.txt) for a concise machine-readable project index.
