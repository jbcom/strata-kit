# Strata Procedural

Strata Procedural is a small, renderer-neutral TypeScript library for deterministic
procedural layering in 3D space. It supplies seeded noise, signed-distance
composition, caller-defined and biome-shaped terrain fields, coherent surface layers, portable meshes,
UV atlas bakes, scalar relief profiles, and optional Three.js and React Three Fiber views.

UV overlap analysis uses a deterministic two-axis candidate search with exact-sign
triangle tests. Large charts sharing one coordinate range can be analyzed without
spending the overlap budget on pairs separated along the other axis; dense layouts
still obey the documented work limits.

UV atlas baking defaults to strict pixel-centre sampling. Optional `coverage: 'area'`
retains tiny valid triangles through clipped footprint sampling and linear-light
blending. It preserves geometric validation and work limits; finite texel footprints
can mix nearby islands. See [API details](docs/API.md) for filtering and memory limits.

`visitUvTexelFootprints` streams raw clipped UV area and surface centroids for selected
source triangles, without baking maps. Consumers can build coverage queries without
confusing material alpha with area or UV coverage with physical solid space.

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
Heightfields retain their grid layout at sharp height changes. If a shared
central-difference normal points behind any actual stored triangle, it falls back
to the upward normal. Other normals, positions and indices remain unchanged.

While constructing a heightfield, the terrain field reuses exact requested `(x, z)`
height samples for central-difference normals. This operation-local cache holds at
most 65,536 live samples across at most three actual Z-coordinate rows, treats
signed zero distinctly, and falls back to direct sampling when full. It does not
change the returned buffers or their layout.

## Compose a directional field

Fields are callable `(x, z) => number` samplers in caller-declared coordinates.
Build a recipe from seeded noise, a scalar profile, ordered arithmetic, and a mask:

```ts
import { createFractalNoise2D, createValueNoise2D } from 'strata-procedural/noise';
import { createPeriodicRidgeProfile } from 'strata-procedural/surface-fields';
import {
  composeScalarField2D,
  createDirectionalField2D,
  createSmoothMask2D,
  transformScalarField2D,
} from 'strata-procedural/terrain';

const noise = createFractalNoise2D({ noise: createValueNoise2D({ seed: 'relief-01' }) });
const displacement = transformScalarField2D(noise, { scale: [0.05, 0.05] });
const ridge = createDirectionalField2D({
  direction: [1, 0],
  wavelength: 12,
  displacement: [displacement], // Length units, before division by wavelength.
  phase: 0.1, // Cycles, after division by wavelength.
  profile: createPeriodicRidgeProfile({ crest: 0.65, risePower: 2 }),
});
const fade = createSmoothMask2D({
  shape: { kind: 'radial', center: [0, 0] },
  edges: [4, 10],
});
const raised = composeScalarField2D(ridge, [{ operation: 'multiply', field: 3 }]);
const heightAt = composeScalarField2D(0, [{ operation: 'blend', field: raised, weight: fade }]);
const height = heightAt(8, -2);
```

Changing layer order changes the result. Constructors capture numeric options and
copy recipe lists; injected callbacks remain caller-owned and must be pure,
deterministic, and independent of call order. Composition accepts at most 64 layers,
directional projection at most 32 displacements, and fractal noise at most 32
octaves. These bounds do not limit callback time or nested recipe cost.

The ridge returns values in `[0, 1]` and derivatives per cycle with C1 joins;
curvature continuity is not promised. It and `sampleCosineProfile` are CPU-only
profiles. Directional projection belongs to `terrain`; scalar profiles do not choose
a spatial projection or deform geometry. See [API details](docs/API.md) for noise
seed semantics, finite-coordinate limits, mask contours, and normalization.

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
| `strata-procedural/terrain` | Ordered scalar fields, directional projection, smooth masks, seeded terrain, heightfields, and scatter |
| `strata-procedural/materials` | Surface plans, samples, bakes, and bake manifests |
| `strata-procedural/mesh` | Revolved profiles and section surfaces, transported sweeps, and height or parametric sheets |
| `strata-procedural/shaders` | GLSL seeded noise and checked literal shader patches |
| `strata-procedural/surface-fields` | Periodic and clamped scalar profiles, relief frames, and cubic-Hermite GLSL |
| `strata-procedural/three` | Mesh geometry, copied static mesh snapshots, surface textures, and triplanar materials |
| `strata-procedural/r3f` | `StrataHeightfield` React Three Fiber component |

Only these package-exported paths are public API. See [docs/API.md](docs/API.md) for
the exported symbols and [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) for boundaries
and intentional limits.

## Build mapped meshes

