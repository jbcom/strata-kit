/** Pure, seeded procedural fields and surface bakes. Renderer adapters are explicit subpaths. */

export type {
  HexTileOptions,
  HexTileConfig,
  HexTileRequest,
  HexTilePair,
  HexTileResult,
  SegmentSample2D,
  BandCoverageSample,
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
  createHexTileConfig,
  sampleHexTile2D,
  sampleSegment2D,
  projectPixelFootprint2D,
  sampleBandCoverage,
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
  CurveArcLengthTableOptions,
  CurveArcLengthTable,
  CurveArcLengthKnot,
  ProceduralMesh,
  ParametricSheetMesh,
  ParametricSheetMeshOptions,
  RevolvedAngularDomain,
  RevolvedSection,
  RevolvedSectionSource,
  RevolvedSurfaceMesh,
  RevolvedSurfaceOptions,
  RevolveProfilePoint,
  RevolvedMeshOptions,
  SheetMeshOptions,
  SweptMeshOptions,
  SuperellipseSection2D,
} from "./mesh.js";
export {
  createCurveArcLengthTable,
  curveArcLengthAt,
  curveParameterAtArcLength,
  createParametricSheetMesh,
  createRevolvedMesh,
  createRevolvedSurfaceMesh,
  createSheetMesh,
  createSweptMesh,
  superellipsePoint2D,
  superellipseHalfDepth2D,
} from "./mesh.js";
export {
  applyShaderPatches,
  replaceOrThrow,
  seededSurfaceNoiseGlsl,
  segmentCoverageGlsl,
  signedVector8Glsl,
  scalarGrid16Glsl,
  hexTilingGlsl,
} from "./shaders.js";
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
  MonotoneCubicProfile,
  MonotoneCubicProfilePoint,
  ParametricSurfaceDifferentialOptions,
  ProjectedReliefSample,
  ReliefDerivatives,
  ReliefFrame,
  ScalarCoordinateDerivatives,
  ScalarFieldSample,
  SurfaceDifferentials,
} from "./surfaceFields.js";
export {
  createCubicHermiteProfile,
  createMonotoneCubicProfile,
  deriveReliefFrame,
  MAX_CUBIC_HERMITE_PROFILE_KNOTS,
  projectScalarProfileDerivative,
  sampleCubicHermiteProfile,
  sampleMonotoneCubicProfile,
  sampleParametricSurfaceDifferentials,
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
  ScalarGrid16Input,
  ScalarGrid16,
} from "./terrain.js";
export { createSeededTerrainField, packScalarGrid16, sampleScalarGrid16 } from "./terrain.js";
export { packSignedVector8, decodeSignedVector8 } from "./terrain.js";
export { createValueNoise2D, createFractalNoise2D, createSineLattice2D } from "./noise.js";
export { createJitteredCellField2D } from "./noise.js";
export type {
  JitteredCellField2DOptions,
  JitteredCellSample2D,
  CellSite2D,
  LatticeSiteSampler2D,
} from "./noise.js";
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
