/**
 * Core Sky and Atmosphere Utilities
 *
 * Pure TypeScript functions for creating procedural sky materials,
 * managing time of day, and simulating atmospheric scattering.
 *
 * @category World Building
 * @module core/sky
 */

import * as THREE from 'three';
import { createSkyUniforms, skyFragmentShader, skyVertexShader } from '../shaders/sky';

/**
 * State representing the time of day and atmospheric conditions.
 * @category World Building
 */
export interface TimeOfDayState {
    /** Sun light intensity (0-1). 0 = night, 1 = noon. */
    sunIntensity: number;
    /** Sun angle in degrees (0-180). 0 = sunrise, 90 = noon, 180 = sunset. */
    sunAngle: number;
    /** Ambient light intensity (0-1). */
    ambientLight: number;
    /** Star visibility (0-1). Higher values make stars more visible. */
    starVisibility: number;
    /** Fog density for atmospheric scattering (0-1). */
    fogDensity: number;
}

/**
 * State representing weather intensity.
 * @category World Building
 */
export interface WeatherState {
    /** Weather intensity (0-1). 0 = clear, 1 = stormy. */
    intensity: number;
}

/**
 * Options for creating a sky material.
 * @category World Building
 */
export interface SkyMaterialOptions {
    /** Time of day settings */
    timeOfDay: Partial<TimeOfDayState>;
    /** Weather settings */
    weather?: Partial<WeatherState>;
    /** Gyroscope tilt for mobile/VR effects */
    gyroTilt?: THREE.Vector2;
    /** Animation time in seconds */
    time?: number;
}

/**
 * Create a shader material for procedural sky rendering.
 *
 * Generates a `THREE.ShaderMaterial` configured for atmospheric scattering,
 * day/night cycles, and dynamic weather integration.
 *
 * @category World Building
 * @param options - Configuration options
 * @returns Configured shader material
 *
 * @example
 * ```typescript
 * const skyMaterial = createSkyMaterial({
 *   timeOfDay: {
 *     sunAngle: 45,
 *     sunIntensity: 0.8
 *   }
 * });
 * ```
 */
export function createSkyMaterial(options: SkyMaterialOptions): THREE.ShaderMaterial {
    const { timeOfDay, weather = {}, gyroTilt, time = 0 } = options;

    // Input validation
    if (
        timeOfDay &&
        timeOfDay.sunIntensity !== undefined &&
        (timeOfDay.sunIntensity < 0 || timeOfDay.sunIntensity > 1)
    ) {
        throw new Error('createSkyMaterial: sunIntensity must be between 0 and 1');
    }
    if (
        timeOfDay &&
        timeOfDay.sunAngle !== undefined &&
        (timeOfDay.sunAngle < 0 || timeOfDay.sunAngle > 180)
    ) {
        throw new Error('createSkyMaterial: sunAngle must be between 0 and 180');
    }

    const defaultTimeOfDay: TimeOfDayState = {
        sunIntensity: 1.0,
        sunAngle: 60,
        ambientLight: 0.8,
        starVisibility: 0,
        fogDensity: 0,
    };

    const defaultWeather: WeatherState = {
        intensity: 0,
    };

    const mergedTimeOfDay = { ...defaultTimeOfDay, ...timeOfDay };
    const mergedWeather = { ...defaultWeather, ...weather };

    const uniforms = createSkyUniforms(mergedTimeOfDay, mergedWeather, gyroTilt);
    uniforms.uTime.value = time;

    return new THREE.ShaderMaterial({
        uniforms,
        vertexShader: skyVertexShader,
        fragmentShader: skyFragmentShader,
        side: THREE.DoubleSide,
    });
}

/**
 * Create a geometry for the sky plane.
 *
 * @category World Building
 * @param size - Width and height of the sky plane. Default: [200, 100]
 * @returns PlaneGeometry
 */
export function createSkyGeometry(size: [number, number] = [200, 100]): THREE.PlaneGeometry {
    return new THREE.PlaneGeometry(size[0], size[1], 1, 1);
}
