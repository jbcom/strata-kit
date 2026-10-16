# Public API

Install `strata-procedural` and import only its declared root or subpath exports.
The root re-exports the renderer-neutral procedural and shader APIs; subpaths let
consumers keep their dependency boundary explicit.

## Imports

| Import | Exports | Dependencies |
| --- | --- | --- |
| `strata-procedural` | Noise, SDF, terrain, surface samplers/layers/wear, mesh generators, UV/triplanar/atlas, shader, and scalar-relief APIs | none |
| `strata-procedural/noise` | `seedToUint32`, `createSeededRandom`, `createSeededNoise`, `fractalNoise`, `createValueNoise2D`, `createFractalNoise2D`, `createSineLattice2D` | none |
| `strata-procedural/sdf` | `sdSphere`, `sdPlane`, `sdBox`, `opUnion`, `opIntersection`, `opSubtraction`, `opSmoothUnion`, `opSmoothSubtraction` | none |
| `strata-procedural/terrain` | `createSeededTerrainField`, `composeScalarField2D`, `transformScalarField2D`, `createDirectionalField2D`, `createSmoothMask2D`, and terrain/field types | none |
| `strata-procedural/materials` | Surface plans, samplers, composition, wear, UV diagnostics, triplanar sampling, and atlas bakes | none |
| `strata-procedural/mesh` | `createRevolvedMesh`, `createRevolvedSurfaceMesh`, `createSweptMesh`, `createSheetMesh`, `createParametricSheetMesh`, `superellipsePoint2D`, `superellipseHalfDepth2D`, and mesh types | none |
| `strata-procedural/shaders` | `seededSurfaceNoiseGlsl`, `replaceOrThrow`, `applyShaderPatches` | none |
| `strata-procedural/surface-fields` | Scalar-profile, relief-frame, uniform-packing, and GLSL APIs | none |
| `strata-procedural/three` | `createThreeHeightfieldGeometry`, `createThreeMeshGeometry`, `createThreeSurfaceTextures`, `snapshotThreeStaticMeshes`, `createThreeTriplanarMaterial` | `three` peer |
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

## Callable 2D noise

`createValueNoise2D({ seed })` or `createValueNoise2D({ lattice })` returns a
`(x, z) => number` sampler. Supply exactly one option. A seeded sampler uses the
existing integer hash at Y=0 with lattice values in `[-1, 1]`. An injected
`LatticeSampler2D` receives integer `(ix, iz)` coordinates, including negative
integers; its finite values are neither remapped nor clamped. It must be
deterministic and independent of call order. The four corners are evaluated in
the order `(ix, iz)`, `(ix + 1, iz)`, `(ix, iz + 1)`, `(ix + 1, iz + 1)`.

Fractional cell coordinates use cubic smoothstep. Interpolation preserves the
ordered polynomial `a + (b-a)*ux + (c-a)*uz + (a-b-c+d)*ux*uz`;
rounding can differ from repeated linear interpolation. A bounded lattice remains
within its corner range up to floating rounding. Coordinates must be finite with
absolute magnitude below `2**52`, and integer neighbors must be safe integers.
Nonfinite corner values or checked arithmetic overflow throw.

`createFractalNoise2D({ noise, octaves?, initialAmplitude?, persistence?,
octaveTransform?, normalize? })` samples a supplied 2D field with recursive
per-axis affine coordinates. Defaults are four octaves, amplitude `0.5`,
persistence `0.5`, scale `[2, 2]`, offset `[0, 0]`, and `normalize: true`.
An explicit `octaveTransform` requires both finite `scale` and `offset` pairs;
zero or negative scale is supported. Each octave adds `amplitude * noise(qx, qz)`
in order, then, only if another octave remains, advances
`qx = qx * sx + ox`, `qz = qz * sz + oz`, and `amplitude *= persistence`.
It does not pre-expand the recurrence into one transform.

Octaves must be an integer in `[1, 32]`, initial amplitude positive and finite,
persistence finite in `[0, 1]`, and normalization boolean. Normalized output
divides by the accumulated amplitude; `normalize: false` returns the raw sum.
Zero persistence still evaluates every declared octave, including zero-amplitude
samples. Input coordinates, recurrence, callback results, weighted samples, sums,
and the result must remain finite. The injected sampler can impose a narrower
coordinate domain, such as the value-noise limit above.

