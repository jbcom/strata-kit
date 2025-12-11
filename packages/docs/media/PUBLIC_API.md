# Strata Public API Contract

**This document defines the stable, public API of @jbcom/strata.**

All APIs listed here are guaranteed to follow semantic versioning:
- **Major versions** (1.0.0 → 2.0.0): Breaking changes allowed
- **Minor versions** (1.0.0 → 1.1.0): New features, backward compatible
- **Patch versions** (1.0.0 → 1.0.1): Bug fixes only, backward compatible

## Package Exports

### Main Export (`@jbcom/strata`)

All public APIs are available from the main export:

```ts
import { 
  // Core algorithms
  generateInstanceData,
  createWaterMaterial,
  // Components
  Water,
  Character,
  // Presets
  createFurSystem,
  // Types
  FurOptions,
  CharacterState
} from '@jbcom/strata';
```

### Subpath Exports

For tree-shaking and explicit imports:

- `@jbcom/strata/core` - Pure TypeScript algorithms (no React)
- `@jbcom/strata/components` - React Three Fiber components
- `@jbcom/strata/presets` - Organized game primitives by layer
- `@jbcom/strata/shaders` - GLSL shader code and uniform factories
- `@jbcom/strata/utils` - Utility functions (texture loading, etc.)

## Core API (Pure TypeScript)

### SDF Functions

```ts
// Primitives
sdSphere(p: Vector3, center: Vector3, radius: number): number
sdBox(p: Vector3, center: Vector3, halfExtents: Vector3): number
sdPlane(p: Vector3, normal: Vector3, distance: number): number
sdCapsule(p: Vector3, a: Vector3, b: Vector3, radius: number): number
sdTorus(p: Vector3, center: Vector3, majorRadius: number, minorRadius: number): number
sdCone(p: Vector3, center: Vector3, angle: number, height: number): number
sdRock(p: Vector3, center: Vector3, baseRadius: number): number

// Operations
opUnion(d1: number, d2: number): number
opSubtraction(d1: number, d2: number): number
opIntersection(d1: number, d2: number): number
opSmoothUnion(d1: number, d2: number, k: number): number
opSmoothSubtraction(d1: number, d2: number, k: number): number
opSmoothIntersection(d1: number, d2: number, k: number): number

// Noise
noise3D(x: number, y: number, z: number): number
fbm(x: number, y: number, z: number, octaves?: number): number
warpedFbm(x: number, y: number, z: number, octaves?: number): number

// Utilities
calcNormal(p: Vector3, sdfFunc: (p: Vector3) => number, epsilon?: number): Vector3
getBiomeAt(x: number, z: number, biomes: BiomeData[]): BiomeData
getTerrainHeight(x: number, z: number, biomes: BiomeData[]): number
sdTerrain(p: Vector3, biomes: BiomeData[]): number
sdCaves(p: Vector3): number
```

### Marching Cubes

```ts
marchingCubes(
  sdf: (p: Vector3) => number,
  options: MarchingCubesOptions
): MarchingCubesResult

createGeometryFromMarchingCubes(result: MarchingCubesResult): BufferGeometry

generateTerrainChunk(
  sdf: (p: Vector3) => number,
  chunkPosition: Vector3,
  chunkSize: number,
  resolution: number
): TerrainChunk
```

### Instancing

```ts
generateInstanceData(
  count: number,
  areaSize: number,
  biomes: BiomeData[],
  heightFunction?: (x: number, z: number) => number,
  seed?: number
): InstanceData[]

createInstancedMesh(
  geometry: BufferGeometry,
  material: Material,
  instances: InstanceData[]
): InstancedMesh
```

### Water

```ts
createWaterMaterial(options?: WaterMaterialOptions): ShaderMaterial
createAdvancedWaterMaterial(options?: AdvancedWaterMaterialOptions): ShaderMaterial
createWaterGeometry(size: number, segments?: number): PlaneGeometry
```

### Ray Marching

```ts
createRaymarchingMaterial(options: RaymarchingMaterialOptions): ShaderMaterial
createRaymarchingGeometry(): PlaneGeometry
```

### Sky

```ts
createSkyMaterial(options: SkyMaterialOptions): ShaderMaterial
createSkyGeometry(size?: [number, number]): PlaneGeometry
```

### Volumetrics

```ts
createVolumetricFogMeshMaterial(options?: VolumetricFogMeshMaterialOptions): ShaderMaterial
createUnderwaterOverlayMaterial(options?: UnderwaterOverlayMaterialOptions): ShaderMaterial
```

## Presets API

### Fur

