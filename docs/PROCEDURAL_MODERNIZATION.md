# Strata Kit procedural modernization

Date: 2026-10-13. Status: design ready for owner review; implementation of new
public APIs has not started. This replaces the game-framework roadmap.

## Purpose and current source of truth

Strata Kit is a TypeScript library for deterministic procedural construction
and layering in 3D space: fields, surfaces, materials, and geometry. Games
choose their art direction and apply these building blocks to their content.
The library does not define a game, character, scene lifecycle, or renderer loop.

The canonical repository is `jbcom/strata-kit`. The npm distribution is
`strata-procedural`: npm rejected `strata-kit` for name similarity during the
first release. Version 0.1.0 is already published. Do not restart publication
under the rejected name or republish an existing version.

The old `strata-game-library` monorepo has a separate history. Preserve it as
historical source, including unfinished work; do not reset or delete it to
make the new checkout appear migrated. The new package is the development
line. Its existing analytic relief API stays intact.

## Choice of approach

Recommended: deepen the existing data-first spine one tested subsystem at a
time, beginning with composable surface samplers and unified wear fields.
Use the mature donor techniques as reference and preserve source provenance.
Keep each renderer integration optional.

Rejected: rename the old framework in place. That retains unrelated lifecycle,
input, audio, persistence, and character concerns and competes with existing
packages. Also rejected: publish separate wear, bake, and noise packages.
They share a seed, coordinate, sample, and bake contract and would duplicate it.

## Existing guarantees to preserve

- Node 22 and newer; ESM package; no renderer dependencies on pure subpaths.
- Explicit seeds or injected randomness. No ambient `Math.random`, global
  caches, global shader patches, hidden frame loop, or machine paths.
- Existing `SurfacePlan`, `sampleSurface`, `bakeSurface`, manifests, terrain,
  SDF, and analytic relief remain compatible. Existing seed fixtures retain
  their output; new algorithms receive their own versioned identities.
- Three.js and React Three Fiber remain opt-in peers.
- Game-specific palettes, seeds, names, assets, recipes, and interactions stay
  with consumers. Anatomy, skeleton semantics, fit, animation, and wardrobe
  integration remain with their existing packages.
- Maintainer tools come from `mise.toml` using latest stable Node and pnpm.
  No root `packageManager`, pnpm engine, `.nvmrc`, or duplicated workflow pins.
  The Node consumer floor is a separate compatibility promise.

## First subsystem: composable surfaces and physical wear

Extend `./materials`, not a second material system. The fixed recipe becomes
one input to a general sampler/bake pipeline. Add the following conceptual
public contract without removing existing calls:

```ts
interface SurfaceSampler {
  sample(u: number, v: number): SurfaceSample;
}

interface WearFieldOptions {
  seed: Seed;
  scale: number;
  amount: number;
  edgeBias: number;
  bottomBias: number;
}

interface WearSample {
  chip: number;
  steel: number;
  oxide: number;
  drip: number;
}

// Names are proposed, not shipped exports.
function createSurfaceSampler(plan: SurfacePlan): SurfaceSampler;
function createWearField(options: WearFieldOptions): {
  sample(u: number, v: number): WearSample;
};
function bakeSurface(
  input: SurfacePlan | SurfaceSampler,
  options: { width: number; height: number },
): SurfaceBake;
```

`SurfaceSample` keeps the existing RGBA byte-valued color, normalized roughness,
and signed bump convention. Sampler u/v inputs are finite, dimensionless domain
coordinates: [0,1] spans the supplied surface, and baking samples pixel centers
in that unit square. They are not metre or world-position arguments. Consumers
explicitly normalize physical/world coordinates before sampling, for example
`u = x / surfaceWidth` and `v = y / surfaceHeight`, with an origin and downward
axis chosen by the consumer. The library never infers a model's units or changes
object-to-world transforms.

Legacy `SurfacePlan.scale` remains its dimensionless multiplier for the existing
grain/wear frequencies of 24 and 5. New `WearFieldOptions.scale` is likewise a
dimensionless multiplier of documented base frequencies (broad 5, mid 26, fine
70), not an absolute cycles-per-metre promise. Only noise coordinates receive
this multiplier: edge/bottom masks stay in the normalized domain. For directional
wear, positive v runs downward. Finite inputs outside [0,1] extend the noise;
edge/bottom masks use independently clamped u/v, so scaling or out-of-domain
noise does not reverse the gravity or edge convention.

Use the donor's coherent broad/mid/fine field and nested chip/exposed-metal/
oxide progression rather than independent random maps. All masks remain finite
in [0,1], with `oxide <= steel <= chip`. Amount is a new normalized [0,1]
coverage multiplier: zero produces no wear, one preserves the base field. It is
deliberately distinct from the donor's signed threshold-offset `amount`; this
conversion must be explicit in donor comparison fixtures. A caller
uses these masks to choose its own substrate/coating colors and material
properties; no game palette or automatic room appearance enters the kit.

