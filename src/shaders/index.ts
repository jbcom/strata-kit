/**
 * Shader exports
 */

// Water shaders
export {
    waterVertexShader,
    waterFragmentShader,
    advancedWaterVertexShader,
    advancedWaterFragmentShader,
    createWaterUniforms,
    createAdvancedWaterUniforms
} from './water';

// Terrain shaders
export {
    terrainVertexShader,
    terrainFragmentShader,
    simpleTerrainVertexShader,
    simpleTerrainFragmentShader,
    createTerrainUniforms,
    createSimpleTerrainUniforms
} from './terrain';

// Fur/shell shaders
export {
    furVertexShader,
    furFragmentShader,
    createFurUniforms,
    defaultFurConfig
} from './fur';
export type { FurConfig } from './fur';

// Volumetric shaders
export {
    volumetricFogShader,
    underwaterShader,
    atmosphereShader,
    dustParticlesShader
} from './volumetrics';

// Ray marching shaders
export {
    raymarchingVertexShader,
    raymarchingFragmentShader
} from './raymarching';

// Instancing wind shader
export {
    instancingWindVertexShader
} from './instancing-wind';

// Sky shaders
export {
    skyVertexShader,
    skyFragmentShader,
    createSkyUniforms
} from './sky';
export type { SkyUniforms } from './sky';

// Volumetric component shaders
export {
    volumetricFogMeshVertexShader,
    volumetricFogMeshFragmentShader,
    underwaterOverlayVertexShader,
    underwaterOverlayFragmentShader,
    createVolumetricFogMeshUniforms,
    createUnderwaterOverlayUniforms
} from './volumetrics-components';
export type {
    VolumetricFogMeshUniforms,
    UnderwaterOverlayUniforms
} from './volumetrics-components';
