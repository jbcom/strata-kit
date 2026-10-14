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
| `strata-procedural/mesh` | `createRevolvedMesh`, `createRevolvedSurfaceMesh`, `createSweptMesh`, `createSheetMesh`, `createParametricSheetMesh`, and mesh types | none |
| `strata-procedural/shaders` | `seededSurfaceNoiseGlsl`, `replaceOrThrow`, `applyShaderPatches` | none |
| `strata-procedural/surface-fields` | Scalar-profile, relief-frame, uniform-packing, and GLSL APIs | none |
| `strata-procedural/three` | `createThreeHeightfieldGeometry`, `createThreeMeshGeometry`, `createThreeSurfaceTextures`, `snapshotThreeStaticMeshes` | `three` peer |
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
`createSheetMesh({ width, height, columns, rows, heightAt?, includeCell? })` samples an upward
XZ sheet. Meshes are bounded to one million vertices and six million indices and
reject indexed faces collapsed by Float32 quantization.
The height callback runs exactly once per grid vertex. Smooth finite-difference
normals remain unchanged; corners pointing behind their actual stored triangle
are duplicated with that triangle's outward normal. Position/UV values and triangle
count are preserved, but the final vertex count and index type can increase. The
one-million-vertex limit includes these correction vertices.
Optional `includeCell(column, row)` runs once per cell in row-major order before
height sampling and must return a boolean. Each included cell emits the original
two triangles; omitted cells retain their sampled vertices and UVs. Worst-case
grid bounds are checked before either callback. An all-false selection produces
an empty index buffer with complete sampled attributes. The generic Three mesh
adapter accepts this empty surface; the heightfield adapter and UV analysis/atlas
contracts still require triangles. Normal correction considers retained faces only.

### Parametric sheets

`createParametricSheetMesh(options)` maps a unit-square grid through
`positionAt(u, v): Vec3`, with `u = column / (columns - 1)` and
`v = row / (rows - 1)`. `columns` and `rows` are sample-vertex counts:
at least two each, or at least four columns when `closedColumns` is true.
Optional `uvAt(u, v)` returns two coordinates; otherwise UVs are `[u, v]`.
Positions, normals and UVs are Float32 output, while `sourceVertex` is a
`Uint32Array` mapping every output vertex to its original
`row * columns + column` sample ID. Returned indices are Uint16 or Uint32.
The constructor is exported from root and `strata-procedural/mesh`.

```ts
import { createParametricSheetMesh } from 'strata-procedural/mesh';

const mesh = createParametricSheetMesh({
  columns: 9,
  rows: 5,
  positionAt: (u, v) => ({ x: u, y: v, z: 0.1 * Math.sin(Math.PI * u) }),
  uvAt: (u, v) => [2 * u, v],
  normalMode: 'area-weighted',
});
```

Without `normalAt`, `normalMode: 'grid'` (the default) derives normals from
neighbouring samples on the full mapped surface, including samples whose cells
are later omitted. `normalMode: 'area-weighted'` accumulates retained
triangle face crosses in Float64 before storing normalized Float32 normals.
`insideAt(u, v)`, when supplied, returns a **point in the same frame as
`positionAt`**; it guides generated normals away from that point. It is an
orientation hint, not a solid containment or collision certificate. A
referenced sample with a coincident or tangent inside point is rejected.
`normalAt(u, v)` supplies normalized authored normals and cannot be combined
with `insideAt` or an explicit `normalMode`. Authored normals that oppose a
retained triangle are rejected rather than silently replaced.

`includeCell(column, row)` selects whole grid cells; `includeVertex(column,
row)` selects each sampled vertex, so a retained cell can lose an individual
triangle touching an omitted vertex. Both callbacks run once in row-major
order before `positionAt` sampling and must return booleans. All original
sampled positions and UVs remain in the output even if unused by indices.
An unused generated normal that has no derivative or retained-face direction
falls back to `[0, 1, 0]`; a referenced sample with no computable normal
is rejected.

