/**
 * God Rays Core - Pure TypeScript (no React)
 *
 * Core algorithms for volumetric light shafts and god rays
 * Implements radial blur, sun occlusion, and scattering calculations
 */

import * as THREE from 'three';
import {
    godRaysVertexShader,
    godRaysFragmentShader,
    volumetricSpotlightVertexShader,
    volumetricSpotlightFragmentShader,
    volumetricPointLightVertexShader,
    volumetricPointLightFragmentShader,
    createGodRaysUniforms,
    createVolumetricSpotlightUniforms,
    createVolumetricPointLightUniforms,
} from '../shaders/godRays';

export interface GodRaysMaterialOptions {
    lightPosition?: THREE.Vector3;
    lightColor?: THREE.Color;
    intensity?: number;
    decay?: number;
    density?: number;
    weight?: number;
    exposure?: number;
    samples?: number;
    scattering?: number;
    noiseFactor?: number;
}

export interface VolumetricSpotlightMaterialOptions {
    lightPosition?: THREE.Vector3;
    lightDirection?: THREE.Vector3;
    lightColor?: THREE.Color;
    intensity?: number;
    angle?: number;
    penumbra?: number;
    distance?: number;
    dustDensity?: number;
}

export interface VolumetricPointLightMaterialOptions {
    lightPosition?: THREE.Vector3;
    lightColor?: THREE.Color;
    intensity?: number;
    radius?: number;
    dustDensity?: number;
    flicker?: number;
}

export interface RadialBlurOptions {
    center: THREE.Vector2;
    samples: number;
    decay: number;
    density: number;
    weight: number;
}

export interface OcclusionResult {
    occluded: boolean;
    occlusionFactor: number;
    visibleFraction: number;
}

export interface ScatteringParams {
    angle: number;
    intensity: number;
    color: THREE.Color;
}

export function calculateRadialBlur(
    uv: THREE.Vector2,
    center: THREE.Vector2,
    options: RadialBlurOptions
): { intensity: number; direction: THREE.Vector2 } {
    const { samples, decay, density, weight } = options;

    const delta = new THREE.Vector2()
        .subVectors(uv, center)
        .multiplyScalar(density / samples);

    let illuminationDecay = 1.0;
    let totalIntensity = 0.0;
    const currentUV = uv.clone();

    for (let i = 0; i < samples; i++) {
        currentUV.sub(delta);
        const dist = currentUV.distanceTo(center);
        const falloff = Math.exp(-dist * 2.0);
        totalIntensity += falloff * illuminationDecay * weight;
        illuminationDecay *= decay;
    }

    return {
        intensity: totalIntensity,
        direction: delta.normalize(),
    };
}

export function calculateSunOcclusion(
    sunPosition: THREE.Vector3,
    camera: THREE.Camera,
    occluders: THREE.Object3D[],
    sampleCount: number = 16
): OcclusionResult {
    const raycaster = new THREE.Raycaster();
    const cameraPosition = camera.position.clone();
    const direction = new THREE.Vector3().subVectors(sunPosition, cameraPosition).normalize();

    let visibleSamples = 0;
    const radius = 0.1;

    for (let i = 0; i < sampleCount; i++) {
        const theta = (i / sampleCount) * Math.PI * 2;
        const offsetX = Math.cos(theta) * radius;
        const offsetY = Math.sin(theta) * radius;

        const perpX = new THREE.Vector3(-direction.y, direction.x, 0).normalize();
        const perpY = new THREE.Vector3().crossVectors(direction, perpX).normalize();

        const offset = new THREE.Vector3()
            .addScaledVector(perpX, offsetX)
            .addScaledVector(perpY, offsetY);

        const sampleDir = direction.clone().add(offset).normalize();
        raycaster.set(cameraPosition, sampleDir);

        const intersects = raycaster.intersectObjects(occluders, true);
        if (intersects.length === 0) {
            visibleSamples++;
        }
    }

    const visibleFraction = visibleSamples / sampleCount;
    return {
        occluded: visibleFraction < 0.5,
        occlusionFactor: 1.0 - visibleFraction,
        visibleFraction,
    };
}

export function calculateScatteringIntensity(
    viewDirection: THREE.Vector3,
    lightDirection: THREE.Vector3,
    params: Partial<ScatteringParams> = {}
): number {
    const angle = viewDirection.angleTo(lightDirection);
    const baseIntensity = params.intensity ?? 1.0;

    const forwardScatter = Math.pow(Math.max(0, Math.cos(angle)), 8);
    const backScatter = Math.pow(Math.max(0, Math.cos(Math.PI - angle)), 2) * 0.1;
    const mieScattering = forwardScatter + backScatter;

    const rayleighFactor = (1 + Math.cos(angle) * Math.cos(angle)) * 0.1;

    return baseIntensity * (mieScattering + rayleighFactor);
}

export function getLightScreenPosition(
    lightWorldPosition: THREE.Vector3,
    camera: THREE.Camera,
    resolution: THREE.Vector2
): THREE.Vector2 | null {
    const projected = lightWorldPosition.clone().project(camera);

    if (projected.z > 1) {
        return null;
    }

    return new THREE.Vector2(
        (projected.x + 1) * 0.5,
        (projected.y + 1) * 0.5
    );
}

export function calculateGodRayIntensityFromAngle(
    sunAltitude: number,
    maxIntensity: number = 1.0
): number {
    const altitudeRad = sunAltitude * (Math.PI / 180);

    if (altitudeRad <= 0) {
        return 0;
    }

    if (altitudeRad < Math.PI / 6) {
        return maxIntensity * Math.sin(altitudeRad * 3);
    } else if (altitudeRad < Math.PI / 3) {
        return maxIntensity;
    } else {
        const decay = (altitudeRad - Math.PI / 3) / (Math.PI / 2 - Math.PI / 3);
        return maxIntensity * (1 - decay * 0.7);
    }
}

