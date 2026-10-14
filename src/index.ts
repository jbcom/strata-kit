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
  SurfaceSampler,
  SurfaceLayer,
  NeutralIndexedMesh,
  ReskinPlan,
  ReskinProjection,
  TriplanarSurfaceOptions,
  UvAtlasBake,
  UvAtlasBakeOptions,
  UvLayoutDiagnostics,
  UvLayoutOptions,
  UvTexelFootprint,
  UvTexelFootprintOptions,
  WearField,
  WearFieldOptions,
  WearSample,
} from "./materials.js";
export {
  bakeSurface,
  createSurfaceBakeManifest,
  createSurfacePlan,
  sampleSurface,
  createSurfaceSampler,
  composeSurfaceLayers,
  createWearField,
  analyzeUvLayout,
  bakeUvAtlas,
  createReskinPlan,
  sampleTriplanarSurface,
  visitUvTexelFootprints,
} from "./materials.js";
export type {
  ProceduralMesh,
  RevolveProfilePoint,
  RevolvedMeshOptions,
  SheetMeshOptions,
  SweptMeshOptions,
} from "./mesh.js";
export { createRevolvedMesh, createSheetMesh, createSweptMesh } from "./mesh.js";
export { applyShaderPatches, replaceOrThrow, seededSurfaceNoiseGlsl } from "./shaders.js";
export type { Random, Seed } from "./noise.js";
export { createSeededNoise, createSeededRandom, fractalNoise, seedToUint32 } from "./noise.js";
export type { Vec3 } from "./sdf.js";
export {
  opIntersection,
  opSmoothSubtraction,
  opSmoothUnion,
  opSubtraction,
  opUnion,
  sdBox,
  sdPlane,
  sdSphere,
} from "./sdf.js";
export type {
  CubicHermiteProfile,
  CubicHermiteProfileKnot,
  CubicHermiteProfileUniforms,
  ProjectedReliefSample,
  ReliefDerivatives,
  ReliefFrame,
  ScalarCoordinateDerivatives,
  ScalarFieldSample,
  SurfaceDifferentials,
} from "./surfaceFields.js";
export {
  createCubicHermiteProfile,
  deriveReliefFrame,
  MAX_CUBIC_HERMITE_PROFILE_KNOTS,
  projectScalarProfileDerivative,
  sampleCubicHermiteProfile,
  surfaceFieldsGlsl,
  toCubicHermiteProfileUniforms,
} from "./surfaceFields.js";
export type {
  Biome,
  BiomeKind,
  HeightfieldMesh,
  ScatterPoint,
  SeededTerrainField,
  SeededTerrainOptions,
  TerrainSample,
} from "./terrain.js";
export { createSeededTerrainField } from "./terrain.js";
export { createValueNoise2D, createFractalNoise2D, createSineLattice2D } from "./noise.js";
export type {
  ValueNoise2DOptions,
  FractalNoise2DOptions,
  SineLattice2DOptions,
  LatticeSampler2D,
} from "./noise.js";
export {
  composeScalarField2D,
  transformScalarField2D,
  createDirectionalField2D,
  createSmoothMask2D,
} from "./terrain.js";
export type {
  ScalarField2D,
  ScalarField2DInput,
  ScalarField2DLayer,
  DirectionalField2DOptions,
  SmoothMask2DOptions,
} from "./terrain.js";
export { createPeriodicRidgeProfile, sampleCosineProfile } from "./surfaceFields.js";
export type { ScalarProfileSampler } from "./surfaceFields.js";
