import React, { forwardRef, useImperativeHandle, useMemo, useRef } from 'react';
import * as THREE from 'three';
import { createGradientMaterial } from '../../shaders/materials';
import type { GradientMeshProps, GradientMeshRef } from './types';

/**
 * Procedural Linear Gradient Mesh.
 *
 * Applies a two- or three-color linear gradient to a mesh surface. Supports
 * vertical, horizontal, and custom direction vectors.
 *
 * @category Rendering Pipeline
 * @example
 * ```tsx
 * <GradientMesh
 *   colorStart="blue"
 *   colorEnd="red"
 *   direction={new THREE.Vector2(1, 1)}
 * >
 *   <planeGeometry args={[10, 10]} />
 * </GradientMesh>
 * ```
 */
export const GradientMesh = forwardRef<GradientMeshRef, GradientMeshProps>(
    (
        {
            geometry,
            children,
            position = [0, 0, 0],
            rotation = [0, 0, 0],
            scale = 1,
            ...materialOptions
        },
        ref
    ) => {
        const meshRef = useRef<THREE.Mesh>(null);

        const material = useMemo(
            () => createGradientMaterial(materialOptions),
            [
                materialOptions.colorStart,
                materialOptions.colorEnd,
                materialOptions.colorMiddle,
                materialOptions.direction,
                materialOptions.useThreeColors,
                materialOptions,
            ]
        );

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

GradientMesh.displayName = 'GradientMesh';
