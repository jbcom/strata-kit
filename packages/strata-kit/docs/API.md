# API

| Import | Purpose | Runtime dependency |
| --- | --- | --- |
| `strata-kit` | Seeded noise, SDF primitives, terrain fields, surface plans and CPU bakes | none |
| `strata-kit/noise` | Seeded random and value/fractal noise | none |
| `strata-kit/sdf` | Data-only SDF primitives and operations | none |
| `strata-kit/terrain` | Terrain sampling, heightfield data and deterministic scatter points | none |
| `strata-kit/materials` | Scale-agnostic surface samples and deterministic RGBA/roughness/bump bakes | none |
| `strata-kit/shaders` | Per-material GLSL noise chunk | none |
| `strata-kit/three` | `HeightfieldMesh` to `THREE.BufferGeometry` | `three` peer |
| `strata-kit/r3f` | `StrataHeightfield` component for a precomputed mesh | React, Three and R3F peers |

Every field, terrain, scatter or surface call takes an explicit seed. No public pure entrypoint reads global randomness, creates a renderer, or owns a frame loop.
