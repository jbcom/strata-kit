# Architecture

Strata Procedural is a data-first procedural library, not a game framework. Its current
pipeline composes deterministic numeric fields into portable data that a consumer can
render, bake, serialize, or use to drive its own systems.

```text
explicit seed
  -> noise and SDF operations
  -> terrain fields, surface plans, or scalar profiles
  -> typed-array meshes and composed surface-map buffers
  -> optional Three.js geometry or React Three Fiber view
```

## Module boundaries

| Layer | Modules | Responsibility |
| --- | --- | --- |
| Numeric primitives | `noise`, `sdf` | Explicit seeded randomness, value noise, and finite SDF composition |
| Procedural data | `terrain`, `materials`, `mesh`, `surface-fields`, `shaders` | Height samples, portable meshes, coherent surface layers, UV bakes, scalar profiles, and checked GLSL patches |
| Adapters | `three`, `r3f` | Translate supplied mesh/bake data into geometry, textures, or a view; copy prepared static Three meshes into neutral buffers |

The `mesh` public subpath also exposes `createParametricSheetMesh` and
`createRevolvedSurfaceMesh` beside the existing sheet and revolve
constructors. Both new constructors return renderer-neutral typed arrays and
leave material, placement and deformation policy with callers. Their
callback inputs are normalized parameters, never a hidden random stream;
repeatability requires pure, order-independent callbacks.

The root package re-exports only the procedural layers. `three` and `r3f` are separate
package exports with optional peer dependencies, so importing the core does not load a
renderer or React.

The optional static snapshot path runs in the opposite direction: a caller-prepared
Three hierarchy becomes copied mesh buffers for the neutral analysis and baking
pipeline. It reads world matrices without scene updates, applies inverse-transpose
normal transforms and reflected winding, and retains no renderer resources or
source object references. Hierarchy-wide count limits precede output allocation.
Unsupported deformation and render partitions fail explicitly; the adapter does
not infer material semantics or become an asset loader or animation system.

## Determinism and validation

The built-in stochastic generators begin from a string or finite numeric `Seed`.
`fractalNoise` accepts a caller-supplied noise function: its determinism depends
on that function being deterministic and independent of call order.
Fields capture normalized inputs before use, so later mutation of the caller's input
does not alter an already-created terrain field or surface plan. The public seeded
field, surface-plan, SDF, and scalar-profile APIs validate documented finite inputs
before they enter generated output.

`createHeightfield` uses an operation-local exact-coordinate cache while it derives
central-difference normals. It retains no more than 65,536 live samples in at most
three actual Z-coordinate rows; signed zero remains distinct. The cache is discarded
before the method returns and falls back to direct height sampling when full, so it
does not add global state or alter the returned typed-array values or layout.

Determinism applies to a fixed release and equal inputs. A change to seed hashing,
random draw order, noise arithmetic, or a documented output layout changes generated
content and must receive compatibility review plus focused regression tests.

[Generated-content compatibility](COMPATIBILITY.md) describes saved seeds,
normalized plans, opaque callback recipes, buffer ownership and upgrade checks.

Swept meshes derive normals from stored Float32 positions and split rings at sharp
radius cusps to preserve each side's shading. Blended terrain retains relative
biome weights through log-space evaluation when normalized distances overflow;
the ordinary finite-distance path is unchanged. Default nearest-biome selection also
uses stable ranking when its legacy intermediates overflow or underflow, correcting
extreme-input order dependence while preserving ordinary output and first-entry ties.

Sheets retain stored-position derivative normals where they lie in each incident
face's outward hemisphere. Conflicting corners receive coincident vertices with
that triangle's normal; no resampling or topology inference from separate axes is
used. Base work is bounded before sampling, and expanded output is bounded before
allocation. Consumers must use the returned indices rather than infer grid connectivity.
Heightfields retain their shared grid layout instead of duplicating corners. After
sampling and indexing, stored faces are checked against each shared normal. A
normal outside any incident face's outward hemisphere falls back to exact up;
positive face-Y winding guarantees it is outward for all incident triangles.
Valid central-difference normal bytes and positions/indices remain unchanged.

Optional cell selection evaluates a boolean callback once per cell in row-major
order before sampling heights. It changes only emitted connectivity, leaving
projection, collision and layout policy with the consumer. Worst-case grid bounds
apply even to an empty selection; corner correction visits retained faces only.
Empty indexed sheets keep validated attributes and can pass through the generic
Three mesh adapter without relaxing the heightfield or UV-analysis contracts.

