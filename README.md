# Strata Procedural

Strata Procedural is a small, renderer-neutral TypeScript library for deterministic
procedural layering in 3D space. It supplies seeded noise, signed-distance
composition, biome-shaped terrain fields, coherent surface layers, portable meshes,
UV atlas bakes, scalar relief profiles, and optional Three.js and React Three Fiber views.

The repository, project, and npm distribution share the name **Strata Procedural**:
[`strata-procedural`](https://www.npmjs.com/package/strata-procedural).
The repository was previously named `strata-kit`; GitHub preserves its redirects.

## Install

```sh
pnpm add strata-procedural
```

The published package is ESM-only and supports Node.js 22 and newer. The core imports
have no renderer dependency. `three`, `react`, and `@react-three/fiber` are optional
peer dependencies used only by the adapter subpaths. The Three texture adapter
packs scalar maps into linear grayscale RGBA, including bump, for WebGL1
compatibility at the Three r152 peer floor.

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
| `strata-procedural/mesh` | Revolved profiles, transported sweeps, and sampled sheets |
| `strata-procedural/shaders` | GLSL seeded noise and checked literal shader patches |
| `strata-procedural/surface-fields` | C1 scalar profiles, relief derivatives and frames, matching GLSL |
| `strata-procedural/three` | Mesh geometry and explicitly disposable surface textures |
| `strata-procedural/r3f` | `StrataHeightfield` React Three Fiber component |

Only these package-exported paths are public API. See [docs/API.md](docs/API.md) for
the exported symbols and [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) for boundaries
and intentional limits.

For saved procedural content, read [compatibility guidance](docs/COMPATIBILITY.md).
Keep the package version and complete inputs or buffers; a seed cannot serialize
an arbitrary sampler recipe.

[Performance guidance](docs/PERFORMANCE.md) distinguishes request limits from
measured workload sizes and documents the reproducible CPU benchmark.

The [visual acceptance gate](docs/VISUAL-ACCEPTANCE.md) deliberately rejects inverted
gravity and an omitted oxide layer, then verifies exact restoration. Its diagnostic
captures supplement direct visual review and consumer testing.

Swept meshes separate shading normals at sharp radius cusps, adding coincident
rings where needed. Positive terrain biome blends preserve relative contributions
even when normalized squared distances overflow. See the API reference for layout
and floating-point limits.

Nearest-biome selection also retains valid ranking at extreme radii. That correction
changes previously incorrect extreme-input results while preserving ordinary output.

## Compose surface layers

```ts
import { bakeSurface, composeSurfaceLayers, createWearField } from 'strata-procedural';

const wear = createWearField({
  seed: 'panel-01', scale: 1, amount: 0.7, edgeBias: 0.4, bottomBias: 0.3,
});
const painted = {
  sample: () => ({ color: [55, 85, 110, 255] as const, roughness: 0.6, bump: 0 }),
};
const exposed = {
  sample: () => ({ color: [155, 155, 150, 255] as const, roughness: 0.35, bump: -0.1, metalness: 1 }),
};
const sampler = composeSurfaceLayers(painted, [
  { sampler: exposed, mask: (u, v) => wear.sample(u, v).chip },
]);
const maps = bakeSurface(sampler, { width: 512, height: 512 });
```

Layers share a deterministic coordinate domain. Color blends in linear sRGB;
roughness, bump, and optional metalness use the same alpha weights. Wear fields
provide correlated masks without choosing a palette or material for the consumer.

## Scalar relief profiles

`surface-fields` evaluates clamped C1 cubic-Hermite profiles and their analytic
derivatives. A consumer chooses the scalar coordinate and supplies its derivatives
over the surface; Strata Procedural applies the chain rule and can derive a local
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
// A unit panel in the XY plane; the scalar coordinate runs along its u axis.
const coordinate = 0.4;
const dqDu = 1;
const dqDv = 0;
const dPDu = { x: 1, y: 0, z: 0 };
const dPDv = { x: 0, y: 1, z: 0 };
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
import { createSeededTerrainField } from 'strata-procedural';
import { createThreeHeightfieldGeometry } from 'strata-procedural/three';

const terrain = createSeededTerrainField({
  seed: 'view-01',
  biomes: [{ type: 'forest', center: [0, 0], radius: 80 }],
});
const mesh = terrain.createHeightfield({ width: 16, depth: 16, cellSize: 2 });
const geometry = createThreeHeightfieldGeometry(mesh);
// Dispose the geometry when the consumer no longer uses it.
geometry.dispose();
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

From a source checkout, run `mise exec -- pnpm build` then
`mise exec -- pnpm demo` to inspect the interactive procedural gallery at
`http://127.0.0.1:4400`. The gallery owns its renderer, controls, and resource lifecycle.

See [CONTRIBUTING.md](CONTRIBUTING.md) for contribution expectations and
[llms.txt](llms.txt) for a concise machine-readable project index.
