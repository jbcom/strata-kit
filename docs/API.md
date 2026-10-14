# Public API

Install `strata-procedural` and import only its declared root or subpath exports.
The root re-exports the renderer-neutral procedural and shader APIs; subpaths let
consumers keep their dependency boundary explicit.

## Imports

| Import | Exports | Dependencies |
| --- | --- | --- |
| `strata-procedural` | Noise, SDF, terrain, surface samplers/layers/wear, mesh generators, UV/triplanar/atlas, shader, and scalar-relief APIs | none |
| `strata-procedural/noise` | `seedToUint32`, `createSeededRandom`, `createSeededNoise`, `fractalNoise` | none |
| `strata-procedural/sdf` | `sdSphere`, `sdPlane`, `sdBox`, `opUnion`, `opIntersection`, `opSubtraction`, `opSmoothUnion`, `opSmoothSubtraction` | none |
| `strata-procedural/terrain` | `createSeededTerrainField` and terrain data types | none |
| `strata-procedural/materials` | Surface plans, samplers, composition, wear, UV diagnostics, triplanar sampling, and atlas bakes | none |
| `strata-procedural/mesh` | `createRevolvedMesh`, `createSweptMesh`, `createSheetMesh`, and mesh types | none |
| `strata-procedural/shaders` | `seededSurfaceNoiseGlsl`, `replaceOrThrow`, `applyShaderPatches` | none |
| `strata-procedural/surface-fields` | Scalar-profile, relief-frame, uniform-packing, and GLSL APIs | none |
| `strata-procedural/three` | `createThreeHeightfieldGeometry`, `createThreeMeshGeometry`, `createThreeSurfaceTextures` | `three` peer |
| `strata-procedural/r3f` | `StrataHeightfield` and `StrataHeightfieldProps` | React, Three, and R3F peers |

## Seeded primitives

`Seed` is a string or finite number. `seedToUint32` normalizes it to the stable key
used internally; `createSeededRandom` returns a deterministic `[0, 1)` stream;
`createSeededNoise` returns a finite-coordinate 3D value-noise sampler; and
`fractalNoise` sums between one and 32 integer octaves of such a sampler and rejects
nonfinite callback results or overflowing scaled coordinates.
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

`biomeBlend` is an optional nonnegative finite value. Zero, the default, retains
nearest-biome profiles, with stable ranking when extreme radii or coordinates
overflow or underflow the legacy distance arithmetic. Equal ranked distances keep
the first biome. This corrects previously order-dependent extreme-input output.
Positive values blend biome profiles using normalized
squared-distance exponential weights; larger values broaden the transition.
If squared distances overflow, relative weights are evaluated in log space across
all biomes, including finite distances. Equal computed distances receive equal
weights; distinctions below coordinate precision cannot be recovered.
Heightfields are limited to one million vertices and six million indices, and reject
cell spacing that collapses at their centered Float32 coordinates. Scatter is limited
to one million points.
Heightfield normals use central differences. A shared normal outside an incident
stored face's outward hemisphere is replaced by `[0, 1, 0]`, which faces outward
for every upward-wound heightfield triangle. This selective fallback preserves the
`width * depth` vertex layout, positions, indices and already-valid normal bytes;
it does not average face normals or add vertices.

During a `createHeightfield` call, terrain caches exact requested height coordinates
only for that operation. The cache holds at most 65,536 live samples over at most
three actual Z-coordinate rows, treats `-0` and `0` as distinct coordinates, and
uses direct sampling for uncached coordinates when it is full. This is an internal
work bound; it does not change `HeightfieldMesh` buffers, layout, or deterministic
output for equal inputs.

## Surface bakes

[Performance guidance](PERFORMANCE.md) collects allocation and work limits and
explains the benchmark's timing, output-byte and process-memory measurements.

See [generated-content compatibility](COMPATIBILITY.md) before persisting plans,
callbacks or baked buffers. Normalized surface plans are consumed directly;
passing them through `createSurfacePlan` again hashes their numeric seed again.

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

`createSurfaceSampler(plan)` captures a normalized plan once. A `SurfaceSampler`
provides `sample(u, v)`, returning RGBA channels in `[0, 255]`, roughness in `[0, 1]`,
bump in `[-1, 1]`, and optional metalness in `[0, 1]`. Injected samplers must be
deterministic and independent of call order.

`composeSurfaceLayers(base, layers)` accepts ordered `{ sampler, mask? }` layers.
Masks lie in `[0, 1]`; composition uses straight-alpha source-over in linear sRGB
and the same normalized weights for scalar channels. Missing metalness is dielectric
zero. `bakeSurface` also accepts a sampler, samples pixel centers, and emits optional
R8 metalness. Sampler roughness uses the full `[0, 1]` range; the older plan retains
its `[0.25, 0.85]` range. Bakes are limited to 4,194,304 pixels. A plan manifest
describes plan inputs only; it cannot serialize arbitrary callback recipes.