`createSineLattice2D({ seed, coefficients, multiplier })` creates an explicitly
configured integer lattice. All options are required; `coefficients` is a finite
pair and `multiplier` is positive and finite. It returns
`fract(sin(ix * coefficients[0] + iz * coefficients[1] + phase) * multiplier)`,
where `fract(v) = v - floor(v)`. Numeric seeds are finite phases; string seeds use
`seedToUint32(seed)` as phase. Thus numeric `0` and string `'0'` have different
meanings here, unlike the integer-hash seed normalization. For example:

```ts
import { createSineLattice2D, createValueNoise2D } from 'strata-procedural/noise';

const lattice = createSineLattice2D({
  seed: 0,
  coefficients: [13.3, 29.7],
  multiplier: 1024,
});
const field = createValueNoise2D({ lattice });
const value = field(-0.5, 0.25);
```

Lattice coordinates must be integers with absolute magnitude below `2**52`.
Products, sums, and the sine product must remain finite. Large finite products
or phases can still lose phase resolution. `Math.sin` low bits may differ between
engines or platforms; this compatibility primitive does not promise portable byte
identity. The standard seeded integer lattice remains available without sine hashing.

`ValueNoise2DOptions`, `FractalNoise2DOptions`, `SineLattice2DOptions`, and
`LatticeSampler2D` are exported from root and `noise`. Constructors capture option
values and copy tuples. Callback identity and callback state remain borrowed;
callback failures and nonfinite results are rejected during sampling.

## Callable terrain fields

`ScalarField2D` is `(x: number, z: number) => number`; `ScalarField2DInput` is a
finite constant or such a sampler. These fields use caller-declared XZ coordinates
and do not imply any height unit, mesh, or scene. Injected callbacks must be pure,
deterministic, and independent of sampling order.

`composeScalarField2D(base, layers)` captures up to 64 ordered layer records:

| Layer | Arithmetic |
| --- | --- |
| `{ operation: 'add', field, gain? }` | `h = h + field(x, z) * gain`, default gain `1` |
| `{ operation: 'multiply', field }` | `h = h * field(x, z)` |
| `{ operation: 'blend', field, weight }` | `h = h * (1-w) + field(x, z) * w` |

Gain can be any finite number, including negative or zero. Blend weights are
constant or sampled and must remain finite in `[0, 1]`; they are rejected rather
than clamped. Base is sampled first, then layers in declaration order; blend samples
its target before its weight, including at zero/one weights. Empty layers preserve
the base. There is no implicit normalization or value clamping. Later mutation of
input arrays or records does not alter the captured recipe; callbacks remain borrowed.

`transformScalarField2D(field, { scale?, offset? } = {})` samples
`field(x * sx + ox, z * sz + oz)`. Scale defaults to `[1, 1]`, offset to `[0, 0]`.
Pairs are finite and copied; zero scales make an axis constant and negative scales
mirror it. Coordinates and transformed coordinates must be finite.

`createDirectionalField2D({ direction, wavelength, profile, displacement?, phase? })`
starts with `q = x * direction[0] + z * direction[1]`, adds each displacement in
declared order, divides by wavelength, then adds phase and samples the profile.
Direction is a finite pair whose length differs from one by at most `1e-12`;
its components are preserved without renormalizing. Wavelength is positive and
finite. At most 32 displacements are accepted, each a constant or 2D field in
the same length units as XZ. Phase is a constant or field in **cycles**, default `0`.
An omitted displacement list is empty. Both profile value and derivative must be
finite, even though this field returns only the value. Direction and displacement
data are copied; a supplied profile is a borrowed `ScalarProfileSampler`.

`createSmoothMask2D({ shape, edges })` returns a scalar in `[0, 1]` by evaluating
`t*t*(3-2*t)` with `t = clamp((contour-e0)/(e1-e0), 0, 1)`:

- `{ kind: 'radial', center: [cx, cz] }` uses `hypot(x-cx, z-cz)`.
- `{ kind: 'box-max', center: [cx, cz], halfExtents: [hx, hz] }` uses
  `max(abs(x-cx)-hx, abs(z-cz)-hz)` with positive finite half-extents.

Centers and edges are required finite pairs and copied. Edges must be distinct
with a finite difference; reversed edges produce a decreasing mask. Sampling
rejects nonfinite contours or transition ratios before clamping. Box-max is a
scalar contour, **not a Euclidean signed-distance box**: diagonal outside corners
use the maximum axis distance. Box ties can have creases in the active transition;
radial distance has an origin singularity unless the mask is locally constant.
Neither shape promises globally smooth spatial gradients.

