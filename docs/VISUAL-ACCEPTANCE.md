# Procedural visual acceptance

The source gallery has a muted Playwright gate, run with `pnpm test:visual` after
installing the maintainer toolchain. It builds the current source and records source,
built-module and capture hashes with its screenshots. Browser execution must remain
silent. The receipt identifies headless diagnostics separately from headed proof.

Compiler inputs are recorded before and after building. Embedded source-map text
must match those inputs, and artifact hashes must stay fixed through capture. The
server freezes the HTML, gallery modules and dependency bytes it serves for that
execution. Changes to build or capture inputs invalidate the receipt.

CI runs the same gate headlessly with SwiftShader and retains diagnostic captures
and receipts. These software-rendered CI results supplement hardware captures;
they do not count as Metal or headed acceptance.

## Material defects and restoration

The fixed material fixture uses an independent reconstruction of the normal layer
recipe as its CPU oracle. Every RGBA8 color and R8 roughness, bump and metalness
byte must match that recipe. The fixture must contain nonzero oxide and stronger
lower-half directional wear before comparing candidate maps.

The gate injects inverted gravity and an omitted oxide layer. Both must fail the
same normal-material predicate and change the actual canvas readback. These are
deliberate rejected diagnostics, not alternative accepted recipes. Failures report
one channel and byte index; they do not format complete image buffers.

Restoration must recover every original bake byte and the exact encoded canvas
readback with the seed, mode, scale, viewport and camera fixed. This comparison is
within one browser execution; it is not a promise of identical pixels across devices.

## Geometry and UV diagnostics

Revolved, swept and sheet fixtures validate finite stored positions, unit normals,
normalized UVs and index bounds. Tagged scene geometry must retain each expected
mesh's counts and invariants. A separate neutral, low-angle radius-cusp fixture
checks positive face/vertex-normal alignment on both the numeric mesh and its
Three geometry. UV diagnostics reconstruct the projected atlas and compare every
color/scalar byte. Actual scene-bound textures must match the documented reversed
row order, channel packing, color spaces and dimensions. Missing or swapped bindings,
blank atlases and incorrect row orientation are rejected.

Screenshots cover the standard geometry, atlas, desktop/mobile material routes and
physical scales, as well as the injected defects and restored scene. The gate checks
runtime errors, context health, actual physical bounds and shader assembly.

## What this gate proves

This is a reproducible diagnostic for the specified layer defects, coherent bake
bytes, data-to-scene linkage and restoration. The oracle uses public procedural APIs;
their numerical behavior also needs independent unit and compatibility fixtures.
The gate is not a complete GPU shader oracle, a cross-device image baseline, a
reference-output comparison, a judgment of artistic quality or gameplay acceptance.
Inspect current screenshots directly before accepting changed rendered behavior.
Interactive controls, resource lifetime and actual consumers require separate proof.
