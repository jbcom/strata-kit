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
    // Decals and billboards (pure TS)
    DecalProjector,
    updateBillboardRotation,
    createBillboardMatrix,
    sortBillboardsByDepth,
    createSpriteSheetAnimation,
    updateSpriteSheetAnimation,
    getSpriteSheetUVs,
    applySpriteSheetFrame,
    createSpriteSheetMaterial,
    createDecalTexture,
    createBulletHoleTexture,
    createBloodSplatterTexture,
    createScorchMarkTexture,
    createFootprintTexture,
    createWaterPuddleTexture,
    // LOD (pure TS)
    LODManager,
    calculateLODLevel,
    createLODLevels,
    simplifyGeometry,
    generateLODGeometries,
    createImpostorTexture,
    createImpostorGeometry,
    updateImpostorUV,
    calculateImpostorAngle,
    interpolateLODMaterials,
    createDitherPattern,
    calculateScreenSpaceSize,
    shouldUseLOD,
    createVegetationLODLevels,
    calculateVegetationDensity,
    batchLODObjects,
    // God rays (pure TS)
    createGodRaysMaterial,
    createVolumetricSpotlightMaterial,
    createVolumetricPointLightMaterial,
    createSpotlightConeGeometry,
    createPointLightSphereGeometry,
    calculateRadialBlur,
    calculateSunOcclusion,
    calculateScatteringIntensity,
    getLightScreenPosition,
    calculateGodRayIntensityFromAngle,
    updateGodRaysLightPosition,
    blendGodRayColors,
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
    // Decal types
    DecalProjectorConfig,
    DecalInstance,
    BillboardConfig,
    SpriteSheetConfig,
    SpriteAnimationState,
    // LOD types
    LODLevel,
    LODConfig,
    LODState,
    ImpostorConfig,
    SimplificationOptions,
    VegetationLODConfig,
    // God rays types
    GodRaysMaterialOptions,
    VolumetricSpotlightMaterialOptions,
    VolumetricPointLightMaterialOptions,
    RadialBlurOptions,
    OcclusionResult,
    ScatteringParams,
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
    // Decal components
    Decal,
    Billboard,
    AnimatedBillboard,
    DecalPool,
    // LOD components
    LODMesh,
    LODGroup,
    Impostor,
    LODVegetation,
    // God rays components
    GodRays,
    LightShafts,
    VolumetricSpotlight,
    VolumetricPointLight,
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
    // Decal component types
    DecalProps,
    DecalRef,
    BillboardProps,
    BillboardRef,
    AnimatedBillboardProps,
    AnimatedBillboardRef,
    DecalPoolProps,
    DecalPoolRef,
    // LOD component types
    LODMeshProps,
    LODMeshRef,
    LODGroupProps,
    LODGroupRef,
    ImpostorProps,
    ImpostorRef,
    LODVegetationProps,
    LODVegetationRef,
    // God rays component types
    GodRaysProps,
    GodRaysRef,
    VolumetricSpotlightProps,
    VolumetricSpotlightRef,
    VolumetricPointLightProps,
    VolumetricPointLightRef,
} from './components';

// GLSL shaders
export * from './shaders';

// Utilities
export * from './utils';
