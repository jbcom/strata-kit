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

## Analytic scalar relief

`strata-kit/surface-fields` provides a continuous, texture-free scalar profile and a matching GLSL ES 3 chunk. It has no knowledge of UV layout, body shape, texture atlases, skinning, or normal-map policy.

```ts
import {
  createCubicHermiteProfile,
  deriveReliefFrame,
  projectScalarProfileDerivative,
  sampleCubicHermiteProfile,
} from 'strata-kit/surface-fields';

const profile = createCubicHermiteProfile([
  { coordinate: 0, value: 0, derivative: 0 },
  { coordinate: 0.5, value: 0.012, derivative: 0.03 },
  { coordinate: 1, value: 0, derivative: 0 },
]);
const scalar = sampleCubicHermiteProfile(profile, callerCoordinate);
const relief = projectScalarProfileDerivative(scalar, callerCoordinateGradient);
const frame = deriveReliefFrame(callerSurfaceJacobian, relief.derivatives);
```

`value` is in the caller's height unit, such as metres. `derivative` is height per `coordinate` unit. `callerCoordinateGradient` supplies `dq/du` and `dq/dv`; `callerSurfaceJacobian` supplies `dP/du` and `dP/dv` in the same evaluation space as the desired result. The normal is formed from the displaced tangent plane, not a fixed normal axis.

For a rigid affine transform, transform the two position differentials with the position transform before calling the function. For skinned or other non-affine deformation, pass the local posed surface Jacobian; a single global normal matrix cannot describe that deformation. The returned frame is intended for the consumer's existing normal-map composition. This package does not replace or retune it.

The GLSL evaluator has an explicit eight-knot ceiling, so its profile work remains bounded per fragment. `toCubicHermiteProfileUniforms` creates the matching fixed-width uniform arrays.

## Public package path

The rebranded public package is `strata-kit`; the former `@strata-game-library/shaders` package is not its install path. Before release, extract the bounded package source, license, tests, and public documentation into the public `jbcom/strata-kit` repository, preserve the unscoped package name, and validate a packed artifact. A game consumes a released version through the registry:

```sh
pnpm add strata-kit@<released-version>
```

Then it imports `strata-kit/surface-fields` from that installed package. A workspace link, a donor-checkout path, and a local tarball are useful development checks but do not establish the game/package boundary.