All callable terrain fields validate finite inputs, callback values, and their
documented intermediate/result checks. Construction is bounded per list; sampling
cost follows the expanded callback recipe. Nested fields and arbitrary callbacks
remain caller-controlled, so the list limits do not bound total callback time.
There is no persistent coordinate cache or graph scheduler. `ScalarField2D`,
`ScalarField2DInput`, `ScalarField2DLayer`, `DirectionalField2DOptions`, and
`SmoothMask2DOptions` are exported from root and `terrain`.

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

## Packed scalar grids

Root and `strata-procedural/terrain` export `packScalarGrid16`,
`sampleScalarGrid16`, `ScalarGrid16Input` and `ScalarGrid16`.
`packScalarGrid16({ width, height, values, min, range })` requires integer
dimensions from 1 through 4097, exactly `width * height` finite scalar values in
row-major order, finite `min` and finite positive `range`. The endpoint
`max = min + range` must be finite and representably greater than `min`.
No range is inferred or floored. Each sample uses two numeric bytes: high byte
then low byte, tightly packed at `(row * width + column) * 2`.

Values at or below `min` encode 0; values at or above `max` encode 65535.
Strict interior codes use `round(((value-min)/range)*65535)`, clamped to that
integer range. Explicit endpoint guards preserve endpoint codes even when
subtraction loses range precision. Division-first avoids a reciprocal-overflow
requirement. The returned metadata object is frozen and all input data is copied;
its fresh `Uint8Array` remains caller-mutable. The dimension limit bounds the
output to 33,570,818 bytes, validated before allocation or sample access.

`sampleScalarGrid16(grid, column, row)` accepts that result or structurally valid
hand-authored `Uint8Array` bytes. It validates metadata and exact byte count in
O(1), including genuine `Uint8Array` views from another JavaScript realm. It
clamps finite fractional sample indices to grid bounds, decodes normalized
codes, interpolates across columns then rows, and returns `min + value * range`.
The last valid cell handles upper edges; singleton axes repeat their only sample.
Sampling reads current bytes without copying or caching; callers synchronize any
mutations. The codec chooses no world axes, bounds, UV mapping or normal policy.

For well-conditioned metadata, scalar quantization contributes at most
`range/(2*65535)` plus floating-point rounding error. The same bound carries
through convex bilinear interpolation relative to the correspondingly clamped
source samples. Large `min` relative to `range` can make endpoint spacing and
subtraction/addition rounding dominate. This bound excludes source quantization,
coordinate precision, mesh tessellation, morphing and GPU arithmetic.

Root and `strata-procedural/shaders` export `scalarGrid16Glsl`. In highp GLSL ES3,
`strataDecodeScalar16(vec2 rg)` decodes normalized numeric RG8 channels to `[0,1]`.
`strataSampleScalarGrid16(sampler2D data, ivec2 size, vec2 sampleIndex, float minimum,
float range)` performs the same clamped manual interpolation using `texelFetch`.
Supply dimensions and metadata satisfying the CPU contract in the GPU's Float32
domain: all used arithmetic must remain finite normal values or zero, with
representably distinct endpoints. GLSL does not validate these preconditions.
CPU/GPU bit identity and subnormal preservation are not promised. Texture data
must have numeric channels without color conversion; nearest sampling, row
orientation, byte unpack alignment and upload lifetime remain caller-owned.
No uniforms, transforms, derivatives, textures or render loop are created.

## Segment samples and filtered bands

The root and `strata-procedural/materials` export `sampleSegment2D`,
`projectPixelFootprint2D`, `sampleBandCoverage`, `SegmentSample2D` and
`BandCoverageSample`. All 2D inputs are arrays of exactly two finite numbers,
typed as `readonly [number, number]`; typed arrays are not tuple inputs.

`sampleSegment2D(point, start, end)` returns fresh `nearest` and `tangent` tuples,
clamped fraction `t`, unsigned `distance`, segment `length`, and
`along = t * length`. A nonzero segment has a unit tangent from start to end.
Coincident endpoints produce a point sample with zero tangent, length, t and
along. Exact input endpoints are returned exactly, even when normalization would
round a projection just inside the segment. Other projections clamp before
dividing by length. No epsilon threshold or squared-length denominator erases
short segments. Inputs are copied, no output is cached, and unrepresentable
derived differences, lengths, projections or distances throw. These are ordinary
floating-point calculations, not exact geometric predicates.

