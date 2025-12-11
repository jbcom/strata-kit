/**
 * Strata Presets - Organized game development primitives
 *
 * This module exports all preset systems organized by layer:
 * - Background: Sky, volumetrics, terrain
 * - Midground: Water, vegetation, instancing
 * - Foreground: Characters, fur, shells, molecular
 */

// Background Layer
export * from '../core/sky';
export * from '../core/volumetrics';
export {
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
} from '../core/sdf';
export type { BiomeData } from '../core/sdf';
export * from '../core/marching-cubes';
export * from './terrain';

// Midground Layer
export * from './water';
export { generateInstanceData, createInstancedMesh } from '../core/instancing';
export type { InstanceData } from '../core/instancing';
export * from '../core/raymarching';
export * from './vegetation';

// Foreground Layer
export * from './fur';
export * from './characters';
export * from './molecular';
export * from './particles';
export * from './decals';
export * from './billboards';

// Lighting & Effects
export * from './shadows';
export * from './postprocessing';
export * from './reflections';

// Weather
export * from './weather';

// Clouds
export * from './clouds';

// Re-export types
export type { FurOptions, FurUniforms } from './fur';
export type { CharacterJoints, CharacterOptions, CharacterState } from './characters';
export type { MolecularOptions, AtomData, BondData } from './molecular';
export type { TerrainOptions } from './terrain';
export type { VegetationOptions } from './vegetation';
export type { ParticleEmitterOptions, ParticleSystem } from './particles';
export type { DecalOptions } from './decals';
export type { BillboardOptions } from './billboards';
export type { ShadowSystemOptions, ShadowSystem } from './shadows';
export type {
    PostProcessingOptions,
    PostProcessingEffect,
    PostProcessingPipeline,
} from './postprocessing';
export type { ReflectionProbeOptions, ReflectionProbe } from './reflections';
export type { WeatherPreset, WeatherPresetName } from './weather';
export type { CloudPreset, CloudPresetName } from './clouds';

// Camera presets
export * from './camera';
export type { CameraPreset, CameraPresetName } from './camera';
