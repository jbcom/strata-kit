# API

| Import | Purpose | Runtime dependency |
| --- | --- | --- |
| `strata-procedural` | Seeded noise, SDF primitives, terrain fields, surface plans and CPU bakes | none |
| `strata-procedural/noise` | Seeded random and value/fractal noise | none |
| `strata-procedural/sdf` | Data-only SDF primitives and operations | none |
| `strata-procedural/terrain` | Terrain sampling, heightfield data and deterministic scatter points | none |
| `strata-procedural/materials` | Scale-agnostic surface samples and deterministic RGBA/roughness/bump bakes | none |
| `strata-procedural/shaders` | Per-material GLSL noise chunk | none |
| `strata-procedural/surface-fields` | Cubic-Hermite scalar profiles, analytic derivatives, local first-order relief frames, and GLSL ES 3 evaluator | none |
| `strata-procedural/three` | `HeightfieldMesh` to `THREE.BufferGeometry` | `three` peer |
| `strata-procedural/r3f` | `StrataHeightfield` component for a precomputed mesh | React, Three and R3F peers |

Every field, terrain, scatter or surface call takes an explicit seed. No public pure entrypoint reads global randomness, creates a renderer, or owns a frame loop.

`surface-fields` accepts a caller-owned coordinate gradient and surface differentials. Its profile values use the caller's height unit and its profile derivatives use height per coordinate unit. `deriveReliefFrame` is a local first-order shading frame; it does not claim the exact normal of a curved, physically displaced surface.
