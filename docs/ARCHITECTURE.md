# Architecture

`strata-kit` preserves a data-first content pipeline:

```text
seed -> noise/SDF -> terrain or surface data -> CPU bake -> optional Three.js -> optional R3F
```

The root, noise, SDF, terrain, materials and shader subpaths are Node-runnable. They never import Three.js or React. `./three` receives precomputed `HeightfieldMesh` data and creates a Three geometry only when a consumer imports that subpath. `./r3f` renders that explicit geometry and does not create game state or a global render loop.

The package deliberately excludes game lifecycle, input, state, persistence, audio, physics, animation, inventory, UI, camera and renderer-framework wrappers. Those concerns have separate owners or need an owner decision before they can be republished.

## Analytic scalar relief

`surface-fields` is a pure CPU/GLSL pair for a caller-owned scalar coordinate. It evaluates a clamped C1 cubic-Hermite profile, returns the scalar height and analytic derivative, and applies the chain rule only after the caller supplies the projection gradient. A caller then supplies the surface Jacobian (`dP/du`, `dP/dv`) in one explicitly chosen evaluation space. The relief frame is formed from:

```text
N0 = normalize(cross(dP/du, dP/dv))
Tu = dP/du + dH/du * N0
Tv = dP/dv + dH/dv * N0
N  = normalize(cross(Tu, Tv))
```

The CPU and GLSL implementations use the same bounded eight-knot calculation. The module does not inspect textures, read an atlas, select a coordinate projection, apply a skeleton, or compose normal maps. Consumers retain those operations and may use the returned orthonormal frame with their established normal-map logic.

A rest-space caller may pass rest-space differentials. A world-space caller passes world-space differentials. A skinned or non-affinely deformed caller supplies a local posed Jacobian; transforming a normal with one global normal matrix is insufficient for that case.