```ts
createFurMaterial(
  layerIndex: number,
  totalLayers: number,
  options?: FurOptions
): ShaderMaterial

createFurSystem(
  geometry: BufferGeometry,
  baseMaterial: Material,
  options?: FurOptions
): Group

updateFurUniforms(furSystem: Group, time: number): void
```

### Characters

```ts
createCharacter(options?: CharacterOptions): {
  root: Group
  joints: CharacterJoints
  state: CharacterState
}

animateCharacter(
  character: { root: Group; joints: CharacterJoints; state: CharacterState },
  time: number,
  deltaTime?: number
): void
```

### Molecular

```ts
createMolecule(
    atoms: AtomData[],
    bonds: BondData[],
    options?: MolecularOptions
): Group

createWaterMolecule(
    position?: Vector3,
    scale?: number
): Group
```

### Particles

```ts
createParticleSystem(
    options?: ParticleEmitterOptions
): ParticleSystem

// ParticleSystem interface
interface ParticleSystem {
    group: Group
    update: (deltaTime: number) => void
    dispose: () => void
}
```

### Decals

```ts
createDecal(
    geometry: BufferGeometry,
    options: DecalOptions
): Mesh

createBulletHoleDecal(
    position: Vector3,
    normal: Vector3,
    size?: number
): Mesh
```

### Billboards

```ts
createBillboard(
    options: BillboardOptions
): Mesh

createBillboardInstances(
    count: number,
    positions: Vector3[],
    options: BillboardOptions
): InstancedMesh

createAnimatedBillboard(
    texture: Texture,
    frameCount: { x: number; y: number },
    frameRate?: number,
    options?: Omit<BillboardOptions, 'texture'>
): Mesh & { update: (deltaTime: number) => void }
```

### Shadows

```ts
createShadowSystem(
    options: ShadowSystemOptions
): ShadowSystem

createContactShadows(
    renderer: WebGLRenderer,
    scene: Scene,
    camera: Camera
): ShaderMaterial
```

### Post-Processing

```ts
createPostProcessingPipeline(
    options: PostProcessingOptions
): PostProcessingPipeline

// PostProcessingPipeline interface
interface PostProcessingPipeline {
    render: (deltaTime: number) => void
    dispose: () => void
}
```

### Reflections

```ts
createReflectionProbe(
    options: ReflectionProbeOptions
): ReflectionProbe

createEnvironmentMap(
    renderer: WebGLRenderer,
    scene: Scene,
    position: Vector3,
    resolution?: number
): CubeTexture

applyReflectionProbe(
    material: Material,
    probe: CubeTexture,
    intensity?: number
): void

// ReflectionProbeManager class
class ReflectionProbeManager {
    addProbe(name: string, options: ReflectionProbeOptions): ReflectionProbe
    getProbe(name: string): ReflectionProbe | undefined
    removeProbe(name: string): void
    update(): void
    dispose(): void
}
```

## React Components API

### Water

```tsx
<Water size={number} time?: number />
<AdvancedWater 
  size={number}
  waterColor?: ColorRepresentation
  deepWaterColor?: ColorRepresentation
  foamColor?: ColorRepresentation
  causticIntensity?: number
/>
```

### Instancing

```tsx
<GPUInstancedMesh
  geometry={BufferGeometry}
  material={Material}
  count={number}
  instances={InstanceData[]}
  enableWind?: boolean
  windStrength?: number
  lodDistance?: number
/>

<GrassInstances count={number} areaSize={number} biomes={BiomeData[]} />
<TreeInstances count={number} areaSize={number} biomes={BiomeData[]} />
<RockInstances count={number} areaSize={number} biomes={BiomeData[]} />
```

### Sky

```tsx
<ProceduralSky
  timeOfDay={Partial<TimeOfDayState>}
  weather?: Partial<WeatherState>
  gyroTilt?: Vector2
/>
```

### Volumetrics

```tsx
<VolumetricEffects
  fogEnabled?: boolean
  underwaterEnabled?: boolean
/>

<VolumetricFogMesh
  color?: Color
  density?: number
  height?: number
/>

<UnderwaterOverlay
  waterColor?: Color
  density?: number
  causticStrength?: number
/>
```

### Ray Marching

```tsx
<Raymarching
  sdfFunction={string} // GLSL function string
  maxSteps?: number
  maxDistance?: number
  minDistance?: number
  backgroundColor?: Color
  fogStrength?: number
  fogColor?: Color
/>
```

## Type Definitions

All types are exported and part of the public API:

```ts
// SDF
interface BiomeData {
  type: 'marsh' | 'forest' | 'desert' | 'tundra' | 'savanna' | 'mountain' | 'scrubland'
  center: Vector2
  radius: number
}

// Instancing
interface InstanceData {
  position: Vector3
  rotation: Euler
  scale: Vector3
  biome: string
  height: number
  underwater: boolean
}

// Marching Cubes
interface MarchingCubesOptions {
  resolution: number
  bounds: { min: Vector3; max: Vector3 }
  isoLevel?: number
}

interface MarchingCubesResult {
  vertices: Float32Array
  normals: Float32Array
  indices: Uint32Array
}

// Presets
interface FurOptions {
  baseColor?: ColorRepresentation
  tipColor?: ColorRepresentation
  layerCount?: number
  spacing?: number
  windStrength?: number
  gravityDroop?: number
}

interface CharacterOptions {
  skinColor?: ColorRepresentation
  furOptions?: FurOptions
  scale?: number
}

interface CharacterState {
    speed: number
    maxSpeed: number
    rotation: number
    position: Vector3
    velocity: Vector3
}

// Particles
interface ParticleEmitterOptions {
    maxParticles?: number
    lifetime?: number
    rate?: number
    shape?: 'point' | 'box' | 'sphere' | 'cone'
    shapeParams?: {
        width?: number
        height?: number
        depth?: number
        radius?: number
        angle?: number
    }
    velocity?: { min: Vector3; max: Vector3 }
    acceleration?: Vector3
    color?: { start: Color; end: Color }
    size?: { start: number; end: number }
    opacity?: { start: number; end: number }
    rotation?: { min: number; max: number }
    texture?: Texture
    blending?: Blending
}

// Decals
interface DecalOptions {
    position: Vector3
    rotation: Euler
    scale: Vector3
    texture: Texture
    normalMap?: Texture
    material?: Material
    depthTest?: boolean
    depthWrite?: boolean
}

// Billboards
interface BillboardOptions {
    texture: Texture
    size?: number | { width: number; height: number }
    color?: Color
    transparent?: boolean
    opacity?: number
    alphaTest?: number
    side?: Side
}

// Shadows
interface ShadowSystemOptions {
    light: DirectionalLight
    camera: Camera
    cascades?: number
    shadowMapSize?: number
    shadowBias?: number
    shadowNormalBias?: number
    shadowRadius?: number
    maxDistance?: number
    fadeDistance?: number
    enableSoftShadows?: boolean
    enableContactShadows?: boolean
}

// Post-Processing
interface PostProcessingOptions {
    renderer: WebGLRenderer
    scene: Scene
    camera: Camera
    effects?: PostProcessingEffect[]
    resolution?: { width: number; height: number }
}

type PostProcessingEffect =
    | { type: 'bloom'; threshold?: number; intensity?: number; radius?: number }
    | { type: 'ssao'; radius?: number; intensity?: number; bias?: number }
    | { type: 'colorGrading'; lut?: Texture; intensity?: number }
    | { type: 'motionBlur'; samples?: number; intensity?: number }
    | { type: 'depthOfField'; focus?: number; aperture?: number; maxBlur?: number }
    | { type: 'chromaticAberration'; offset?: number }
    | { type: 'vignette'; offset?: number; darkness?: number }
    | { type: 'filmGrain'; intensity?: number }

// Reflections
interface ReflectionProbeOptions {
    position: Vector3
    size?: number
    resolution?: number
    updateRate?: number
    boxProjection?: boolean
    boxSize?: Vector3
    renderObjects?: (scene: Scene) => Object3D[]
}

// ... and more (see full type exports)
```

## Input Validation

All public functions include input validation and throw descriptive errors:

```ts
// Example error messages
"sdSphere: radius must be positive"
"generateInstanceData: count must be positive"
"createWaterMaterial: time must be a finite number"
```

## Performance Guarantees

- **GPU-accelerated**: All rendering uses GPU where possible
- **Mobile-optimized**: Texture compression, LOD, and performance tuning
- **Deterministic**: Seeded random for reproducible results
- **Memory-safe**: Proper disposal of resources (materials, geometries)

## Breaking Changes Policy

Breaking changes will only occur in major versions and will be:
1. Documented in CHANGELOG.md
2. Deprecated for at least one minor version before removal
3. Clearly marked in TypeScript types

## Internal APIs

APIs not listed in this document are **internal** and may change without notice:
- Internal helper functions
- Private class methods
- Implementation details
- Test utilities

## Examples vs Tests

- **Examples** (`examples/`) - Documentation and demos for developers
- **Tests** (`tests/`) - Automated verification of API contract
  - `tests/unit/` - Unit tests for core functions
  - `tests/integration/` - Integration tests for components
  - `tests/e2e/` - End-to-end Playwright tests

Examples are for learning; tests are for verification.