`closedColumns: true` copies the first position, authored/generated normal
and inside point into a distinct final column; it adds no extra strip.
`positionAt`, `normalAt` and `insideAt` are called only for unique columns,
while `uvAt` and `includeVertex` are independently called at both seam
endpoints. A seam can therefore have distinct UVs or vertex selection while
sharing position and normal. Generated corner repair may duplicate vertices
where an indexed triangle would face behind its smooth normal.
`sourceVertex` identifies the original sample for each duplicate; consumers
must use returned indices rather than infer grid connectivity. Mixed patch
orientation, degenerate retained triangles and unresolved normal conflicts
reject. Input coordinates and stored Float32 values must be finite;
`columns * rows` and the maximum candidate indices are bounded by one
million and six million before callbacks, and repaired output stays within
the vertex cap. Callbacks must be deterministic and independent of call order
for repeatable output.

### Revolved section surfaces

`createRevolvedSurfaceMesh(options)` accepts either an array of at least two
`sections`, or `sectionAt(s)` with integer `subdivisions >= 1` (sampled
once per row at `s = row / subdivisions`). A `RevolvedSection` supplies
`height`, `halfWidth`, `positiveDepth` toward +Z, `negativeDepth`
toward -Z, and optional XZ `center` (default `[0, 0]`). Angle zero points
along +Z and `pi/2` along +X. The polar superellipse `power` defaults to
two and must be finite and at least two. All non-pole half-extents must be
positive and survive Float32 storage; all-zero poles are allowed only at
end rows. Adjacent fully collapsed rows and non-pole zero-area faces reject.

The default angular domain is `{ kind: 'closed', seam: 0 }` with at least
three segments. `{ kind: 'open', start, end }` accepts at least one segment
and a finite positive span of at most `2*pi`; even a full-turn open domain
retains separate boundaries. Closed domains duplicate the first angular
column at the seam and sample offsets only at unique columns. The callback
angle is wrapped with `atan2(sin(angle), cos(angle))`; either signed-pi
endpoint is possible. `radialOffset(s, theta)` and
`axialOffset(s, theta)` add local radial and Y displacements and must be
pure; closed offsets must be periodic. A negative displaced radius clamps
to zero. No end caps are inferred.

```ts
import { createRevolvedSurfaceMesh } from 'strata-procedural/mesh';

const mesh = createRevolvedSurfaceMesh({
  sections: [
    { height: 0, halfWidth: 0.3, positiveDepth: 0.2, negativeDepth: 0.28 },
    { height: 1, halfWidth: 0.35, positiveDepth: 0.24, negativeDepth: 0.3 },
  ],
  segments: 24,
  angular: { kind: 'open', start: -1.2, end: 1.2 },
  uv: 'angular-length',
});
```

`uv: 'normalized'` (default) writes `[column / segments, s]`; its closed
seam ends at U = 1. `uv: 'angular-length'` writes wrapped angle times the
mean section half-extent and displaced Y, an approximation rather than exact
ellipse arc length. `RevolvedSurfaceMesh.parameters` is an interleaved
`Float64Array` of `[s, wrapped theta]` for each output vertex, including
corner repairs, independent of the UV mode. Stored positions, normals and
UVs use Float32; indices use Uint16 or Uint32. The constructor rejects
inconsistent orientation across a shared patch edge, non-pole degenerate
faces and positive-area faces lost to Float32 quantization. It can duplicate
corners to give an incident face an outward normal, so output vertex count
and indices need not equal the original grid. Base grid work is bounded
before callbacks to one million vertices and six million candidate indices;
final repaired vertices and emitted indices are bounded again. This is a
radially oriented surface builder, not a hollow mesh, solid volume,
collision, skinning or animation API. It is separate from
`createRevolvedMesh`, whose existing closed profile/cap contract is unchanged.

