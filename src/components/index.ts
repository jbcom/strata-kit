/**
 * React component exports
 */

// Water
export { Water, AdvancedWater } from './Water';

// Instancing
export {
    GPUInstancedMesh,
    GrassInstances,
    TreeInstances,
    RockInstances,
    generateInstanceData,
} from './Instancing';
export type { InstanceData, BiomeData } from './Instancing';

// Sky
export { ProceduralSky, createTimeOfDay } from './Sky';
export type { TimeOfDayState, WeatherState } from './Sky';

// Clouds
export { CloudLayer, CloudSky, VolumetricClouds } from './Clouds';
export type { CloudLayerProps, CloudSkyProps, VolumetricCloudsProps } from './Clouds';

// Volumetric effects
export {
    VolumetricEffects,
    VolumetricFogMesh,
    UnderwaterOverlay,
    EnhancedFog,
} from './VolumetricEffects';

// Ray marching
export { Raymarching } from './Raymarching';

// Particles
export { ParticleEmitter, ParticleBurst } from './Particles';
export type { ParticleEmitterProps, ParticleEmitterRef, ParticleBurstProps } from './Particles';

// Weather
export { Rain, Snow, Lightning, WeatherSystem as WeatherEffects } from './Weather';
export type { RainProps, SnowProps, LightningProps, WeatherSystemProps } from './Weather';

// Camera
export {
    FollowCamera,
    OrbitCamera,
    FPSCamera,
    CinematicCamera,
    CameraShake,
    useCameraTransition,
} from './Camera';
export type {
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
} from './Camera';