`projectPixelFootprint2D(direction, perPixelX, perPixelY)` returns the full extent
of a local pixel parallelogram along a normalized caller direction:
`abs(dot(axis, perPixelX)) + abs(dot(axis, perPixelY))`. Direction magnitude does
not change the result. For exactly zero direction, it uses the larger length of
`perPixelX + perPixelY` and `perPixelX - perPixelY`, a conservative diameter.
Zero derivatives return zero. Nonfinite or unrepresentable arithmetic rejects.
The caller supplies the coordinate changes per screen pixel in the same units.
An across-segment direction is `[-tangent[1], tangent[0]]`; a radial endpoint
filter can instead choose `point - nearest`. That choice is explicit: neither
projection is inferred or presented as exact pixel-area integration.

`sampleBandCoverage(distance, halfWidth, feather, footprint = 0)` requires finite
nonnegative scalars in one length unit. With `H = max(halfWidth, footprint/2)`
and `E = max(feather, footprint/2)`, it returns:

- `effectiveHalfWidth: H`;
- `edgeCoverage`: one minus cubic smoothstep across `[H-E, H+E]`;
- `widthCoverage: halfWidth/H`, or zero when H is zero;
- `coverage: edgeCoverage * widthCoverage`.

The calculation avoids overflowing edge endpoints. When E is zero the edge is
exactly 1 inside, 0.5 on and 0 outside the boundary. Zero authored half-width
always yields zero coverage. Positive subpixel widths have widened support and
attenuated opacity, continuously approaching zero. A feather wider than H can
reduce center opacity. This is a local one-dimensional band approximation,
including when distance describes rounded caps; it is not an exact area filter.
Selection, ties, segment identity, arc-length prefixes, joins, compositing and
material appearance remain caller-owned. To impose a visibility floor without
duplicating filtering, a caller can use `halfWidth > 0 ? band.edgeCoverage *
Math.max(band.widthCoverage, ownFloor) : 0`.

The root and `strata-procedural/shaders` export `segmentCoverageGlsl`, defining
`StrataSegmentSample2D`, `StrataBandCoverageSample`, `strataSampleSegment2D`,
`strataProjectPixelFootprint2D` and `strataSampleBandCoverage`. Struct fields match
the CPU results; the GLSL band function takes all four scalar arguments, which
must be nonnegative. Use
highp GLSL ES 3.00 and local coordinates whose important differences survive
Float32 storage. Inputs and intermediate arithmetic must remain finite without
depending on subnormal preservation. GLSL helpers do not perform CPU validation.
Derivatives are passed explicitly: compute `dFdx`/`dFdy` before divergent control
flow. No undefined equal-edge `smoothstep` is used. Float64 CPU and Float32 GPU
outputs are compared with scale-aware tolerances, not promised byte-identical.

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
The inside direction is computed from the source position and inside point
before position storage is rounded to Float32.
`normalAt(u, v)` supplies normalized authored normals and cannot be combined
with `insideAt` or an explicit `normalMode`. Authored normals that oppose a
retained triangle are rejected rather than silently replaced.

