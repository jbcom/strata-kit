# Procedural technique provenance

Strata Kit is MIT-licensed. This document records candidate donor techniques;
listing a source here does not claim that it has already been extracted.

The owner requested OSS extraction of their reusable procedural code on
2026-10-13. Both donor projects are currently marked `UNLICENSED`. Surveyed
candidate file history credits Jon Bogaty. Any extracted owner-authored code
must be explicitly recorded as adapted and released under this repository's
MIT license in its landing commit. Check authorship again at that exact donor
revision. Do not import third-party assets, audio, models, textures, or fan-game
identity on the basis of this authorization.

| Technique | Donor-relative path | Candidate revisions | Status |
| --- | --- | --- | --- |
| Sampler contract | will-it-blow: `src/render/surfaces/types.ts` | `00e19d13` | Surveyed; not extracted |
| Coherent physical wear | will-it-blow: `src/render/surfaces/wear.ts` | `00e19d13` | Surveyed; not extracted |
| Deterministic field noise | will-it-blow: `src/render/noise.ts` | `00e19d13` | Surveyed; not extracted |
| One-field material bake | will-it-blow: `src/render/surfaceBake.ts` | `00e19d13` | Surveyed; remove Three/Canvas dependencies |
| UV quality and triplanar atlas | will-it-blow: `src/render/modelSurface.ts` | `00e19d13` | Later design |
| Per-material reskin | will-it-blow: `src/render/modelMaterial.ts` | `00e19d13` | Later design; shader anchors need validation |
| Mesh accumulation | curse-of-the-mummy: `src/game/mummy/meshBuilder.ts` | `72f0be6a` | Later design; remove renderer/game types |
| Revolve, sweep, sheet | curse-of-the-mummy: `src/game/figures/surface.ts` | `72f0be6a` | Later design; neutral geometry only |
| Anatomical sweep technique | curse-of-the-mummy: `src/game/mummy/tube.ts` | `72f0be6a` | Reference only; body/skinning semantics excluded |

Keep game palettes and recipes with consumers. Keep body fit, anatomy, skeleton
processing, animation, and wardrobe ownership outside Strata Kit. Source
comparison captures must use permitted neutral fixtures and remain silent.

Survey checkout revisions: will-it-blow
`00e19d13d005a4a64df0e289d724f90f5eda5c36`; curse-of-the-mummy
`72f0be6a1354185bf3df3842db637fa6e06befae`. These identify the survey snapshots,
not the eventual extraction commit. Recheck dirty source and exact file blobs
when implementation starts.

The existing 0.1.0 field/terrain/bake and analytic relief implementations are
already part of this MIT repository. This survey does not retroactively claim
that they match either donor's noise, maps, or rendering.
