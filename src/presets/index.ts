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
export * from '../core/sdf';
export * from '../core/marching-cubes';
export * from './terrain';

// Midground Layer
export * from './water';
export * from '../core/instancing';
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
export type { PostProcessingOptions, PostProcessingEffect, PostProcessingPipeline } from './postprocessing';
export type { ReflectionProbeOptions, ReflectionProbe } from './reflections';