Optional `winding: 'forward' | 'reverse'` selects one orientation for the whole
parameter grid instead of inferring it from the normals. Forward uses
`[a, c, b]`, `[b, c, d]` per cell; reverse swaps each triangle's final two
corners. Generated grid or area-weighted normals receive the same global sign.
Authored normals are kept and must agree with the selected winding. This option
is mutually exclusive with `insideAt`. Corner repair still requires a strictly
positive dot against each actual stored face; an explicit winding is not a
self-intersection or solid-space certificate.

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
Vertex counts up to 65,536 use Uint16 indices; larger valid outputs use Uint32.

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
seam ends at U = 1. `uv: 'angular-length'` writes the angular sweep offset from
the domain start times the mean section half-extent, with displaced Y as V.
Its U is continuous across the wrapped-angle branch cut, and a closed seam ends
at `2*pi*meanExtent` instead of repeating U = 0. This is an approximation rather
than exact ellipse arc length. `uv: 'wrapped-angular-length'` explicitly uses
wrapped angle times mean extent and repeats the first seam UV; it can jump
inside cells at ±pi and is only appropriate when that wrapped projection is
intended. Callback angles and parameter provenance remain wrapped in every
mode. `RevolvedSurfaceMesh.parameters` is an interleaved
`Float64Array` of `[s, wrapped theta]` for each output vertex, including
corner repairs, independent of the UV mode. Stored positions, normals and
UVs use Float32; indices use Uint16 or Uint32. The constructor rejects
inconsistent orientation across a shared patch edge, non-pole degenerate
faces and positive-area faces lost to Float32 quantization. It can duplicate
corners to give an incident face a compatible normal, so output vertex count
and indices need not equal the original grid. Base grid work is bounded
before callbacks to one million vertices and six million candidate indices;
final repaired vertices and emitted indices are bounded again. This is a
surface builder with radial orientation by default, not a hollow mesh, solid volume,
collision, skinning or animation API. It is separate from
`createRevolvedMesh`, whose existing closed profile/cap contract is unchanged.

With optional `winding: 'forward' | 'reverse'`, the complete parameter grid uses
one declared winding instead of radial inference. This supports folded meridians
with coherent undersides that face toward the axis. Parameter-derived normals
use `dP/dtheta` crossed with `dP/ds` for forward, and its negation for reverse.
The corresponding base triangles are `[a, b, c]`, `[b, d, c]`, with `b` the
next angular sample and `c` the next row; reverse swaps the last two corners.
These triangles differ from the sheet constructor's forward convention.
Generated normals
follow the same global sign; stored-face corner repairs, pole and degeneracy
checks, seam correspondence and allocation limits still apply. No per-face
radial flipping, caps, containment or intersection detection is added. Omitting
`winding` retains the radial orientation policy described above.

### Signed-power superellipse sections

`superellipsePoint2D(section, angle)` and `superellipseHalfDepth2D(section, x)`
are exported from the root and `strata-procedural/mesh`. A `SuperellipseSection2D`
contains readonly `halfWidth`, `halfDepth`, and `power`: positive finite half-extents
and a finite exponent at least two. Inputs and outputs use Float64 arithmetic.

The point sampler returns a fresh `[first, second]` tuple with the eccentric,
signed-power parameterization `a*sign(cos(t))*abs(cos(t))**(2/n)` and
`b*sign(sin(t))*abs(sin(t))**(2/n)`. Angle zero is the positive first axis;
`Math.PI/2` is the positive second axis. The named quarter-turn cardinals within `[-2*Math.PI, 2*Math.PI]` reduce to
exact axis points, with zero components returned as positive zero. Nearest-quadrant
reduction preserves tiny signed offsets without an epsilon snap. Arbitrarily large
angles use floating remainder; mathematical periodicity does not imply bit-identical
results for rounded angle sums. Even a rounded multi-turn cardinal such as
`11*Math.PI/2` can retain a nonzero local offset; it is not snapped to an axis.

The half-depth sampler returns the nonnegative second-axis extent at a first-axis
coordinate: zero at or outside `abs(x)>=a`, `b` at zero, and otherwise
`b*(1-(abs(x)/a)**n)**(1/n)`. Its boundary calculation preserves small represented
differences from `a`. Outputs remain within the supplied extents; final subnormal
products may round to zero. At high powers a point's first coordinate can round to
`a` while its second coordinate remains nonzero, so a point-to-inverse round trip
is not guaranteed at ill-conditioned represented corners.

```ts
import { superellipsePoint2D, superellipseHalfDepth2D } from 'strata-procedural/mesh';
const section = { halfWidth: 2, halfDepth: 1, power: 4 };
const [x, z] = superellipsePoint2D(section, Math.PI / 4);
const positiveDepth = superellipseHalfDepth2D(section, x);
```

These functions choose no height profile, 3D embedding, inset, ridge, liquid policy,
normal or arc-length metric. Their eccentric parameter differs from the true polar
angle of `createRevolvedSurfaceMesh`, even for unequal-axis ellipses. They do not
change existing mesh sampling or provide a constant-speed parameterization.

### UV analysis and reskinning

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

