/**
 * Procedural Cloud Components
 *
 * Cloud layer, multi-layer sky, and volumetric cloud components
 */

import { useRef, useMemo, useEffect } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import {
  createCloudLayerMaterial,
  createVolumetricCloudMaterial,
  createCloudLayerGeometry,
  createVolumetricCloudGeometry,
  CloudLayerConfig,
  WindConfig,
  DayNightConfig,
  adaptCloudColorsForTimeOfDay,
} from '../core/clouds';

export interface CloudLayerProps {
  altitude?: number;
  density?: number;
  coverage?: number;
  cloudColor?: THREE.Color | string;
  shadowColor?: THREE.Color | string;
  scale?: number;
  size?: [number, number];
  windDirection?: [number, number];
  windSpeed?: number;
  sunIntensity?: number;
  sunAngle?: number;
  sunColor?: THREE.Color | string;
  adaptToTimeOfDay?: boolean;
}

export interface CloudSkyProps {
  layers?: Partial<CloudLayerConfig>[];
  windDirection?: [number, number];
  windSpeed?: number;
  sunIntensity?: number;
  sunAngle?: number;
  sunColor?: THREE.Color | string;
  size?: [number, number];
  adaptToTimeOfDay?: boolean;
}

export interface VolumetricCloudsProps {
  cloudBase?: number;
  cloudHeight?: number;
  coverage?: number;
  density?: number;
  cloudColor?: THREE.Color | string;
  shadowColor?: THREE.Color | string;
  radius?: number;
  windDirection?: [number, number];
  windSpeed?: number;
  sunIntensity?: number;
  sunAngle?: number;
  sunColor?: THREE.Color | string;
  steps?: number;
  lightSteps?: number;
  adaptToTimeOfDay?: boolean;
}

function toColor(value: THREE.Color | string | undefined, defaultColor: THREE.Color): THREE.Color {
  if (!value) return defaultColor;
  if (value instanceof THREE.Color) return value;
  return new THREE.Color(value);
}

export function CloudLayer({
  altitude = 100,
  density = 1.0,
  coverage = 0.5,
  cloudColor = '#ffffff',
  shadowColor = '#b3bfd9',
  scale = 5.0,
  size = [400, 400],
  windDirection = [1, 0],
  windSpeed = 0.01,
  sunIntensity = 1.0,
  sunAngle = 60,
  sunColor = '#fff3cc',
  adaptToTimeOfDay = true,
}: CloudLayerProps) {
  const meshRef = useRef<THREE.Mesh>(null);

  const { material, geometry } = useMemo(() => {
    let finalCloudColor = toColor(cloudColor, new THREE.Color(1, 1, 1));
    let finalShadowColor = toColor(shadowColor, new THREE.Color(0.7, 0.75, 0.85));
    let finalSunColor = toColor(sunColor, new THREE.Color(1, 0.95, 0.8));

    if (adaptToTimeOfDay) {
      const adapted = adaptCloudColorsForTimeOfDay(
        finalCloudColor,
        finalShadowColor,
        sunAngle,
        sunIntensity
      );
      finalCloudColor = adapted.cloudColor;
      finalShadowColor = adapted.shadowColor;
      finalSunColor = adapted.sunColor;
    }

    const mat = createCloudLayerMaterial({
      layer: {
        altitude,
        density,
        coverage,
        cloudColor: finalCloudColor,
        shadowColor: finalShadowColor,
        scale,
      },
      wind: {
        direction: new THREE.Vector2(windDirection[0], windDirection[1]),
        speed: windSpeed,
      },
      dayNight: {
        sunIntensity,
        sunAngle,
        sunColor: finalSunColor,
      },
    });

    const geo = createCloudLayerGeometry(size);

    return { material: mat, geometry: geo };
  }, [
    altitude,
    density,
    coverage,
    cloudColor,
    shadowColor,
    scale,
    size,
    windDirection,
    windSpeed,
    sunIntensity,
    sunAngle,
    sunColor,
    adaptToTimeOfDay,
  ]);

  useFrame((state) => {
    if (material.uniforms) {
      material.uniforms.uTime.value = state.clock.elapsedTime;
    }
  });

  useEffect(() => {
    return () => {
      material.dispose();
      geometry.dispose();
    };
  }, [material, geometry]);

  return (
    <mesh
      ref={meshRef}
      position={[0, altitude, 0]}
      rotation={[-Math.PI / 2, 0, 0]}
      geometry={geometry}
    >
      <primitive object={material} attach="material" />
    </mesh>
  );
}