`analyzeUvLayout(mesh, { gridSize? })` inspects a `NeutralIndexedMesh` for missing,
outside, degenerate, overlapping, and stretched UV charts, plus raster coverage.
`createReskinPlan` selects `uv` or `triplanar`; it does not modify geometry.
Diagnostic `gridSize` defaults to 256 and must be an integer from one to 2048.
Overlap uses positive-area triangle intersection in the stored Float32 UVs;
shared edges are not overlap. A deterministic U sweep with balanced active V
intervals selects pairs whose bounding boxes intersect in both axes. The unchanged
8,388,608-pair budget now counts those two-axis candidates rather than every U-only
pair, so V-disjoint layouts no longer exhaust it merely by sharing U coordinates.
Pathological candidate density can still fail before an overlap verdict.
`sampleTriplanarSurface(sampler, point, normal, { scale?, sharpness? })` takes numeric
triples and blends three axis projections with alpha-normalized scalar channels.
Scale and sharpness must be positive finite values, defaulting to one and four.
`bakeUvAtlas(mesh, sampler, { width, height, padding?, scale?, sharpness?, coverage? })` samples
those projections through valid UV charts and returns surface buffers plus `covered`.
The default `coverage: 'pixel-center'` retains strict centre sampling and rejects
triangles reaching no pixel centre. Opt-in `coverage: 'area'` clips every triangle
against texel squares and samples each positive-area piece at its surface centroid.
Area mode blends unrounded linear-light color and material channels using geometric
area and sampler alpha. Nonoverlapping triangles may contribute to the same texel;
this is footprint filtering, not permission for UV overlap. Alpha is averaged over
the covered area, so a small opaque triangle remains opaque. `covered` counts texels
touched before padding, not total geometric area. Covered zero-alpha texels have
zero color/roughness/metalness and neutral bump 128; untouched texels remain zero.
Both modes reject outside, degenerate, overlapping, or excessively stretched charts.
Centroid quadrature approximates varying fields; it does not promise exact field
integration, high-frequency antialiasing, or separation of islands smaller than a texel.
Padding is at most
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
Positions, normals, and indices are required; UVs are optional and produce no UV
attribute when absent. The caller disposes the geometry.

`snapshotThreeStaticMeshes(root, { space? })` copies a caller-prepared `Object3D`
hierarchy into `ThreeStaticMeshSnapshot[]` in deterministic preorder, including a
mesh at the root. Call `root.updateWorldMatrix(true, true)` before taking a snapshot;
the function reads `matrixWorld` and never updates matrices, attributes, geometry,
materials, or scene state. `space` defaults to `"root"`, removing the prepared root
transform; `"world"` retains prepared world coordinates.

Each snapshot contains `name`, copied Float32 `positions` and `normals`, copied
Uint16 or Uint32 `indices`, and optional copied Float32 `uvs`. Interleaved and
normalized CPU-readable attributes are read through their accessors. Nonindexed
triangles receive sequential indices. Supplied normals use the inverse transpose
and normalize nonzero vectors; authored zero normals stay zero. Missing normals
use area-weighted incident faces in the stored transformed coordinates, leaving
unused or cancelling vertices at zero. A reflected transform reverses each
triangle's winding. The result keeps no source scene or material references and
can feed portable mesh analysis, UV bakes, or `createThreeMeshGeometry`.

Transforms must be finite, affine, and invertible. Position/normal/UV layouts must
be complete, indices must reference existing vertices, and each stored triangle
must have finite nonzero area. Allocation limits across the whole hierarchy are
100,000 nodes, 1,000,000 vertices, and 6,000,000 index entries; counts are checked
before output allocation. Skinned, instanced or batched meshes, lines, points, sprites,
skin attributes, populated morph attributes, material arrays, geometry groups,
instanced buffer geometries, partial draw ranges, and cyclic or shared-node hierarchies are rejected. Visibility,
custom attributes, animation, material state, and textures are not exported.
An empty hierarchy of ordinary objects returns an empty array. The options type is
`SnapshotThreeStaticMeshesOptions`; both types are exported only from `three`.

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