`createWearField({ seed, scale, amount, edgeBias, bottomBias })` provides correlated
`broad`, `mid`, `fine`, `chip`, `steel`, `oxide`, and `drip` values. Scale is positive;
the three controls lie in `[0, 1]`. Mask bias uses clamped unit coordinates with
positive v downward; scale affects noise frequency. Zero amount disables wear masks.

## Portable meshes and reskinning

The [visual acceptance gate](VISUAL-ACCEPTANCE.md) describes checked material bytes,
geometry/UV diagnostics, injected failures and the limits of rendered evidence.

`ProceduralMesh` contains Float32 positions, normals, and UVs plus Uint16 or Uint32
triangle indices. `createRevolvedMesh({ profile, segments, caps? })` revolves
`{ radius, height }` rows with strictly increasing heights. Endpoint radii may be
zero; all-zero and adjacent-zero profiles are rejected.
`createSweptMesh({ path, radius, radialSegments, caps? })` transports a circular
section along a `Vec3` path. Radius can be a positive number or an arc-length-based
callback. Duplicate and reversing path segments are rejected.
Sharp opposing radius slopes use coincident rings with separate incoming and
outgoing normals. This can increase the vertex count without changing positions
or triangle count; vertex indices are not stable across profile changes.
`createSheetMesh({ width, height, columns, rows, heightAt? })` samples an upward
XZ sheet. Meshes are bounded to one million vertices and six million indices and
reject indexed faces collapsed by Float32 quantization.
The height callback runs exactly once per grid vertex. Smooth finite-difference
normals remain unchanged; corners pointing behind their actual stored triangle
are duplicated with that triangle's outward normal. Position/UV values and triangle
count are preserved, but the final vertex count and index type can increase. The
one-million-vertex limit includes these correction vertices.

`analyzeUvLayout(mesh, { gridSize? })` inspects a `NeutralIndexedMesh` for missing,
outside, degenerate, overlapping, and stretched UV charts, plus raster coverage.
`createReskinPlan` selects `uv` or `triplanar`; it does not modify geometry.
Diagnostic `gridSize` defaults to 256 and must be an integer from one to 2048.
`sampleTriplanarSurface(sampler, point, normal, { scale?, sharpness? })` takes numeric
triples and blends three axis projections with alpha-normalized scalar channels.
Scale and sharpness must be positive finite values, defaulting to one and four.
`bakeUvAtlas(mesh, sampler, { width, height, padding?, scale?, sharpness? })` samples
those projections through valid UV charts and returns surface buffers plus `covered`.
It rejects outside, degenerate, overlapping, or zero-texel charts. Padding is at most
64 pixels, and bounded raster/dilation work may reject expensive layouts below the
4,194,304-pixel output cap. These APIs are exported from root and `materials`.

## Shader patches

`replaceOrThrow(source, anchor, replacement)` requires exactly one nonempty literal
anchor. `applyShaderPatches(source, patches)` applies ordered replacements with
contextual errors. Both return new strings; retained-anchor insertions reject repeat
application. Consumers own shader version compatibility and assembly.

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

`createThreeMeshGeometry(mesh)` validates a portable mesh and creates a geometry
whose attributes view the input arrays; keep those arrays immutable while in use.
The caller disposes the geometry.

`createThreeSurfaceTextures(bake, { flipY? })` copies bake buffers and returns `map`,
`roughnessMap`, `bumpMap`, optional `metalnessMap`, and idempotent `dispose()`.
Default `flipY: true` reverses top-left/v-down bake rows in CPU memory for conventional
Three UVs. Color uses sRGB; scalar maps remain linear. All scalar maps replicate
grayscale into RGBA: roughness and metalness use Three's G/B channels, while bump
uses R. This supports WebGL1 texture uploads at the r152 peer floor and uses four
texture-buffer bytes per scalar texel. Disposal releases only these textures.
The adapter requires Three r152 or newer for the `Texture.colorSpace` contract.

`StrataHeightfield` is a React Three Fiber component with
`{ mesh: HeightfieldMesh; material?: THREE.Material }`. It creates and disposes a
Three geometry for the supplied mesh. It does not create the mesh or manage application
state.

The seeded field, surface-plan, SDF, and scalar-profile APIs validate their documented
finite inputs before generating output. The library does not read `Math.random`,
create a renderer from its core APIs, or own a frame loop.