`visitUvTexelFootprints(mesh, { width, height, triangles?, rowOrigin? }, visit)` streams
one `UvTexelFootprint` per positive-area triangle/texel intersection and returns
`{ triangles, footprints }`. Each record owns its `barycentric` and model-space
`position` triples, source `triangle` ID, integer `column` and `row`, and raw
`weight` in texel-square units. Weight is geometric area, independent of material
alpha, and is not normalized across triangles. Overlapping source triangles can
contribute more than one square unit to a cell; callers own overlap admission and
aggregation policy. This is UV coverage, not solid-volume or clearance evidence.

Omitted `triangles` visits all source triangles. A copied array or Uint16/Uint32 array
selects distinct in-range source IDs in caller order; an empty selection emits nothing.
Clipping always traverses increasing bottom-origin rows, then columns. The default
`rowOrigin: 'bottom'` labels that order directly; `'top'` only reverses row labels.
Selected triangles must have finite unit-tile UVs and nonzero exact orientation.
There is no atlas stretch or minimum-area admission threshold. When Float64
arithmetic is ill-conditioned, area weights and centroids can lose accuracy even
though orientation validation is exact; this API does not promise exact integration.
If numerical clipping computes no positive piece of a selected nondegenerate triangle,
the call throws instead of silently omitting it. Width/height obey the 4,194,304-pixel
cap and selected bounding-box raster work is limited to 67,108,864 candidates before
callbacks begin. Mesh validation still covers all source arrays and requires a
nonempty indexed mesh. Inputs are borrowed synchronously: do not mutate them from
callbacks. A callback or later precision error may follow earlier emitted records;
commit consumer results only after the call completes. No atlas buffers are allocated.
The function and both footprint types are exported from root and `materials`.

## Shader patches

`replaceOrThrow(source, anchor, replacement)` requires exactly one nonempty literal
anchor. `applyShaderPatches(source, patches)` applies ordered replacements with
contextual errors. Both return new strings; retained-anchor insertions reject repeat
application. Consumers own shader version compatibility and assembly.

## Scalar profiles and relief frames

`ScalarProfileSampler` is `(coordinate: number) => ScalarFieldSample`. A scalar
profile chooses no spatial projection; `terrain.createDirectionalField2D` supplies
an explicit XZ projection when needed. The following profiles are exported from
root and `surface-fields` and have no matching GLSL implementation:

`createPeriodicRidgeProfile({ crest, risePower })` returns a unit-period profile.
Both options are required and finite: `0 < crest < 1` and `risePower > 1`.
For fractional phase `p = coordinate - floor(coordinate)`, its value is
`sin((s * Math.PI) / 2) ** risePower`, with `s = p / crest`, on the rising segment;
otherwise it is `1 - s*s*(3-2*s)`, with `s = (p-crest)/(1-crest)`.
Values lie in `[0, 1]`; derivatives are analytic value changes **per cycle**.
Wraps and crests return derivative zero explicitly, including negative cycles.
The joins are C1, but curvature continuity is not promised; in particular the
periodic wrap is not C2 for `1 < risePower < 2`. Options are captured by value,
and each sample returns an independent record.

`sampleCosineProfile(coordinate)` returns
`{ value: Math.cos(coordinate * Math.PI * 2), derivative: -Math.sin(coordinate * Math.PI * 2) * Math.PI * 2 }`.
It preserves that multiplication order without reducing the coordinate first;
whole-cycle translations can therefore differ by floating argument-reduction error.

Both periodic samplers require finite coordinates with absolute magnitude below
`2**52`. The ridge constructor rejects nonfinite segment reciprocals; sampling
rejects nonfinite values, derivatives, and checked slope intermediates. Very narrow
finite segments can produce an overflowing derivative and throw when sampled.
These guards do not impose an arbitrary upper exponent limit or change the existing
cubic-Hermite coordinate domain.