const defaultLayers: Partial<CloudLayerConfig>[] = [
  {
    altitude: 80,
    density: 0.8,
    coverage: 0.4,
    scale: 4.0,
  },
  {
    altitude: 120,
    density: 0.6,
    coverage: 0.3,
    scale: 6.0,
  },
  {
    altitude: 160,
    density: 0.4,
    coverage: 0.2,
    scale: 8.0,
  },
];

export function CloudSky({
  layers = defaultLayers,
  windDirection = [1, 0.3],
  windSpeed = 0.01,
  sunIntensity = 1.0,
  sunAngle = 60,
  sunColor = '#fff3cc',
  size = [500, 500],
  adaptToTimeOfDay = true,
}: CloudSkyProps) {
  return (
    <group>
      {layers.map((layer, index) => (
        <CloudLayer
          key={index}
          altitude={layer.altitude ?? 100 + index * 40}
          density={layer.density ?? 1.0 - index * 0.2}
          coverage={layer.coverage ?? 0.5 - index * 0.1}
          cloudColor={layer.cloudColor ?? new THREE.Color(1 - index * 0.02, 1 - index * 0.02, 1)}
          shadowColor={layer.shadowColor}
          scale={layer.scale ?? 5.0 + index * 1.5}
          size={size}
          windDirection={windDirection}
          windSpeed={windSpeed * (1 + index * 0.2)}
          sunIntensity={sunIntensity}
          sunAngle={sunAngle}
          sunColor={sunColor}
          adaptToTimeOfDay={adaptToTimeOfDay}
        />
      ))}
    </group>
  );
}

export function VolumetricClouds({
  cloudBase = 50,
  cloudHeight = 50,
  coverage = 0.5,
  density = 1.0,
  cloudColor = '#ffffff',
  shadowColor = '#99a6bf',
  radius = 500,
  windDirection = [1, 0],
  windSpeed = 0.5,
  sunIntensity = 1.0,
  sunAngle = 60,
  sunColor = '#fff3cc',
  steps = 32,
  lightSteps = 4,
  adaptToTimeOfDay = true,
}: VolumetricCloudsProps) {
  const meshRef = useRef<THREE.Mesh>(null);

  const { material, geometry } = useMemo(() => {
    let finalCloudColor = toColor(cloudColor, new THREE.Color(1, 1, 1));
    let finalShadowColor = toColor(shadowColor, new THREE.Color(0.6, 0.65, 0.75));
    let finalSunColor = toColor(sunColor, new THREE.Color(1, 0.95, 0.8));

    if (adaptToTimeOfDay) {
      const adapted = adaptCloudColorsForTimeOfDay(
        finalCloudColor,
        finalShadowColor,
        sunAngle,
        sunIntensity
      );
      finalCloudColor = adapted.cloudColor;
      finalShadowColor = adapted.shadowColor;
      finalSunColor = adapted.sunColor;
    }

    const mat = createVolumetricCloudMaterial({
      cloudBase,
      cloudHeight,
      coverage,
      density,
      cloudColor: finalCloudColor,
      shadowColor: finalShadowColor,
      wind: {
        direction: new THREE.Vector2(windDirection[0], windDirection[1]),
        speed: windSpeed,
      },
      dayNight: {
        sunIntensity,
        sunAngle,
        sunColor: finalSunColor,
      },
      steps,
      lightSteps,
    });

    const geo = createVolumetricCloudGeometry(radius);

    return { material: mat, geometry: geo };
  }, [
    cloudBase,
    cloudHeight,
    coverage,
    density,
    cloudColor,
    shadowColor,
    radius,
    windDirection,
    windSpeed,
    sunIntensity,
    sunAngle,
    sunColor,
    steps,
    lightSteps,
    adaptToTimeOfDay,
  ]);

  useFrame((state) => {
    if (material.uniforms) {
      material.uniforms.uTime.value = state.clock.elapsedTime;
    }
  });

  useEffect(() => {
    return () => {
      material.dispose();
      geometry.dispose();
    };
  }, [material, geometry]);

  return (
    <mesh ref={meshRef} geometry={geometry}>
      <primitive object={material} attach="material" />
    </mesh>
  );
}
