# Public API

Install `strata-procedural` and import only its declared root or subpath exports.
The root re-exports the procedural APIs except the standalone shader chunk; subpaths
let consumers keep their dependency boundary explicit.

## Imports

| Import | Exports | Dependencies |
| --- | --- | --- |
| `strata-procedural` | Noise, SDF, terrain, surface-bake, and scalar-relief APIs | none |
| `strata-procedural/noise` | `seedToUint32`, `createSeededRandom`, `createSeededNoise`, `fractalNoise` | none |
| `strata-procedural/sdf` | `sdSphere`, `sdPlane`, `sdBox`, `opUnion`, `opIntersection`, `opSubtraction`, `opSmoothUnion`, `opSmoothSubtraction` | none |
| `strata-procedural/terrain` | `createSeededTerrainField` and terrain data types | none |
| `strata-procedural/materials` | `createSurfacePlan`, `sampleSurface`, `bakeSurface`, `createSurfaceBakeManifest` and bake data types | none |
| `strata-procedural/shaders` | `seededSurfaceNoiseGlsl` | none |
| `strata-procedural/surface-fields` | Scalar-profile, relief-frame, uniform-packing, and GLSL APIs | none |
| `strata-procedural/three` | `createThreeHeightfieldGeometry` | `three` peer |
| `strata-procedural/r3f` | `StrataHeightfield` and `StrataHeightfieldProps` | React, Three, and R3F peers |

## Seeded primitives

`Seed` is a string or finite number. `seedToUint32` normalizes it to the stable key
used internally; `createSeededRandom` returns a deterministic `[0, 1)` stream;
`createSeededNoise` returns a finite-coordinate 3D value-noise sampler; and
`fractalNoise` sums a positive integer number of octaves of such a sampler.
`Random` is the `() => number` type returned by `createSeededRandom`.

The SDF functions operate on finite `{ x, y, z }` values. The primitive functions
return signed distances. The boolean functions combine finite distance values; smooth
operations require a positive finite blend radius. `Vec3` is the shared coordinate
type.

## Terrain

`createSeededTerrainField({ seed, biomes })` returns a validated,
renderer-neutral `SeededTerrainField`:

- `heightAt(x, z)` samples height.
- `sample(point)` returns `height`, `distance`, and `caveDistance`.
- `createHeightfield({ width, depth, cellSize })` returns indexed `HeightfieldMesh`
  typed arrays: positions, normals, indices, plus grid dimensions.
- `scatter({ count, area, seed? })` returns reproducible `ScatterPoint` values with
  position, rotation, and scale.

Each `Biome` has a supported `type`, two-dimensional `center`, and positive `radius`.
The supported types are `marsh`, `forest`, `desert`, `tundra`, `savanna`, `mountain`,
and `scrubland`. Heightfield width and depth are integers of at least two.
`BiomeKind`, `SeededTerrainOptions`, `TerrainSample`, `HeightfieldMesh`,
`ScatterPoint`, and `SeededTerrainField` are exported terrain types.

## Surface bakes

`createSurfacePlan({ seed, scale?, baseColor? })` normalizes a plan. `scale` is
positive and finite; `baseColor` has three finite channels in the inclusive `[0, 1]`
range. `sampleSurface(plan, u, v)` returns a single RGBA color, roughness, and signed
bump sample. `bakeSurface(plan, { width, height })` returns tightly packed
`Uint8Array` buffers:

| Field | Layout |
| --- | --- |
| `color` | RGBA8, `width * height * 4` bytes; every channel is a byte in `[0, 255]` |
| `roughness` | R8, `width * height` bytes; roughness is quantized from `[0.25, 0.85]` |
| `bump` | R8, `width * height` bytes; signed bump `[-1, 1]` is remapped to `[0, 255]` |

`createSurfaceBakeManifest(plan, bake)` validates the buffers and returns their
provenance, dimensions, format, channel count, and byte stride. It does not encode
those arrays into image-file formats. `SurfacePlanOptions`, `SurfacePlan`,
`SurfaceSample`, `SurfaceBake`, `SurfaceBakeMapName`, `SurfaceBakeMapFormat`,
`SurfaceBakeMap`, and `SurfaceBakeManifest` are exported material types.

## Scalar profiles and relief frames

`createCubicHermiteProfile(knots)` creates an immutable clamped C1 profile with two
to eight strictly increasing knots. Each knot has `coordinate`, `value`, and
`derivative`; endpoint derivatives must be zero. `sampleCubicHermiteProfile` returns
its scalar value and derivative, clamping beyond the endpoint coordinates.

`projectScalarProfileDerivative(sample, { du, dv })` applies the chain rule for a
caller-chosen scalar coordinate. `deriveReliefFrame({ du, dv }, { du, dv })` derives
an orthonormal local frame from caller-supplied surface differentials and relief
derivatives. All quantities must use the same caller-selected space.

`toCubicHermiteProfileUniforms` packs the profile into fixed-width `Float32Array`
uniforms for `surfaceFieldsGlsl`. The GLSL chunk exposes matching profile sampling,
derivative projection, and relief-frame functions. The frame uses the local
approximation `dP + N * dH`; it is not an exact tangent frame for a curved surface
that has been physically displaced.

The subpath also exports `MAX_CUBIC_HERMITE_PROFILE_KNOTS`,
`surfaceFieldsGlsl`, `CubicHermiteProfile`, `CubicHermiteProfileKnot`,
`CubicHermiteProfileUniforms`, `ScalarFieldSample`,
`ScalarCoordinateDerivatives`, `ProjectedReliefSample`, `ReliefDerivatives`,
`SurfaceDifferentials`, and `ReliefFrame`.

## Optional adapters

`createThreeHeightfieldGeometry(mesh)` creates a `THREE.BufferGeometry` from a
`HeightfieldMesh`, including normalized UVs, a bounding box, and a bounding sphere.
It expects a `HeightfieldMesh` produced or validated by the consumer.

`StrataHeightfield` is a React Three Fiber component with
`{ mesh: HeightfieldMesh; material?: THREE.Material }`. It creates and disposes a
Three geometry for the supplied mesh. It does not create the mesh or manage application
state.

The seeded field, surface-plan, SDF, and scalar-profile APIs validate their documented
finite inputs before generating output. The library does not read `Math.random`,
create a renderer from its core APIs, or own a frame loop.
