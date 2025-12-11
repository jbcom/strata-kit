/**
 * @jbcom/strata
 *
 * The complete solution for foreground, midground, and background layer
 * 3D gaming in Node.js. Provides terrain, water, vegetation, characters,
 * fur, shells, molecular rendering, and more.
 *
 * Organized into presets for easy integration into your game.
 */

// Core algorithms (pure TypeScript, no React)
export {
    // SDF
    sdSphere,
    sdBox,
    sdPlane,
    sdCapsule,
    sdTorus,
    sdCone,
    opUnion,
    opSubtraction,
    opIntersection,
    opSmoothUnion,
    opSmoothSubtraction,
    opSmoothIntersection,
    noise3D,
    fbm,
    warpedFbm,
    getBiomeAt,
    getTerrainHeight,
    sdCaves,
    sdTerrain,
    sdRock,
    calcNormal,
    // Marching cubes
    marchingCubes,
    createGeometryFromMarchingCubes,
    generateTerrainChunk,
    // Instancing (pure TS)
    generateInstanceData as generateInstanceDataCore,
    createInstancedMesh,
    // Water (pure TS)
    createWaterMaterial,
    createAdvancedWaterMaterial,
    createWaterGeometry,
    // Ray marching (pure TS)
    createRaymarchingMaterial,
    createRaymarchingGeometry,
    // Sky (pure TS)
    createSkyMaterial,
    createSkyGeometry,
    // Volumetrics (pure TS)
    createVolumetricFogMeshMaterial,
    createUnderwaterOverlayMaterial,
    // Clouds (pure TS)
    createCloudLayerMaterial,
    createVolumetricCloudMaterial,
    createCloudLayerGeometry,
    createVolumetricCloudGeometry,
    adaptCloudColorsForTimeOfDay,
    calculateWindOffset,
    fbmNoise2D,
    sampleCloudDensity,
    createDefaultCloudSkyConfig,
    // Particles (pure TS)
    ParticleEmitter as CoreParticleEmitter,
    createParticleEmitter,
    // Weather (pure TS)
    WeatherSystem as CoreWeatherSystem,
    WindSimulation,
    createWeatherSystem,
    createWindSimulation,
    calculateTemperature,
    getPrecipitationType,
    // Camera utilities (pure TS)
    lerp,
    lerpVector3,
    slerp,
    smoothDamp,
    smoothDampVector3,
    CameraShake as CoreCameraShake,
    FOVTransition,
    easeInOutCubic,
    easeOutCubic,
    easeInCubic,
    easeOutElastic,
    evaluateCatmullRom,
    calculateLookAhead,
    calculateHeadBob,
    calculateScreenShakeIntensity,
} from './core';
export type {
    // SDF types
    SDFBiomeData,
    // Instancing types (same InstanceData, different BiomeData)
    InstanceData,
    InstancingBiomeData,
    // Marching cubes types
    MarchingCubesResult,
    MarchingCubesOptions,
    TerrainChunk,
    // Particle types
    ParticleEmitterConfig,
    EmissionShape,
    ParticleForces,
    ParticleBehavior,
    EmitterShapeParams,
    // Weather types
    WeatherType,
    WeatherStateConfig,
    WeatherTransition,
    WindConfig,
    TemperatureConfig,
    // Camera types
    CameraShakeConfig,
    FOVTransitionConfig,
    CameraPath,
    ScreenShakeIntensity,
    // Cloud types
    CloudLayerConfig,
    WindConfig as CloudWindConfig,
    DayNightConfig,
    CloudMaterialOptions,
    VolumetricCloudOptions,
    CloudSkyConfig,
} from './core';

// React components
export {
    Water,
    AdvancedWater,
    GPUInstancedMesh,
    GrassInstances,
    TreeInstances,
    RockInstances,
    generateInstanceData,
    ProceduralSky,
    createTimeOfDay,
    CloudLayer,
    CloudSky,
    VolumetricClouds,
    VolumetricEffects,
    VolumetricFogMesh,
    UnderwaterOverlay,
    EnhancedFog,
    Raymarching,
    ParticleEmitter,
    ParticleBurst,
    Rain,
    Snow,
    Lightning,
    WeatherEffects,
    // Camera components
    FollowCamera,
    OrbitCamera,
    FPSCamera,
    CinematicCamera,
    CameraShake,
    useCameraTransition,
} from './components';

// Presets (organized by layer: background, midground, foreground)
export * from './presets';
export type {
    // Re-export InstanceData from components (same as core)
    InstanceData as ComponentInstanceData,
    // Re-export BiomeData from components (same as core InstancingBiomeData)
    BiomeData as ComponentBiomeData,
    // Component-specific types
    TimeOfDayState,
    WeatherState,
    // Particle component types
    ParticleEmitterProps,
    ParticleEmitterRef,
    ParticleBurstProps,
    // Weather component types
    RainProps,
    SnowProps,
    LightningProps,
    WeatherSystemProps,
    // Cloud component types
    CloudLayerProps,
    CloudSkyProps,
    VolumetricCloudsProps,
    // Camera component types
    FollowCameraProps,
    FollowCameraRef,
    OrbitCameraProps,
    OrbitCameraRef,
    FPSCameraProps,
    FPSCameraRef,
    CinematicCameraProps,
    CinematicCameraRef,
    CameraShakeProps,
    CameraShakeRef,
    CameraTransitionProps,
} from './components';

// GLSL shaders
export * from './shaders';

// Utilities
export * from './utils';