Parametric sheets map a unit grid to arbitrary finite `Vec3` positions.
Their default grid normals derive from the full sampled grid; optional
area-weighted normals accumulate retained indexed faces in Float64.
Optional authored normals are kept as supplied after normalization and reject
conflicts with emitted faces. A caller-supplied `insideAt` point orients
generated normals but does not establish occupancy or collision semantics.
Cell and vertex masks select connectivity before geometry sampling, while
the sampled attributes remain in the output. Closed columns share stored
position/normal data across distinct seam vertices; UVs and vertex selection
can differ at the endpoints. A `sourceVertex` array maps repaired corners
back to original grid samples so consumers can propagate their own
attributes without assuming a fixed index layout.

Revolved section surfaces sample separate X widths and positive/negative Z
depths along Y. They support open or closed angular domains, local section
centers, a polar superellipse power and explicit radial/axial offsets.
Normals are oriented from each section's radial frame; no solid or hollow
volume is inferred. The builder omits analytically collapsed pole faces,
rejects inconsistent meridian orientation and Float32 face collapse, and
repairs individual corners when a shared normal would face behind a stored
triangle. Its interleaved Float64 `parameters` preserve normalized row
position and wrapped angle independently of the chosen UV mode.

Both new builders check grid work before invoking callbacks and bound output
to one million vertices and six million indices, including any corner
repairs. The original `createSheetMesh` and `createRevolvedMesh` remain
separate constructors with their existing layout and cap policies.

## Data ownership

The library returns plain values and typed arrays. Consumers own:

- image-file encoding and renderer integration for surface bakes;
- material selection and shader assembly;
- world placement, streaming, persistence, and lifecycle;
- geometry deformation and rendering policy;
- camera, input, physics, audio, UI, and game state.

This keeps the library portable across renderers and prevents assumptions about a host
application from becoming part of its public API.

Surface composition shares color and scalar alpha weights. Wear provides correlated
coordinate fields without selecting materials. UV analysis selects an admissible atlas
or triplanar sampling policy without owning scene objects. Allocation and raster-work
bounds reject oversized requests before output buffers are created. UV overlap analysis
uses deterministic two-axis bounding-box candidates and the existing exact-sign
triangle predicate; broadphase acceleration does not change overlap semantics.
UV atlas coverage defaults to pixel centres. Optional area coverage clips triangles
in texel-local coordinates while carrying barycentric weights, then samples surface
centroids and accumulates unquantized alpha-premultiplied linear channels. This
preserves small valid charts without weakening geometric validation. Finite texel
footprints may mix disjoint islands; consumers choose resolution and coverage policy.
The Three adapter copies texture bytes, expands scalar texels to linear grayscale RGBA for WebGL1
compatibility, views mesh arrays, and exposes explicit texture disposal; it does
not dispose caller materials. The gallery is a consumer application, separate from
library imports, and owns its render loop and controls.

Wear fields retain at most one coordinate sample per instance, with independent
returned objects and validation on every call. This avoids duplicate field work
within layered sampling without introducing global state or call-order dependence.
See [performance guidance](PERFORMANCE.md) for measurement semantics and limits.

## Scalar relief model

`surface-fields` pairs a CPU oracle with a GLSL ES 3 chunk. It samples a clamped C1
cubic-Hermite profile, carries its analytic derivative through a caller-supplied
coordinate gradient, and derives a local frame from caller-supplied surface
differentials. The uniform packer and shader evaluator share the eight-knot bound.

The local frame uses:

```text
N0 = normalize(cross(dP/du, dP/dv))
Tu = dP/du + N0 * dH/du
Tv = dP/dv + N0 * dH/dv
N  = normalize(cross(Tu, Tv))
```

This is first-order relief shading. It intentionally omits the curvature term from the
derivative of a physically offset curved surface. Consumers that alter curved geometry
need a curvature-aware differential implementation of their own.

## Intentional limits

The package currently provides the APIs documented in [API.md](API.md). It does not
claim mesh extraction, runtime world management, scene composition, asset-placement
policy, texture-file encoding, skinning, collision/occupancy or general-purpose
material systems. New capability
belongs in the smallest renderer-neutral layer that can express it; adapters should
only translate established data into their ecosystem.