`createMonotoneCubicProfile(points)` owns and deeply freezes 2–65,536
`MonotoneCubicProfilePoint` records `{ coordinate, value }`. Coordinates must be
strictly increasing and all coordinates, values, interval spans, value differences
and secants finite; a nonzero difference whose secant underflows to zero is
rejected. It returns `MonotoneCubicProfile` with a frozen `[first,last]`
`domain` and frozen `points` containing the derived `derivative` at each input.
The endpoint slopes are the adjacent secants. Interior slopes are zero at plateaus
or sign changes, otherwise the interval-weighted harmonic mean. This endpoint
policy differs from interpolators using a three-point endpoint estimator.
For neighboring spans `h0,h1` and same-sign nonzero secants `d0,d1`, the
[weighted harmonic rule](https://docs.scipy.org/doc/scipy/reference/generated/scipy.interpolate.PchipInterpolator.html)
uses `w0=2*h1+h0`, `w1=h1+2*h0` and `(w0+w1)/(w0/d0+w1/d1)`.
Evaluation normalizes these weights and enforces the mathematical neighboring
slope bounds to avoid avoidable overflow; it does not multiply secants to test
their signs.

`sampleMonotoneCubicProfile(profile, coordinate)` returns `ScalarFieldSample`.
It returns exact stored values and slopes at knots and uses binary search between
them. Strictly exterior samples clamp value and return derivative zero; exact
endpoints return the interior one-sided derivative. Interior joins are C1, but the
constant exterior extension is generally only C0. It preserves each interval's
value bounds subject to floating-point rounding, without an epsilon slope cutoff.
Nonfinite derived coefficients or sample results throw; arbitrary-range precision
and byte identity with other evaluation orderings are not promised. Input arrays
and records are copied, and each sampled result is fresh. This is CPU-only; its
distinct `points` representation is not the bounded GLSL Hermite format.

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

`createThreeTriplanarMaterial(textures, options?)` returns a fresh
`MeshStandardMaterial` that borrows `map`, `roughnessMap`, `bumpMap`, and optional
`metalnessMap`. It copies the texture bindings and affine `fieldTransform`; it
does not mutate geometry or dispose textures. Dispose each material independently.
Recreate through the factory rather than cloning or serializing the shader hook.
Its types are `ThreeTriplanarTextures` and `ThreeTriplanarMaterialOptions`.

`fieldTransform` defaults to identity and maps geometry-local positions to field
coordinates; normals use its inverse transpose before interpolation. The three
projections are `.zy`, `.xz`, `.xy`. `sharpness` defaults to 4 and must remain
positive in Float32. `flipV` defaults to true, converting v-down field coordinates
to t-up texture coordinates; choose it to match the supplied texture rows. Color
and scalar channels share alpha-weighted normal blending. Texture upload decodes
sRGB color once. Uncovered blended samples have zero alpha and neutral encoded bump
0.5. The returned material uses Three's default opaque rendering, which forces
framebuffer alpha to one; callers choose transparency through standard material
properties when needed.

Options also accept standard `color`, `roughness` (default 1), `metalness`
(default 0), `bumpScale` (default 1), and `side` (default FrontSide). Scalars
roughness/metalness are in [0,1]. Bump uses encoded unit-interval height and
Three's native derivative perturbation, not a physical displacement in meters;
height differences hold blend weights fixed. Native bump behavior can differ
between Three revisions. Valid nonzero static normals are the caller's contract;
animated rest-coordinate binding and node materials are not provided.

Each texture must be ready non-premultiplied unsigned-byte RGBA8 2D data with at
most 4,194,304 pixels. Color accepts sRGB or linear-sRGB; scalars require
NoColorSpace. Cube, array, volume, video, compressed and render-target textures,
internal-format overrides and malformed image bytes are rejected. Transforms must
have default offset/repeat/center/rotation and an identity texture matrix; use
`fieldTransform` for coordinate control. Keep borrowed texture data and metadata
unchanged while the material uses them. Field transforms must
be finite, affine and invertible after Float32 conversion. Shader integration
requires WebGLRenderer and the supported standard-material chunk anchors; missing
anchors fail before shader mutation. The color include must precede dependent
roughness, metalness and normal-map includes; native scalar-factor declarations
must remain in their corresponding chunks. Unsupported layouts fail before any
source or uniform assignment. This is a bounded compatibility check, not support
for arbitrary future shader semantics. WebGL1 sRGB requires EXT_sRGB. The r152
renderer-owned legacy sRGB upload format is accepted only with its native metadata
and WebGL1 extension; it cannot be reused on WebGL2. The material replaces native
map sampling chunks without adding a second UV sampling path or owning a renderer.

`StrataHeightfield` is a React Three Fiber component with
`{ mesh: HeightfieldMesh; material?: THREE.Material }`. It creates and disposes a
Three geometry for the supplied mesh. It does not create the mesh or manage application
state.

The seeded field, surface-plan, SDF, and scalar-profile APIs validate their documented
finite inputs before generating output. The library does not read `Math.random`,
create a renderer from its core APIs, or own a frame loop.
