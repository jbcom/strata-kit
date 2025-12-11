/**
 * Core algorithm exports
 */

// Core modules (pure TypeScript, no React)
export { generateInstanceData, createInstancedMesh } from './instancing';
export type { InstanceData, BiomeData as InstancingBiomeData } from './instancing';

// Weather system
export {
    WeatherSystem,
    WindSimulation,
    createWeatherSystem,
    createWindSimulation,
    calculateTemperature,
    getPrecipitationType,
} from './weather';
export type {
    WeatherType,
    WeatherStateConfig,
    WeatherTransition,
    WindConfig,
    TemperatureConfig,
} from './weather';

// Particles (pure TypeScript)
export {
    ParticleEmitter,
    createParticleEmitter,
} from './particles';
export type {
    ParticleEmitterConfig,
    EmissionShape,
    ParticleForces,
    ParticleBehavior,
    EmitterShapeParams,
} from './particles';

export * from './water';
export * from './raymarching';
export * from './sky';
export * from './volumetrics';
export * from './clouds';

// SDF primitives and operations
export {
    // Primitives
    sdSphere,
    sdBox,
    sdPlane,
    sdCapsule,
    sdTorus,
    sdCone,

    // Boolean operations
    opUnion,
    opSubtraction,
    opIntersection,
    opSmoothUnion,
    opSmoothSubtraction,
    opSmoothIntersection,

    // Noise functions
    noise3D,
    fbm,
    warpedFbm,

    // Terrain
    getBiomeAt,
    getTerrainHeight,
    sdCaves,
    sdTerrain,
    sdRock,

    // Utilities
    calcNormal,
} from './sdf';
export type { BiomeData as SDFBiomeData } from './sdf';

// Marching cubes
export {
    marchingCubes,
    createGeometryFromMarchingCubes,
    generateTerrainChunk,
} from './marching-cubes';
export type { MarchingCubesResult, MarchingCubesOptions, TerrainChunk } from './marching-cubes';

// Camera utilities
export {
    lerp,
    lerpVector3,
    slerp,
    smoothDamp,
    smoothDampVector3,
    CameraShake,
    FOVTransition,
    easeInOutCubic,
    easeOutCubic,
    easeInCubic,
    easeOutElastic,
    evaluateCatmullRom,
    calculateLookAhead,
    calculateHeadBob,
    calculateScreenShakeIntensity,
} from './camera';
export type {
    CameraShakeConfig,
    FOVTransitionConfig,
    CameraPath,
    ScreenShakeIntensity,
} from './camera';