Compile the noise field once per sampler, not once per texel. Do not add an
opaque global cache. Bakes return tightly packed buffers, never CanvasTexture,
DOM objects, or GPU resources. Validate sample channels before packing; do not
silently convert NaN, infinity, or out-of-range values into valid-looking bytes.
Cap or reject invalid dimensions before allocation, including unsafe products.

The existing manifest describes the fixed recipe. Add a distinct manifest
function for general samplers, taking caller-supplied serializable recipe
identity, algorithm version, seed, coordinate convention, parameters, and bake
dimensions. A function cannot be serialized or inferred from its pixels. A
manifest identifies the recipe, not an unprovable guarantee of source equality.
Keep it out of the first implementation if the recipe schema cannot be made
precise; do not overload the existing manifest with false seed information.

### First delivery acceptance

1. Tests are written and observed failing before implementation. Preserve all
   current tests and old golden bytes.
2. Add fixed-seed wear fixtures, different-seed divergence, amount-zero and
   mask-order invariants, finite/range failures, edge/bottom orientation, and
   repeat sampling without consuming a mutable RNG stream.
3. Test caller samplers with recognizable pixel-center values and all map
   channels. Test invalid samples and unsafe dimensions before allocation.
4. `pnpm verify` passes, including packed consumers without React or Three and
   an explicit adapter consumer; pack contains API, architecture, and provenance.
5. Render a neutral panel and box from donor and kit implementations with the
   same coordinate/seed inputs. Inspect muted captures at two explicit scales;
   document intentional noise differences rather than weaken tolerances.
6. A deliberately inverted directional mask or omitted oxide must visibly
   fail the relevant check before restoring the correct implementation.
7. Do not claim visual acceptance from unit numbers, a browser launch, or only
   a WebGL readback. If the render pool is unavailable, track visual validation
   as pending and keep release gated.

## Later independently reviewable subsystems

### Model-neutral reskin planning

Adapt the mature UV diagnostics and UV/triplanar selection: degeneracy,
overlap, outside-domain coordinates, stretch, coverage, linear-light sampling,
atlas padding, and explicit per-part planning. Build on the sampler contract.
Pure planning outputs data. Three texture/material allocation belongs in the
existing adapter and must support explicit disposal. No game GLBs or palettes.
Patch only a caller's material. Fail loudly when expected shader anchors are
missing; never mutate global `ShaderChunk`. Require generic generated geometry
fixtures, shader compilation tests, and visual comparisons.

### Neutral revolve, sweep, sheet, and layer construction

Use the mummy game's mesh accumulation and surface construction techniques,
with a typed-array core and optional Three conversion. Inputs are profiles,
paths, resolution, normals, indices, material identifiers, and explicit fields.
Outputs are indexed geometry data. Include winding, degenerate-path rejection,
seams, caps, finite/unit normals, and index-width tests.

Do not port its anatomical Tube wholesale: paint/material classes, body parts,
bone weights, and local body semantics are intertwined. A generic sweep needs
a separate reviewed frame/transport and radius-field design before code. Only
introduce `./mesh` or `./layers` when that contract is proved; no placeholder
exports. Rendering must compare silhouette, seams, and highlights against the
source technique with neutral fixtures.

### Terrain and look

Audit discontinuous nearest-biome transitions, terrain normals, continuous
layer blending, seeded scatter constraints, and scale behavior before adding
LOD/streaming. LUT bakes, quality ladders, and render budgets are opt-in content
tools and may never take over the consumer's renderer. WebGL2/GLSL precedes any
TSL/WebGPU rewrite. CPU and shader noise currently differ; do not advertise
parity without dedicated tests and GPU evidence.

## Provenance and release

See `PROVENANCE.md` for donor paths, commits, authorship, and restrictions.
The owner's request authorizes publishing reusable owner-authored techniques;
it does not license unrelated third-party assets or fan-game content. Record
the exact implementation revision and transformation when extraction lands.

Open ready PRs, review actionable findings, and use normal merges. Automated CD
currently enforces `pnpm verify`, trusted-publishing readiness, matching version
tag, and duplicate-version preflight. It does not run a visual acceptance gate.
Before a release containing new rendering behavior, the release owner must also
review final-tip muted visual evidence and its source/artifact receipt; missing
evidence is a release blocker, not an automated PASS. Add an enforced visual
receipt gate as part of that rendering subsystem's delivery. After publication,
require a clean registry consumer before calling release/adoption proven.
An unreleased tarball is not registry adoption.
Games adopt the package from npm and remove only the duplicate capability they
actually replaced. Keep those consumer edits in their own owned checkouts.

## Delivery sequence

1. Reconcile the local checkout and GitHub descriptions; preserve old history.
2. Finish truthful current docs and restore the required maintainer toolchain.
3. Review this design, then write and review the sampler implementation plan.
4. Land the sampler/wear subsystem with deterministic and visual evidence.
5. Review and deliver reskin, then neutral mesh/layers, each as its own unit.
6. Publish through the established release gate and prove registry consumers.
