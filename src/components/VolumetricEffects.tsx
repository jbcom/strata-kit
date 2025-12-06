/**
 * Volumetric Effects Component
 * 
 * Provides raymarched volumetric fog, underwater effects, and atmospheric scattering
 * using shader-based post-processing.
 * 
 * Lifted from Otterfall procedural rendering system.
 */

import React, { useRef, useMemo, useEffect } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import {
    volumetricFogMeshVertexShader,
    volumetricFogMeshFragmentShader,
    underwaterOverlayVertexShader,
    underwaterOverlayFragmentShader,
    createVolumetricFogMeshUniforms,
    createUnderwaterOverlayUniforms
} from '../shaders/volumetrics-components';
import {
    createVolumetricFogMeshMaterial,
    createUnderwaterOverlayMaterial
} from '../core/volumetrics';

// =============================================================================
// ENHANCED FOG
// =============================================================================

/**
 * Simple fog implementation using Three.js built-in fog with enhanced visuals
 */
export function EnhancedFog({
    color = new THREE.Color(0.7, 0.8, 0.9),
    density = 0.02
}: {
    color?: THREE.Color;
    density?: number;
}) {
    const { scene } = useThree();
    
    useEffect(() => {
        scene.fog = new THREE.FogExp2(color.getHex(), density) as any;
        return () => {
            scene.fog = null;
        };
    }, [scene, color, density]);
    
    return null;
}

// =============================================================================
// UNDERWATER OVERLAY
// =============================================================================

interface UnderwaterOverlayProps {
    waterColor?: THREE.Color;
    density?: number;
    causticStrength?: number;
    waterSurface?: number;
}

export function UnderwaterOverlay({
    waterColor = new THREE.Color(0.0, 0.3, 0.5),
    density = 0.1,
    causticStrength = 0.3,
    waterSurface = 0
}: UnderwaterOverlayProps) {
    const { camera } = useThree();
    const overlayRef = useRef<THREE.Mesh>(null);
    
    const material = useMemo(() => {
        return createUnderwaterOverlayMaterial({
            waterColor,
            density,
            causticStrength,
            waterSurface
        });
    }, [waterColor, density, causticStrength, waterSurface]);
    
    useFrame((state) => {
        if (material && material.uniforms) {
            material.uniforms.uTime.value = state.clock.elapsedTime;
            material.uniforms.uCameraY.value = camera.position.y;
        }
    });
    
    useEffect(() => {
        return () => {
            material.dispose();
        };
    }, [material]);
    
    return (
        <mesh ref={overlayRef} renderOrder={999}>
            <planeGeometry args={[2, 2]} />
            <primitive object={material} attach="material" />
        </mesh>
    );
}

// =============================================================================
// VOLUMETRIC FOG MESH
// =============================================================================

interface VolumetricFogMeshProps {
    color?: THREE.Color;
    density?: number;
    height?: number;
    size?: number;
}

export function VolumetricFogMesh({
    color = new THREE.Color(0.7, 0.8, 0.9),
    density = 0.02,
    height = 10,
    size = 200
}: VolumetricFogMeshProps) {
    const meshRef = useRef<THREE.Mesh>(null);
    const { camera } = useThree();
    
    const material = useMemo(() => {
        return createVolumetricFogMeshMaterial({
            color,
            density,
            height,
            cameraPosition: camera.position as any
        });
    }, [color, density, height, camera]);
    
    useFrame((state) => {
        if (material && material.uniforms && meshRef.current) {
            material.uniforms.uTime.value = state.clock.elapsedTime;
            material.uniforms.uCameraPosition.value = camera.position.toArray();
            meshRef.current.position.set(camera.position.x, 0, camera.position.z);
        }
    });
    
    useEffect(() => {
        return () => {
            material.dispose();
        };
    }, [material]);
    
    return (
        <mesh ref={meshRef as any} position={[0, height / 2, 0]}>
            <boxGeometry args={[size, height, size, 1, 8, 1]} />
            <primitive object={material} attach="material" />
        </mesh>
    );
}

// =============================================================================
// COMBINED EFFECTS COMPONENT
// =============================================================================

interface VolumetricFogSettings {
    color?: THREE.Color;
    density?: number;
    height?: number;
}

interface UnderwaterSettings {
    waterColor?: THREE.Color;
    density?: number;
    causticStrength?: number;
    waterSurface?: number;
}

interface VolumetricEffectsProps {
    enableFog?: boolean;
    enableUnderwater?: boolean;
    fogSettings?: VolumetricFogSettings;
    underwaterSettings?: UnderwaterSettings;
}

export function VolumetricEffects({
    enableFog = true,
    enableUnderwater = true,
    fogSettings = {},
    underwaterSettings = {}
}: VolumetricEffectsProps) {
    return (
        <>
            {/* World-space volumetric fog - using advanced mesh-based effect */}
            {enableFog && (
                <VolumetricFogMesh
                    color={fogSettings.color}
                    density={fogSettings.density}
                    height={fogSettings.height}
                />
            )}
            
            {/* Underwater overlay */}
            {enableUnderwater && (
                <UnderwaterOverlay
                    waterColor={underwaterSettings.waterColor}
                    density={underwaterSettings.density}
                    causticStrength={underwaterSettings.causticStrength}
                    waterSurface={underwaterSettings.waterSurface}
                />
            )}
        </>
    );
}