The existing `createRevolvedMesh` and `createSheetMesh` constructors retain their
original inputs and output layouts. For a section with separate front/back depths
or an open angular range, use the additional revolved-surface constructor:

```ts
import { createRevolvedSurfaceMesh } from 'strata-procedural/mesh';

const shell = createRevolvedSurfaceMesh({
  sections: [
    { height: 0, halfWidth: 0.3, positiveDepth: 0.22, negativeDepth: 0.28 },
    { height: 1, halfWidth: 0.35, positiveDepth: 0.26, negativeDepth: 0.3 },
  ],
  segments: 24,
  power: 2.5,
  angular: { kind: 'open', start: -1.2, end: 1.2 },
});
```

Angle zero points along +Z, and the returned surface has open ends without
automatically added caps. `shell.parameters` retains each vertex's normalized
row parameter and wrapped angle, including vertices duplicated to repair normals.
Section dimensions, offsets and angular bounds must form a coherent radial
surface; this constructor does not infer a solid interior.
For a folded meridian whose underside points radially inward, declare
`winding: 'forward'` or `'reverse'` to orient the entire parameter grid.
Generated normals follow that same orientation; individual faces are not flipped
to face away from the axis.
Optional angular-length UVs use a continuous sweep from the domain start.
Choose `wrapped-angular-length` only when a branch-cut projection is intended;
neither mode computes an exact ellipse perimeter.

For a surface that maps both unit coordinates to 3D, use
`createParametricSheetMesh`:

```ts
import { createParametricSheetMesh } from 'strata-procedural/mesh';

const panel = createParametricSheetMesh({
  columns: 9,
  rows: 5,
  positionAt: (u, v) => ({ x: u, y: v, z: 0.1 * Math.sin(Math.PI * u) }),
  uvAt: (u, v) => [u * 2, v],
  normalMode: 'area-weighted',
});
```

