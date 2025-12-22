import { useFrame } from '@react-three/fiber';
import React, { forwardRef, useImperativeHandle, useMemo, useRef } from 'react';
import * as THREE from 'three';
import { createHologramMaterial } from '../../shaders/materials';
import type { HologramMeshProps, HologramMeshRef } from './types';

/**
 * Sci-Fi Hologram Effect.
 *
 * Creates a translucent hologram look with scanlines, flickering, and Fresnel-based
 * edge highlighting. Highly customizable for character projections or terminals.
 *
 * @category Rendering Pipeline
 * @example
 * ```tsx
 * <HologramMesh
 *   color="#00aaff"
 *   scanlineIntensity={0.5}
 *   flickerSpeed={2.0}
 * >
 *   <sphereGeometry />
 * </HologramMesh>
 * ```
 */
export const HologramMesh = forwardRef<HologramMeshRef, HologramMeshProps>(
    (
        {
            geometry,
            children,
            position = [0, 0, 0],
            rotation = [0, 0, 0],
            scale = 1,
            animate = true,
            ...materialOptions
        },
        ref
    ) => {
        const meshRef = useRef<THREE.Mesh>(null);

        const material = useMemo(
            () => createHologramMaterial(materialOptions),
            [
                materialOptions.color,
                materialOptions.scanlineIntensity,
                materialOptions.scanlineDensity,
                materialOptions.flickerSpeed,
                materialOptions.fresnelPower,
                materialOptions.alpha,
                materialOptions,
            ]
        );

        useFrame((state) => {
            if (animate && material.uniforms.uTime) {
                material.uniforms.uTime.value = state.clock.elapsedTime;
            }
        });

        useImperativeHandle(ref, () => ({
            mesh: meshRef.current,
            material,
        }));

        const scaleArray = typeof scale === 'number' ? [scale, scale, scale] : scale;

        return (
            <mesh
                ref={meshRef}
                geometry={geometry}
                position={position}
                rotation={rotation}
                scale={scaleArray as [number, number, number]}
            >
                {children}
                <primitive object={material} attach="material" />
            </mesh>
        );
    }
);

HologramMesh.displayName = 'HologramMesh';
