# strata-kit

Seeded procedural terrain, surfaces and materials, baked. The root package is pure TypeScript. Three.js and React Three Fiber are optional subpaths.

```ts
import { bakeSurface, createSeededTerrainField, createSurfacePlan } from 'strata-kit';

const terrain = createSeededTerrainField({
  seed: 'coast-01',
  biomes: [{ type: 'mountain', center: [0, 0], radius: 80 }],
});
const mesh = terrain.createHeightfield({ width: 64, depth: 64, cellSize: 2 });
const surface = bakeSurface(createSurfacePlan({ seed: 'paint-01' }), { width: 256, height: 256 });
```

Use `strata-kit/three` for a Three.js `BufferGeometry`, and `strata-kit/r3f` for the opt-in heightfield component. `strata-kit/noise`, `/sdf`, `/terrain`, `/materials`, and `/shaders` have no renderer or React dependency.
