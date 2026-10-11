# Architecture

`strata-kit` preserves a data-first content pipeline:

```text
seed -> noise/SDF -> terrain or surface data -> CPU bake -> optional Three.js -> optional R3F
```

The root, noise, SDF, terrain, materials and shader subpaths are Node-runnable. They never import Three.js or React. `./three` receives precomputed `HeightfieldMesh` data and creates a Three geometry only when a consumer imports that subpath. `./r3f` renders that explicit geometry and does not create game state or a global render loop.

The package deliberately excludes game lifecycle, input, state, persistence, audio, physics, animation, inventory, UI, camera and renderer-framework wrappers. Those concerns have separate owners or need an owner decision before they can be republished.
