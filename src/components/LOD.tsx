/**
 * LOD (Level of Detail) React Components
 *
 * Provides React components for distance-based level of detail rendering.
 * Supports mesh switching, impostor billboards, and specialized vegetation LOD.
 */

import React, { useRef, useMemo, useEffect, useCallback, forwardRef, useImperativeHandle, useState } from 'react';
import { useThree, useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import {
    LODLevel,
    LODConfig,
    LODState,
    LODManager,
    ImpostorConfig,
    VegetationLODConfig,
    calculateLODLevel,
    createLODLevels,
    simplifyGeometry,
    generateLODGeometries,
    createImpostorGeometry,
    updateImpostorUV,
    calculateImpostorAngle,
    interpolateLODMaterials,
    calculateVegetationDensity,
    createVegetationLODLevels,
} from '../core/lod';
import { updateBillboardRotation } from '../core/decals';

export interface LODMeshProps {
    levels: Array<{
        distance: number;
        geometry: THREE.BufferGeometry;
        material?: THREE.Material;
    }>;
    baseMaterial?: THREE.Material;
    position?: THREE.Vector3 | [number, number, number];
    rotation?: THREE.Euler | [number, number, number];
    scale?: THREE.Vector3 | [number, number, number] | number;
    hysteresis?: number;
    transitionDuration?: number;
    fadeMode?: 'instant' | 'crossfade' | 'dither';
    castShadow?: boolean;
    receiveShadow?: boolean;
    frustumCulled?: boolean;
    onLevelChange?: (level: number) => void;
}

export interface LODMeshRef {
    group: THREE.Group | null;
    currentLevel: number;
    getDistance: () => number;
}

export const LODMesh = forwardRef<LODMeshRef, LODMeshProps>(
    (
        {
            levels,
            baseMaterial,
            position = [0, 0, 0],
            rotation = [0, 0, 0],
            scale = 1,
            hysteresis = 0.1,
            transitionDuration = 0.3,
            fadeMode = 'instant',
            castShadow = true,
            receiveShadow = true,
            frustumCulled = true,
            onLevelChange,
        },
        ref
    ) => {
        const groupRef = useRef<THREE.Group>(null);
        const meshRefs = useRef<THREE.Mesh[]>([]);
        const { camera } = useThree();

        const [currentLevel, setCurrentLevel] = useState(0);
        const [transitionProgress, setTransitionProgress] = useState(1);
        const previousLevelRef = useRef(0);

        const pos = useMemo(
            () => (position instanceof THREE.Vector3 ? position : new THREE.Vector3(...position)),
            [position]
        );

        const rot = useMemo(() => {
            if (position instanceof THREE.Euler) return position;
            if (Array.isArray(rotation)) return new THREE.Euler(...rotation);
            return rotation;
        }, [rotation]);

        const scl = useMemo(() => {
            if (scale instanceof THREE.Vector3) return scale;
            if (typeof scale === 'number') return new THREE.Vector3(scale, scale, scale);
            return new THREE.Vector3(...scale);
        }, [scale]);

        const lodLevels = useMemo(
            () => createLODLevels(levels.map((l) => l.distance)),
            [levels]
        );

        const materials = useMemo(() => {
            return levels.map((level) => {
                if (level.material) return level.material;
                if (baseMaterial) return baseMaterial.clone();
                return new THREE.MeshStandardMaterial({ color: 0x888888 });
            });
        }, [levels, baseMaterial]);

        useImperativeHandle(
            ref,
            () => ({
                group: groupRef.current,
                currentLevel,
                getDistance: () => {
                    if (!groupRef.current) return 0;
                    const worldPos = new THREE.Vector3();
                    groupRef.current.getWorldPosition(worldPos);
                    return worldPos.distanceTo(camera.position);
                },
            }),
            [currentLevel, camera]
        );

        useFrame((_, delta) => {
            if (!groupRef.current) return;

            const worldPos = new THREE.Vector3();
            groupRef.current.getWorldPosition(worldPos);

            const newLevel = calculateLODLevel(worldPos, camera.position, lodLevels);

            if (newLevel !== currentLevel) {
                previousLevelRef.current = currentLevel;
                setCurrentLevel(newLevel);
                setTransitionProgress(fadeMode === 'instant' ? 1 : 0);
                onLevelChange?.(newLevel);
            }

            if (transitionProgress < 1 && fadeMode !== 'instant') {
                const newProgress = Math.min(1, transitionProgress + delta / transitionDuration);
                setTransitionProgress(newProgress);

                if (fadeMode === 'crossfade') {
                    const prevMesh = meshRefs.current[previousLevelRef.current];
                    const currMesh = meshRefs.current[currentLevel];

                    if (prevMesh?.material && currMesh?.material) {
                        interpolateLODMaterials(
                            prevMesh.material as THREE.Material,
                            currMesh.material as THREE.Material,
                            newProgress
                        );
                    }
                }
            }

            meshRefs.current.forEach((mesh, i) => {
                if (!mesh) return;

                if (fadeMode === 'crossfade' && transitionProgress < 1) {
                    mesh.visible = i === currentLevel || i === previousLevelRef.current;
                } else {
                    mesh.visible = i === currentLevel;
                }
            });
        });

        useEffect(() => {
            return () => {
                materials.forEach((mat) => {
                    if (mat !== baseMaterial) {
                        mat.dispose();
                    }
                });
            };
        }, [materials, baseMaterial]);

        return (
            <group ref={groupRef} position={pos} rotation={rot} scale={scl}>
                {levels.map((level, i) => (
                    <mesh
                        key={i}
                        ref={(el) => {
                            if (el) meshRefs.current[i] = el;
                        }}
                        geometry={level.geometry}
                        material={materials[i]}
                        visible={i === currentLevel}
                        castShadow={castShadow}
                        receiveShadow={receiveShadow}
                        frustumCulled={frustumCulled}
                    />
                ))}
            </group>
        );
    }
);

LODMesh.displayName = 'LODMesh';

export interface LODGroupProps {
    children: React.ReactNode;
    levels: Array<{
        distance: number;
        childIndices?: number[];
    }>;
    hysteresis?: number;
    position?: THREE.Vector3 | [number, number, number];
    rotation?: THREE.Euler | [number, number, number];
    scale?: THREE.Vector3 | [number, number, number] | number;
    onLevelChange?: (level: number) => void;
}

export interface LODGroupRef {
    group: THREE.Group | null;
    currentLevel: number;
    forceLevel: (level: number) => void;
}

export const LODGroup = forwardRef<LODGroupRef, LODGroupProps>(
    (
        {
            children,
            levels,
            hysteresis = 0.1,
            position = [0, 0, 0],
            rotation = [0, 0, 0],
            scale = 1,
            onLevelChange,
        },
        ref
    ) => {
        const groupRef = useRef<THREE.Group>(null);
        const { camera } = useThree();
        const [currentLevel, setCurrentLevel] = useState(0);
        const [forcedLevel, setForcedLevel] = useState<number | null>(null);

        const pos = useMemo(
            () => (position instanceof THREE.Vector3 ? position : new THREE.Vector3(...position)),
            [position]
        );

        const rot = useMemo(() => {
            if (position instanceof THREE.Euler) return position;
            if (Array.isArray(rotation)) return new THREE.Euler(...rotation);
            return rotation;
        }, [rotation]);

        const scl = useMemo(() => {
            if (scale instanceof THREE.Vector3) return scale;
            if (typeof scale === 'number') return new THREE.Vector3(scale, scale, scale);
            return new THREE.Vector3(...scale);
        }, [scale]);

        const lodLevels = useMemo(
            () => createLODLevels(levels.map((l) => l.distance)),
            [levels]
        );

        const forceLevel = useCallback((level: number) => {
            setForcedLevel(level);
        }, []);

        useImperativeHandle(
            ref,
            () => ({
                group: groupRef.current,
                currentLevel: forcedLevel ?? currentLevel,
                forceLevel,
            }),
            [currentLevel, forcedLevel, forceLevel]
        );

        useFrame(() => {
            if (!groupRef.current || forcedLevel !== null) return;

            const worldPos = new THREE.Vector3();
            groupRef.current.getWorldPosition(worldPos);

            const newLevel = calculateLODLevel(worldPos, camera.position, lodLevels);

            if (newLevel !== currentLevel) {
                setCurrentLevel(newLevel);
                onLevelChange?.(newLevel);
            }
        });

        const activeLevel = forcedLevel ?? currentLevel;
        const activeLevelConfig = levels[activeLevel];
        const activeIndices = activeLevelConfig?.childIndices;

        const childArray = React.Children.toArray(children);

        return (
            <group ref={groupRef} position={pos} rotation={rot} scale={scl}>
                {childArray.map((child, index) => {
                    const isVisible = activeIndices
                        ? activeIndices.includes(index)
                        : index === activeLevel;

                    if (!isVisible) return null;

                    return React.cloneElement(child as React.ReactElement, {
                        key: index,
                    });
                })}
            </group>
        );
    }
);

LODGroup.displayName = 'LODGroup';

export interface ImpostorProps {
    texture: THREE.Texture;
    position?: THREE.Vector3 | [number, number, number];
    size?: number | [number, number];
    views?: number;
    billboardMode?: 'spherical' | 'cylindrical';
    opacity?: number;
    transparent?: boolean;
    alphaTest?: number;
    depthWrite?: boolean;
    color?: THREE.ColorRepresentation;
    renderOrder?: number;
    castShadow?: boolean;
    receiveShadow?: boolean;
}

export interface ImpostorRef {
    mesh: THREE.Mesh | null;
    currentView: number;
    updateView: () => void;
}

export const Impostor = forwardRef<ImpostorRef, ImpostorProps>(
    (
        {
            texture,
            position = [0, 0, 0],
            size = 1,
            views = 8,
            billboardMode = 'cylindrical',
            opacity = 1,
            transparent = true,
            alphaTest = 0.1,
            depthWrite = false,
            color = 0xffffff,
            renderOrder = 0,
            castShadow = false,
            receiveShadow = false,
        },
        ref
    ) => {
        const meshRef = useRef<THREE.Mesh>(null);
        const { camera } = useThree();
        const [currentView, setCurrentView] = useState(0);

        const pos = useMemo(
            () => (position instanceof THREE.Vector3 ? position : new THREE.Vector3(...position)),
            [position]
        );

        const billboardSize = useMemo(() => {
            if (typeof size === 'number') {
                return [size, size] as [number, number];
            }
            return size;
        }, [size]);

        const geometry = useMemo(
            () => createImpostorGeometry(billboardSize[0], billboardSize[1], views),
            [billboardSize, views]
        );

        const material = useMemo(() => {
            const mat = new THREE.MeshBasicMaterial({
                map: texture,
                color,
                transparent,
                opacity,
                alphaTest,
                depthWrite,
                side: THREE.DoubleSide,
            });
            return mat;
        }, [texture, color, transparent, opacity, alphaTest, depthWrite]);

        const updateView = useCallback(() => {
            if (!meshRef.current) return;

            const worldPos = new THREE.Vector3();
            meshRef.current.getWorldPosition(worldPos);

            const angle = calculateImpostorAngle(worldPos, camera.position);
            updateImpostorUV(geometry, angle, views);

            const viewIndex = Math.floor(((angle + Math.PI) / (Math.PI * 2)) * views) % views;
            setCurrentView(viewIndex);
        }, [camera, geometry, views]);

        useImperativeHandle(
            ref,
            () => ({
                mesh: meshRef.current,
                currentView,
                updateView,
            }),
            [currentView, updateView]
        );

        useFrame(() => {
            if (!meshRef.current) return;

            if (billboardMode === 'cylindrical') {
                updateBillboardRotation(meshRef.current, camera, { lockY: true });
            } else {
                updateBillboardRotation(meshRef.current, camera, { lockY: false });
            }

            updateView();
        });

        useEffect(() => {
            return () => {
                geometry.dispose();
                material.dispose();
            };
        }, [geometry, material]);

        return (
            <mesh
                ref={meshRef}
                position={pos}
                geometry={geometry}
                material={material}
                renderOrder={renderOrder}
                castShadow={castShadow}
                receiveShadow={receiveShadow}
            />
        );
    }
);

Impostor.displayName = 'Impostor';

export interface LODVegetationProps {
    count: number;
    instances: Array<{
        position: THREE.Vector3 | [number, number, number];
        rotation?: THREE.Euler | [number, number, number];
        scale?: THREE.Vector3 | [number, number, number] | number;
    }>;
    highDetailGeometry: THREE.BufferGeometry;
    mediumDetailGeometry?: THREE.BufferGeometry;
    lowDetailGeometry?: THREE.BufferGeometry;
    impostorTexture?: THREE.Texture;
    material?: THREE.Material;
    lodConfig?: Partial<VegetationLODConfig>;
    castShadow?: boolean;
    receiveShadow?: boolean;
    frustumCulled?: boolean;
}

export interface LODVegetationRef {
    group: THREE.Group | null;
    visibleCounts: { high: number; medium: number; low: number; impostor: number };
    updateLOD: () => void;
}

interface VegetationInstance {
    position: THREE.Vector3;
    rotation: THREE.Euler;
    scale: THREE.Vector3;
    lodLevel: number;
    visible: boolean;
}

export const LODVegetation = forwardRef<LODVegetationRef, LODVegetationProps>(
    (
        {
            count,
            instances,
            highDetailGeometry,
            mediumDetailGeometry,
            lowDetailGeometry,
            impostorTexture,
            material,
            lodConfig = {},
            castShadow = true,
            receiveShadow = true,
            frustumCulled = true,
        },
        ref
    ) => {
        const groupRef = useRef<THREE.Group>(null);
        const { camera } = useThree();

        const config: VegetationLODConfig = useMemo(
            () => ({
                highDetailDistance: lodConfig.highDetailDistance ?? 20,
                mediumDetailDistance: lodConfig.mediumDetailDistance ?? 50,
                lowDetailDistance: lodConfig.lowDetailDistance ?? 100,
                impostorDistance: lodConfig.impostorDistance ?? 200,
                cullDistance: lodConfig.cullDistance ?? 500,
                transitionWidth: lodConfig.transitionWidth ?? 5,
            }),
            [lodConfig]
        );

        const lodLevels = useMemo(() => createVegetationLODLevels(config), [config]);

        const [vegetationInstances, setVegetationInstances] = useState<VegetationInstance[]>(() =>
            instances.slice(0, count).map((inst) => ({
                position: inst.position instanceof THREE.Vector3
                    ? inst.position.clone()
                    : new THREE.Vector3(...inst.position),
                rotation: inst.rotation instanceof THREE.Euler
                    ? inst.rotation.clone()
                    : inst.rotation
                    ? new THREE.Euler(...inst.rotation)
                    : new THREE.Euler(0, Math.random() * Math.PI * 2, 0),
                scale: inst.scale instanceof THREE.Vector3
                    ? inst.scale.clone()
                    : typeof inst.scale === 'number'
                    ? new THREE.Vector3(inst.scale, inst.scale, inst.scale)
                    : inst.scale
                    ? new THREE.Vector3(...inst.scale)
                    : new THREE.Vector3(1, 1, 1),
                lodLevel: 0,
                visible: true,
            }))
        );

        const [visibleCounts, setVisibleCounts] = useState({
            high: 0,
            medium: 0,
            low: 0,
            impostor: 0,
        });

        const baseMaterial = useMemo(() => {
            return material ?? new THREE.MeshStandardMaterial({
                color: 0x4a7c23,
                roughness: 0.8,
                side: THREE.DoubleSide,
            });
        }, [material]);

        const geometries = useMemo(() => ({
            high: highDetailGeometry,
            medium: mediumDetailGeometry ?? simplifyGeometry(highDetailGeometry, { targetRatio: 0.5 }),
            low: lowDetailGeometry ?? simplifyGeometry(highDetailGeometry, { targetRatio: 0.2 }),
        }), [highDetailGeometry, mediumDetailGeometry, lowDetailGeometry]);

        const updateLOD = useCallback(() => {
            const cameraPos = camera.position;
            const counts = { high: 0, medium: 0, low: 0, impostor: 0 };

            const updatedInstances = vegetationInstances.map((inst) => {
                const distance = inst.position.distanceTo(cameraPos);
                const level = calculateLODLevel(inst.position, cameraPos, lodLevels);
                const visible = distance < config.cullDistance;

                if (visible) {
                    if (level === 0) counts.high++;
                    else if (level === 1) counts.medium++;
                    else if (level === 2) counts.low++;
                    else counts.impostor++;
                }

                return { ...inst, lodLevel: level, visible };
            });

            setVegetationInstances(updatedInstances);
            setVisibleCounts(counts);
        }, [camera.position, vegetationInstances, lodLevels, config.cullDistance]);

        useImperativeHandle(
            ref,
            () => ({
                group: groupRef.current,
                visibleCounts,
                updateLOD,
            }),
            [visibleCounts, updateLOD]
        );

        useFrame(() => {
            updateLOD();
        });

        useEffect(() => {
            return () => {
                if (!material) {
                    baseMaterial.dispose();
                }
                if (!mediumDetailGeometry) {
                    geometries.medium.dispose();
                }
                if (!lowDetailGeometry) {
                    geometries.low.dispose();
                }
            };
        }, [material, mediumDetailGeometry, lowDetailGeometry, baseMaterial, geometries]);

        return (
            <group ref={groupRef}>
                {vegetationInstances.map((inst, i) => {
                    if (!inst.visible) return null;

                    const geometry =
                        inst.lodLevel === 0
                            ? geometries.high
                            : inst.lodLevel === 1
                            ? geometries.medium
                            : inst.lodLevel === 2
                            ? geometries.low
                            : geometries.low;

                    if (inst.lodLevel >= 3 && impostorTexture) {
                        return (
                            <Impostor
                                key={i}
                                texture={impostorTexture}
                                position={inst.position}
                                size={inst.scale.x}
                                billboardMode="cylindrical"
                            />
                        );
                    }

                    return (
                        <mesh
                            key={i}
                            position={inst.position}
                            rotation={inst.rotation}
                            scale={inst.scale}
                            geometry={geometry}
                            material={baseMaterial}
                            castShadow={castShadow && inst.lodLevel < 2}
                            receiveShadow={receiveShadow}
                            frustumCulled={frustumCulled}
                        />
                    );
                })}
            </group>
        );
    }
);

LODVegetation.displayName = 'LODVegetation';

export type {
    LODLevel,
    LODConfig,
    LODState,
    ImpostorConfig,
    VegetationLODConfig,
};
