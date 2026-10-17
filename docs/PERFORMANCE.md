# Performance and workload limits

Strata Procedural uses bounded, synchronous CPU operations. Measure a workload in
the same runtime, hardware class, and renderer context where it will be used; the
library does not publish universal timing, allocation, frame-rate, or GPU-memory
claims.

## Current validated size limits

These are request-validation limits, not recommendations or performance targets.
Inputs below a limit can still be expensive depending on geometry, surface recipe,
and host runtime.
Caller-supplied samplers determine their own cost; request limits do not impose a
deadline on arbitrary callback code.

| API | Validated limit |
| --- | --- |
| `fractalNoise` | 1 through 32 octaves |
| `bakeSurface` | 4,194,304 pixels |
| Portable mesh builders | 1,000,000 vertices and 6,000,000 index entries |
| `snapshotThreeStaticMeshes` | 100,000 hierarchy nodes; 1,000,000 aggregate vertices; 6,000,000 aggregate index entries |
| Terrain heightfield | 1,000,000 vertices and 6,000,000 index entries |
| Terrain scatter | 1,000,000 points |
| UV layout analysis | 1,000,000 triangles; diagnostic grid at most 2048 per axis and 4,194,304 cells |
| UV atlas bake | 4,194,304 pixels, 64 padding rings, and 67,108,864 combined raster/padding work units |
| UV overlap broad phase | 8,388,608 positive-width/height 2D bounding-box candidate pairs |

Float32 output coordinates must remain finite and distinguishable after quantization.
UV atlas baking also rejects outside, degenerate, overlapping, or zero-texel charts.
Default pixel-centre coverage requires a centre in every triangle. Optional area
coverage requires positive-area texel intersections and preserves the same geometric
and work limits. Area coverage uses 64 additional bytes per output pixel for eight
Float64 accumulators: 256 MiB at the pixel cap. With RGBA, scalar maps, written flags
and optional padding workspace, array capacity is at most approximately 304 MiB,
excluding source meshes, UV analysis workspace, runtime overhead and garbage collection.
This is capacity accounting, not a measured peak-memory claim. Fixed clipping buffers
are reused; centroid sampling is more work per candidate than centre sampling.

UV overlap candidate selection sweeps U with a balanced active V-interval tree;
it avoids scanning every U-overlapping pair when V ranges are disjoint. The exact
Float32 triangle-intersection predicate and area-weighted result are unchanged.
Candidate-budget exhaustion does not establish that triangles actually overlap.
Its typed-array workspace uses approximately 43 bytes per input triangle plus
constant sentinel storage, excluding mesh inputs, existing area arrays, sorting
internals and runtime overhead. This is buffer capacity, not measured peak memory.

Static snapshots return owned copies. At the aggregate limits, positions and
normals occupy 24 MB, optional UVs add 8 MB, and Uint32 indices add up to 24 MB
(decimal bytes). These output capacities exclude source objects and JavaScript
overhead; they are neither process-peak nor GPU-memory measurements. Hierarchy
limits are validation bounds, not supported-performance targets.

## Terrain heightfield sampling

`createHeightfield` has an operation-local cache for exact `(x, z)` height requests
made while constructing central-difference normals. It stores at most 65,536 live
samples across at most three actual Z-coordinate rows and keeps `-0` separate from
`0`. Once full, uncached requests sample the field directly. The cache is discarded
when the call returns; it does not change the output buffers or establish a timing or
allocation guarantee for a workload.

## Reproducible CPU benchmarking

`scripts/benchmark-procedural.mjs` is a maintainer tool. Run it against a freshly
built artifact in an isolated checkout:

```sh
node scripts/benchmark-procedural.mjs \
  --revision <source-revision> \
  --module-root <built-artifact-directory> \
  --output <ignored-report>.json
```

The script relaunches itself with exposed GC, performs a warm-up, and records
per-iteration timing, post-operation process-memory deltas, deterministic output
checksums, toolchain metadata, and a content hash manifest for the supplied built
artifact. A checksum mismatch fails the measurement instead of producing a successful
report. Use `--workloads name-a,name-b` to restrict a run to declared workloads.

The recorded memory values are post-operation process-memory deltas after forced GC.
They are not allocation totals, process peaks, retained heap sizes, GPU-memory
measurements, transfer sizes, or browser frame-time evidence. Timing summaries use
nearest-rank quantiles; with seven samples, the reported P95 is the largest sample.

The built-in representative fixtures exercise a layered surface bake, UV diagnostics
and atlas baking, revolve/sweep/sheet mesh generation, blended terrain heightfields,
and terrain scatter. Their dimensions are fixed fixtures for regression comparison,
not supported-performance guarantees. Keep reports in ignored maintainer state and
compare only runs with matching workload settings and artifact provenance.