export function createGodRaysMaterial(
    options: GodRaysMaterialOptions = {}
): THREE.ShaderMaterial {
    const {
        lightPosition = new THREE.Vector3(0.5, 0.5, 0),
        lightColor = new THREE.Color(1.0, 0.9, 0.7),
        intensity = 1.0,
        decay = 0.95,
        density = 1.0,
        weight = 0.01,
        exposure = 1.0,
        samples = 50,
        scattering = 2.0,
        noiseFactor = 0.3,
    } = options;

    if (intensity < 0) {
        throw new Error('createGodRaysMaterial: intensity must be non-negative');
    }
    if (samples < 1 || samples > 100) {
        throw new Error('createGodRaysMaterial: samples must be between 1 and 100');
    }
    if (decay < 0 || decay > 1) {
        throw new Error('createGodRaysMaterial: decay must be between 0 and 1');
    }

    const uniforms = createGodRaysUniforms(lightPosition, lightColor, {
        intensity,
        decay,
        density,
        weight,
        exposure,
        samples,
        scattering,
        noiseFactor,
    });

    return new THREE.ShaderMaterial({
        uniforms,
        vertexShader: godRaysVertexShader,
        fragmentShader: godRaysFragmentShader,
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
    });
}

export function createVolumetricSpotlightMaterial(
    options: VolumetricSpotlightMaterialOptions = {}
): THREE.ShaderMaterial {
    const {
        lightPosition = new THREE.Vector3(0, 5, 0),
        lightDirection = new THREE.Vector3(0, -1, 0),
        lightColor = new THREE.Color(1.0, 0.95, 0.9),
        intensity = 1.0,
        angle = Math.PI / 6,
        penumbra = 0.1,
        distance = 10,
        dustDensity = 0.5,
    } = options;

    if (intensity < 0) {
        throw new Error('createVolumetricSpotlightMaterial: intensity must be non-negative');
    }
    if (angle <= 0 || angle > Math.PI / 2) {
        throw new Error('createVolumetricSpotlightMaterial: angle must be between 0 and PI/2');
    }
    if (distance <= 0) {
        throw new Error('createVolumetricSpotlightMaterial: distance must be positive');
    }

    const uniforms = createVolumetricSpotlightUniforms(
        lightPosition,
        lightDirection,
        lightColor,
        { intensity, angle, penumbra, distance, dustDensity }
    );

    return new THREE.ShaderMaterial({
        uniforms,
        vertexShader: volumetricSpotlightVertexShader,
        fragmentShader: volumetricSpotlightFragmentShader,
        transparent: true,
        depthWrite: false,
        side: THREE.DoubleSide,
        blending: THREE.AdditiveBlending,
    });
}

export function createVolumetricPointLightMaterial(
    options: VolumetricPointLightMaterialOptions = {}
): THREE.ShaderMaterial {
    const {
        lightPosition = new THREE.Vector3(0, 2, 0),
        lightColor = new THREE.Color(1.0, 0.8, 0.6),
        intensity = 1.0,
        radius = 5,
        dustDensity = 0.5,
        flicker = 0,
    } = options;

    if (intensity < 0) {
        throw new Error('createVolumetricPointLightMaterial: intensity must be non-negative');
    }
    if (radius <= 0) {
        throw new Error('createVolumetricPointLightMaterial: radius must be positive');
    }
    if (flicker < 0 || flicker > 1) {
        throw new Error('createVolumetricPointLightMaterial: flicker must be between 0 and 1');
    }

    const uniforms = createVolumetricPointLightUniforms(lightPosition, lightColor, {
        intensity,
        radius,
        dustDensity,
        flicker,
    });

    return new THREE.ShaderMaterial({
        uniforms,
        vertexShader: volumetricPointLightVertexShader,
        fragmentShader: volumetricPointLightFragmentShader,
        transparent: true,
        depthWrite: false,
        side: THREE.BackSide,
        blending: THREE.AdditiveBlending,
    });
}

export function createSpotlightConeGeometry(
    angle: number,
    distance: number,
    segments: number = 32
): THREE.ConeGeometry {
    const radius = Math.tan(angle) * distance;
    return new THREE.ConeGeometry(radius, distance, segments, 1, true);
}

export function createPointLightSphereGeometry(
    radius: number,
    segments: number = 32
): THREE.SphereGeometry {
    return new THREE.SphereGeometry(radius, segments, segments);
}

export function updateGodRaysLightPosition(
    material: THREE.ShaderMaterial,
    lightPosition: THREE.Vector3,
    camera: THREE.Camera
): boolean {
    const screenPos = getLightScreenPosition(
        lightPosition,
        camera,
        new THREE.Vector2(1, 1)
    );

    if (!screenPos) {
        return false;
    }

    if (material.uniforms.uLightPosition) {
        material.uniforms.uLightPosition.value.set(screenPos.x, screenPos.y, 0);
    }

    return true;
}

export function blendGodRayColors(
    baseColor: THREE.Color,
    atmosphereColor: THREE.Color,
    sunAltitude: number
): THREE.Color {
    const altitudeRad = Math.max(0, sunAltitude * (Math.PI / 180));
    const blendFactor = Math.min(1, altitudeRad / (Math.PI / 4));

    return new THREE.Color().lerpColors(atmosphereColor, baseColor, blendFactor);
}
