# Architecture

Strata Kit is a data-first procedural library, not a game framework. Its current
pipeline composes deterministic numeric fields into portable data that a consumer can
render, bake, serialize, or use to drive its own systems.

```text
explicit seed
  -> noise and SDF operations
  -> terrain fields, surface plans, or scalar profiles
  -> typed-array heightfields and surface-map buffers
  -> optional Three.js geometry or React Three Fiber view
```

## Module boundaries

| Layer | Modules | Responsibility |
| --- | --- | --- |
| Numeric primitives | `noise`, `sdf` | Explicit seeded randomness, value noise, and finite SDF composition |
| Procedural data | `terrain`, `materials`, `surface-fields`, `shaders` | Height samples, mesh buffers, surface-map bytes, scalar profiles, and GLSL snippets |
| Adapters | `three`, `r3f` | Convert a supplied heightfield into a Three geometry or view |

The root package re-exports only the procedural layers. `three` and `r3f` are separate
package exports with optional peer dependencies, so importing the core does not load a
renderer or React.

## Determinism and validation

The built-in stochastic generators begin from a string or finite numeric `Seed`.
`fractalNoise` accepts a caller-supplied noise function: its determinism depends
on that function being deterministic and independent of call order.
Fields capture normalized inputs before use, so later mutation of the caller's input
does not alter an already-created terrain field or surface plan. The public seeded
field, surface-plan, SDF, and scalar-profile APIs validate documented finite inputs
before they enter generated output.

Determinism applies to a fixed release and equal inputs. A change to seed hashing,
random draw order, noise arithmetic, or a documented output layout changes generated
content and must receive compatibility review plus focused regression tests.

## Data ownership

The library returns plain values and typed arrays. Consumers own:

- image-file encoding and texture upload for surface bakes;
- material selection and shader assembly;
- world placement, streaming, persistence, and lifecycle;
- geometry deformation and rendering policy;
- camera, input, physics, audio, UI, and game state.

This keeps the library portable across renderers and prevents assumptions about a host
application from becoming part of its public API.

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
policy, texture-file encoding, or general-purpose material systems. New capability
belongs in the smallest renderer-neutral layer that can express it; adapters should
only translate established data into their ecosystem.
