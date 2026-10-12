/** Pure, seeded procedural fields and surface bakes. Renderer adapters are explicit subpaths. */

export type {
  SurfaceBake,
  SurfaceBakeManifest,
  SurfaceBakeMap,
  SurfaceBakeMapFormat,
  SurfaceBakeMapName,
  SurfacePlan,
  SurfacePlanOptions,
  SurfaceSample,
} from './materials.js';
export {
  bakeSurface,
  createSurfaceBakeManifest,
  createSurfacePlan,
  sampleSurface,
} from './materials.js';
export type { Random, Seed } from './noise.js';
export { createSeededNoise, createSeededRandom, fractalNoise, seedToUint32 } from './noise.js';
export type { Vec3 } from './sdf.js';
export {
  opIntersection,
  opSmoothSubtraction,
  opSmoothUnion,
  opSubtraction,
  opUnion,
  sdBox,
  sdPlane,
  sdSphere,
} from './sdf.js';
export type {
  Biome,
  BiomeKind,
  HeightfieldMesh,
  ScatterPoint,
  SeededTerrainField,
  SeededTerrainOptions,
  TerrainSample,
} from './terrain.js';
export { createSeededTerrainField } from './terrain.js';