`columns` and `rows` count sample vertices. The output includes
`sourceVertex`, which maps every returned vertex to its original grid sample
after any corner-normal repair. Optional `includeCell` and `includeVertex`
callbacks remove connectivity, while sampled positions and UVs remain available.
Mapped sheets also accept an explicit `winding` for coherent folded surfaces;
it cannot be combined with the point-based `insideAt` orientation hint.
See the [mesh contract](docs/API.md#portable-meshes-and-reskinning) for normal,
seam, validation and resource limits. These pure constructors do not choose
placement, skinning, materials, collision or renderer policy.

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

Sampled sheets preserve smooth finite-difference normals, but duplicate conflicting
triangle corners at sharp relief folds so every indexed corner faces outward.
These corrections can increase vertex counts; do not assume a fixed grid index layout.
Use `includeCell(column, row)` to select sheet cells for openings. It runs once per
cell before height sampling and must return a boolean. Sampled vertices and UVs are
retained, including when all cells are omitted; the generic Three adapter accepts
the resulting empty indexed surface.

Nearest-biome selection also retains valid ranking at extreme radii. That correction
changes previously incorrect extreme-input results while preserving ordinary output.

Continuous sections can use `superellipsePoint2D({halfWidth, halfDepth, power}, angle)`
and `superellipseHalfDepth2D(section, x)` from `strata-procedural/mesh`. These pure
Float64 helpers evaluate an eccentric signed-power curve and its unridged half-depth.
They keep height interpolation, 3D placement, inset and ridge recipes caller-owned.
Their angle is not the polar angle used by the revolved-section mesh; see the
[API contract](docs/API.md#signed-power-superellipse-sections) for cardinal-axis and
finite-precision limits.

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

## Packed scalar grids

```ts
import { packScalarGrid16, sampleScalarGrid16 } from 'strata-procedural/terrain';
const grid = packScalarGrid16({
  width: 3, height: 2,
  values: [-10, 0, 10, -5, 5, 10],
  min: -10, range: 20,
});
const value = sampleScalarGrid16(grid, 0.5, 0.75);
```

The codec owns tightly packed high-byte/low-byte RG8 data and frozen metadata.
Sampling uses fractional column/row indices, bilinear interpolation and edge
clamping, including singleton axes. The caller chooses the finite positive range,
world transform, texture upload and filtering. There is no hidden range floor or
terrain generator. `scalarGrid16Glsl` from `strata-procedural/shaders` supplies
matching highp ES3 decode/sample helpers for numeric RG8 textures. Quantization
and Float32 precision limits are documented in the API reference.

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

For scalar data without supplied slopes, `createMonotoneCubicProfile(points)`
builds an owned shape-preserving profile from 2–65,536 increasing coordinates.
`sampleMonotoneCubicProfile(profile, coordinate)` returns value and analytic
derivative. It uses secant slopes at the endpoints and weighted harmonic slopes
inside. Internal joins are C1; the constant exterior extension is generally only
C0. Exact endpoints report their interior one-sided derivative, while strictly
outside samples return derivative zero. This CPU-only profile has a distinct
data type and does not extend the eight-knot GLSL format.

```ts
import { createMonotoneCubicProfile, sampleMonotoneCubicProfile } from 'strata-procedural/surface-fields';
const dimensions = createMonotoneCubicProfile([
  { coordinate: 0, value: 1 },
  { coordinate: 1, value: 2 },
  { coordinate: 3, value: 6 },
]);
const { value, derivative } = sampleMonotoneCubicProfile(dimensions, 0.5);
```

For a continuous surface callback, `sampleParametricSurfaceDifferentials` from
`strata-procedural/surface-fields` computes explicit-step secants with optional
parameter bounds. It copies borrowed callback positions and returns `du`/`dv`
vectors for `deriveReliefFrame`. The caller chooses steps, wrapping and orientation;
this numerical approximation does not choose a normal or promise analytic accuracy.

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

Static authored meshes can enter the same portable mesh and UV-bake pipeline:

```ts
import { snapshotThreeStaticMeshes } from 'strata-procedural/three';

// authoredRoot is a caller-owned Three Object3D hierarchy.
authoredRoot.updateWorldMatrix(true, true);
const snapshots = snapshotThreeStaticMeshes(authoredRoot);
// Each snapshot owns copied positions, normals, indices, and optional UVs.
// Coordinates are relative to authoredRoot; use { space: 'world' } for world space.
```

The snapshot operation reads prepared matrices without updating the scene. It handles
nonuniform scale, reflected winding, and indexed or nonindexed triangles. Missing
normals are area-weighted from transformed triangles. Skins, instances, batches, material
groups, morph targets, and partial draw ranges are explicit errors. See the
[API contract](docs/API.md#optional-adapters) for limits.

`strata-procedural/r3f` exports `StrataHeightfield`, which receives a precomputed
`HeightfieldMesh` and an optional Three `Material`. Neither adapter creates terrain,
simulation state, or a render loop.

For static geometry without usable UVs, `createThreeTriplanarMaterial(textures,
{ fieldTransform, sharpness, flipV, bumpScale })` creates a standard PBR material
from precomputed color, roughness, bump and optional metalness maps. The copied
affine transform maps geometry-local positions into the sampling field. The
material borrows textures; dispose the material and texture bundle separately.
It requires WebGLRenderer, bounded RGBA8 maps and valid static normals. WebGL1
sRGB requires EXT_sRGB. It does not generate maps or bind animated rest coordinates.
See the [adapter contract](docs/API.md#optional-adapters) for projection and limits.

## Filter narrow surface bands

```ts
import { sampleSegment2D, projectPixelFootprint2D, sampleBandCoverage } from 'strata-procedural/materials';

const segment = sampleSegment2D([0.5, 0.1], [0, 0], [1, 0]);
const across = [-segment.tangent[1], segment.tangent[0]] as const;
const footprint = projectPixelFootprint2D(across, [0.01, 0], [0, 0.02]);
const band = sampleBandCoverage(segment.distance, 0.005, 0.001, footprint);
// Feed band.coverage to a caller-owned layer mask.
```

Coordinates, widths and pixel displacements share one caller-selected unit.
Coincident endpoints become a point sample. Positive subpixel bands widen their
support and attenuate their contribution; zero authored width remains invisible.
The returned edge and width factors let consumers apply their own visibility
policy. No spatial index, world projection, material or renderer is created.
`segmentCoverageGlsl` from `strata-procedural/shaders` provides matching highp
GLSL ES 3.00 helpers with explicitly supplied pixel derivatives.

## Develop

```sh
mise trust
mise install
mise exec -- pnpm install --frozen-lockfile
mise exec -- pnpm verify
```

`pnpm verify` runs Biome, TypeScript, unit tests, the build, and package-consumer
checks. Run `mise exec -- pnpm test:gpu` separately when changing the CPU/GLSL
scalar-relief or segment-coverage pairs; these muted WebGL2 readback tests belong on the configured
hardware test path.

From a source checkout, run `mise exec -- pnpm build` then
`mise exec -- pnpm demo` to inspect the interactive procedural gallery at
`http://127.0.0.1:4400`. The gallery owns its renderer, controls, and resource lifecycle.

See [CONTRIBUTING.md](CONTRIBUTING.md) for contribution expectations and
[llms.txt](llms.txt) for a concise machine-readable project index.
