# strata-kit

`strata-kit` provides deterministic procedural terrain, surface bakes, signed-distance primitives, and analytic scalar relief. The root package is pure TypeScript. Three.js and React Three Fiber are opt-in subpaths.

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

`value` is in the caller's height unit, such as metres. `derivative` is height per `coordinate` unit. `callerCoordinateGradient` supplies `dq/du` and `dq/dv`; `callerSurfaceJacobian` supplies `dP/du` and `dP/dv` in the same evaluation space as the desired result. The normal is formed from the local first-order relief tangent plane, not a fixed normal axis.

For a rigid affine transform, transform the two position differentials with the position transform before calling the function. For skinned or other non-affine deformation, pass the local posed surface Jacobian; a single global normal matrix cannot describe that deformation. The returned frame is intended for the consumer's existing normal-map composition. This package does not replace or retune it.

This is a local shading approximation: it evaluates `dP + N * dH`. It intentionally omits `H * dN`, so it is not the exact normal of a curved surface physically offset as `P + HN`. A consumer that changes curved geometry needs a curvature-aware differential path of its own.

The GLSL evaluator has an explicit eight-knot ceiling, so its profile work remains bounded per fragment. `toCubicHermiteProfileUniforms` creates the matching fixed-width uniform arrays.

## Install

Install a released package from npm:

```sh
pnpm add strata-kit@<released-version>
```

Then import `strata-kit/surface-fields` or another documented public subpath. The package publishes ESM entrypoints. `three`, `react`, and `@react-three/fiber` are optional peers and are loaded only by `strata-kit/three` or `strata-kit/r3f`.

## Development

Use Node 22 or newer and the pnpm version pinned in `package.json`:

```sh
corepack enable
pnpm install
pnpm verify
```

`pnpm verify` lints, type-checks, runs the renderer-free suite, builds every public entrypoint, and installs the packed artifact into clean pure and adapter consumers. The GPU evaluator is a separate hardware proof run through the render pool; see `docs/RELEASE.md`.
