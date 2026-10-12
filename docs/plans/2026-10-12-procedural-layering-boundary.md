---
title: Procedural layering ownership boundary
updated: 2026-10-12
status: approved-follow-on
domain: architecture
---

# Procedural layering ownership boundary

## Decision

`strata-kit` owns model-neutral procedural construction and layering. It may
build or bake reusable material and geometric layers such as rust over metal,
wear fields, world/object-scale surface samplers, and bespoke procedural
techniques that a consumer can apply to a supplied surface.

`humanoid-kit` owns MakeHuman manipulation through dolls, anatomically correct
humans, furry reskinning, animation, fit, interactions, and every body-bound
integration. It remains the authority for morphology, anatomy, UV/body detail,
binding, deformation, wardrobe fit, and visual acceptance.

This is an ownership decision, not an expansion of the initial `strata-kit`
publish surface. The first release remains the proven seeded terrain, surface,
bake, export, optional Three, and optional R3F API.

## Public boundary for a later layering workbench

The follow-on workbench may accept only neutral inputs such as positions,
normals, indices, optional UVs, material identifiers, and an explicit seed or
injected RNG. It returns data, bake plans, or per-material shader inputs. Any
renderer adapter stays optional and cannot own a frame loop or global state.

The workbench may include:

- layered material masks, corrosion, paint wear, dirt, and other physical
  surface effects;
- deterministic texture/attribute bakes and their provenance manifests;
- neutral shell, sweep, loft, and surface-layer construction when its inputs
  and output do not encode a body class; and
- scoped GLSL/WebGL2 material chunks used through the existing
  `./materials`, `./shaders`, `./three`, and `./r3f` boundaries.

It may not include human/furry anatomy, age logic, naked-body coverage,
MakeHuman targets, skeleton semantics, skinning policy, body fit, body contact,
wardrobe attachment, animation, interaction behavior, or game-specific names,
content, and assets.

## Delivery rules

1. Start only after the initial release’s rename, metadata, fresh packed
   artifact review, and publish gates are complete.
2. Reuse the canonical seeded surface, bake, shader, and optional adapter APIs;
   do not create a parallel material system.
3. Compare each proposed consumer technique with existing `strata-kit` exports
   before moving it. Preserve source/license provenance for every absorbed
   implementation and fixture.
4. Keep construction APIs public-neutral. A Kit integration belongs in
   `humanoid-kit` and consumes the published package only after a separate fit
   and visual-review contract.
5. Require deterministic tests, packed-consumer imports, and material/geometry
   visual evidence where a change affects renderer output. The package’s
   numerical metrics do not replace visual acceptance.

## Initial workbench backlog

| Candidate | Proposed home | Gate |
| --- | --- | --- |
| Rust-over-metal and unified wear fields | `./materials` | Seeded sample and bake fixtures; no body vocabulary |
| Consumer-specific procedural shader chunks | `./shaders` | Scoped material API; no global shader patching |
| Neutral surface construction/layers | new `./layers` only if needed | Input/output schema, provenance, no anatomy or fit logic |
| Three/R3F presentation helpers | existing `./three` and `./r3f` | Optional peers and adapter lifecycle tests |
| Body fit, deformation, wardrobe and animation | `humanoid-kit` | Separate Kit-owned body and visual evidence |

## Consequences

Games may consume the published package for generic procedural effects, but
they must not turn a game-specific shell or wardrobe implementation into a
substitute for missing Kit capability. `strata-kit` remains a procedural
content library; it does not become a character framework.
