# Generated-content compatibility

Store the package version alongside the inputs used to generate durable content.
Determinism means equal inputs to the same implementation produce equal results;
a seed alone does not identify a complete recipe or guarantee identical content
after an upgrade.

## Inputs and normalized plans

`Seed` accepts strings or finite numbers. `seedToUint32` hashes the string
representation of either input; a numeric key is still hashed. Keep the original
seed when reconstructing terrain or wear options. Do not substitute a normalized
key for the original seed and expect the same field.

`createSurfacePlan` produces a normalized `SurfacePlan`. Its numeric seed, scale
and base color can be stored as JSON and supplied directly to `sampleSurface`,
`createSurfaceSampler` or `bakeSurface`. Do not pass that normalized plan through
`createSurfacePlan` again: that function accepts construction inputs and hashes
the seed again. Keep the package version with a stored plan.

## What a bake manifest preserves

`createSurfaceBakeManifest` describes supplied plan parameters, image dimensions
and channel layouts. It does not verify that an arbitrary sampler used those
parameters. It contains neither pixel bytes nor layer callbacks, masks, sampler
code, renderer settings or a complete material recipe.

For durable layered content, store the baked buffers and their layouts, or retain
your own versioned recipe with all sampler implementations and parameters. The
library cannot reconstruct opaque functions from JSON or a seed. JSON does not
preserve typed-array constructors or raw byte layout automatically; consumers own
buffer encoding and decoding.

## Geometry and numerical output

Mesh indices are local references into a generated mesh, not persistent object
identifiers. Changes to profiles, segmentation or cusp splitting (in swept, revolved,
or sheet meshes) can change vertex counts and index values. Persist complete mesh buffers when exact topology matters.
Normals are computed from stored coordinates; Float32 quantization can reject
otherwise distinct input points or collapse a requested face.

CPU and GPU implementations, renderers and image encoders have distinct numerical
and color pipelines. CPU/GLSL agreement checks use documented tolerances; they do
not promise identical rendered pixels across devices. Compare output hashes only
on the execution path and representation for which they were recorded.

## Upgrades

Seed hashing, random draw order, noise arithmetic, layer composition, mesh topology
and packed channel conventions are compatibility-sensitive. Changes require
focused regression evidence and an explicit description of generated-output impact.
Retain old manifests and buffers rather than rewriting them during an upgrade.
Before adopting a new release, compare representative saved inputs and outputs in
your consumer, including its rendering and encoding policy.
