/**
 * Weather Components
 *
 * GPU-instanced weather effects including rain, snow, and lightning.
 */

import { useRef, useMemo, useEffect, useState } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { WeatherStateConfig, WeatherType } from '../core/weather';

const RAIN_VERTEX_SHADER = `
  attribute vec3 offset;
  attribute float speed;
  attribute float phase;
  
  uniform float uTime;
  uniform vec3 uWind;
  uniform float uIntensity;
  uniform float uAreaSize;
  uniform float uHeight;
  
  varying float vAlpha;
  varying vec2 vUv;
  
  void main() {
    vUv = uv;
    
    vec3 pos = position;
    vec3 instancePos = offset;
    
    float t = mod(uTime * speed + phase, 1.0);
    instancePos.y = uHeight * (1.0 - t);
    instancePos.x += uWind.x * t * 2.0;
    instancePos.z += uWind.z * t * 2.0;
    
    instancePos.x = mod(instancePos.x + uAreaSize * 0.5, uAreaSize) - uAreaSize * 0.5;
    instancePos.z = mod(instancePos.z + uAreaSize * 0.5, uAreaSize) - uAreaSize * 0.5;
    
    pos += instancePos;
    
    vAlpha = uIntensity * (1.0 - t * 0.3);
    
    vec4 mvPosition = modelViewMatrix * vec4(pos, 1.0);
    gl_Position = projectionMatrix * mvPosition;
  }
`;

const RAIN_FRAGMENT_SHADER = `
  uniform vec3 uColor;
  
  varying float vAlpha;
  varying vec2 vUv;
  
  void main() {
    float dist = abs(vUv.x - 0.5) * 2.0;
    float alpha = vAlpha * (1.0 - dist) * smoothstep(0.0, 0.1, vUv.y) * smoothstep(1.0, 0.9, vUv.y);
    
    gl_FragColor = vec4(uColor, alpha * 0.6);
  }
`;

const SNOW_VERTEX_SHADER = `
  attribute vec3 offset;
  attribute float speed;
  attribute float phase;
  attribute float size;
  
  uniform float uTime;
  uniform vec3 uWind;
  uniform float uIntensity;
  uniform float uAreaSize;
  uniform float uHeight;
  
  varying float vAlpha;
  varying vec2 vUv;
  
  void main() {
    vUv = uv;
    
    vec3 pos = position * size;
    vec3 instancePos = offset;
    
    float t = mod(uTime * speed * 0.3 + phase, 1.0);
    instancePos.y = uHeight * (1.0 - t);
    
    float driftX = sin(uTime * 2.0 + phase * 10.0) * 0.5;
    float driftZ = cos(uTime * 1.5 + phase * 8.0) * 0.5;
    instancePos.x += uWind.x * t * 3.0 + driftX;
    instancePos.z += uWind.z * t * 3.0 + driftZ;
    
    instancePos.x = mod(instancePos.x + uAreaSize * 0.5, uAreaSize) - uAreaSize * 0.5;
    instancePos.z = mod(instancePos.z + uAreaSize * 0.5, uAreaSize) - uAreaSize * 0.5;
    
    pos += instancePos;
    
    vAlpha = uIntensity * (1.0 - t * 0.2);
    
    vec4 mvPosition = modelViewMatrix * vec4(pos, 1.0);
    gl_Position = projectionMatrix * mvPosition;
  }
`;

const SNOW_FRAGMENT_SHADER = `
  uniform vec3 uColor;
  
  varying float vAlpha;
  varying vec2 vUv;
  
  void main() {
    vec2 center = vUv - 0.5;
    float dist = length(center) * 2.0;
    float alpha = vAlpha * smoothstep(1.0, 0.3, dist);
    
    gl_FragColor = vec4(uColor, alpha * 0.8);
  }
`;

export interface RainProps {
    count?: number;
    areaSize?: number;
    height?: number;
    intensity?: number;
    wind?: THREE.Vector3;
    color?: THREE.ColorRepresentation;
    dropLength?: number;
}

export function Rain({
    count = 10000,
    areaSize = 50,
    height = 30,
    intensity = 1,
    wind = new THREE.Vector3(0.5, 0, 0.2),
    color = 0xaaccff,
    dropLength = 0.5,
}: RainProps) {
    const meshRef = useRef<THREE.Mesh>(null);
    const { camera } = useThree();

    const { geometry, material } = useMemo(() => {
        const geo = new THREE.BufferGeometry();

        const positions: number[] = [];
        const uvs: number[] = [];
        const offsets: number[] = [];
        const speeds: number[] = [];
        const phases: number[] = [];

        for (let i = 0; i < count; i++) {
            positions.push(-0.01, 0, 0, 0.01, 0, 0, 0.01, dropLength, 0, -0.01, dropLength, 0);
            uvs.push(0, 0, 1, 0, 1, 1, 0, 1);

            const ox = (Math.random() - 0.5) * areaSize;
            const oy = Math.random() * height;
            const oz = (Math.random() - 0.5) * areaSize;
            for (let j = 0; j < 4; j++) {
                offsets.push(ox, oy, oz);
            }

            const speed = 0.8 + Math.random() * 0.4;
            const phase = Math.random();
            for (let j = 0; j < 4; j++) {
                speeds.push(speed);
                phases.push(phase);
            }
        }

        const indices: number[] = [];
        for (let i = 0; i < count; i++) {
            const base = i * 4;
            indices.push(base, base + 1, base + 2, base, base + 2, base + 3);
        }

        geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
        geo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
        geo.setAttribute('offset', new THREE.Float32BufferAttribute(offsets, 3));
        geo.setAttribute('speed', new THREE.Float32BufferAttribute(speeds, 1));
        geo.setAttribute('phase', new THREE.Float32BufferAttribute(phases, 1));
        geo.setIndex(indices);

        const mat = new THREE.ShaderMaterial({
            vertexShader: RAIN_VERTEX_SHADER,
            fragmentShader: RAIN_FRAGMENT_SHADER,
            uniforms: {
                uTime: { value: 0 },
                uWind: { value: wind.clone() },
                uIntensity: { value: intensity },
                uAreaSize: { value: areaSize },
                uHeight: { value: height },
                uColor: { value: new THREE.Color(color) },
            },
            transparent: true,
            depthWrite: false,
            side: THREE.DoubleSide,
        });

        return { geometry: geo, material: mat };
    }, [count, areaSize, height, dropLength, color]);

    useFrame((state) => {
        if (material.uniforms) {
            material.uniforms.uTime.value = state.clock.elapsedTime;
            material.uniforms.uIntensity.value = intensity;
            material.uniforms.uWind.value.copy(wind);
        }
        if (meshRef.current) {
            meshRef.current.position.set(camera.position.x, 0, camera.position.z);
        }
    });

    useEffect(() => {
        return () => {
            geometry.dispose();
            material.dispose();
        };
    }, [geometry, material]);

    return <mesh ref={meshRef} geometry={geometry} material={material} frustumCulled={false} />;
}

export interface SnowProps {
    count?: number;
    areaSize?: number;
    height?: number;
    intensity?: number;
    wind?: THREE.Vector3;
    color?: THREE.ColorRepresentation;
    flakeSize?: number;
}

export function Snow({
    count = 5000,
    areaSize = 50,
    height = 30,
    intensity = 1,
    wind = new THREE.Vector3(0.3, 0, 0.1),
    color = 0xffffff,
    flakeSize = 0.15,
}: SnowProps) {
    const meshRef = useRef<THREE.Mesh>(null);
    const { camera } = useThree();

    const { geometry, material } = useMemo(() => {
        const geo = new THREE.BufferGeometry();

        const positions: number[] = [];
        const uvs: number[] = [];
        const offsets: number[] = [];
        const speeds: number[] = [];
        const phases: number[] = [];
        const sizes: number[] = [];

        for (let i = 0; i < count; i++) {
            const s = flakeSize * (0.5 + Math.random() * 0.5);
            positions.push(-s, -s, 0, s, -s, 0, s, s, 0, -s, s, 0);
            uvs.push(0, 0, 1, 0, 1, 1, 0, 1);

            const ox = (Math.random() - 0.5) * areaSize;
            const oy = Math.random() * height;
            const oz = (Math.random() - 0.5) * areaSize;
            const size = 0.5 + Math.random() * 0.5;
            for (let j = 0; j < 4; j++) {
                offsets.push(ox, oy, oz);
                sizes.push(size);
            }

            const speed = 0.3 + Math.random() * 0.4;
            const phase = Math.random();
            for (let j = 0; j < 4; j++) {
                speeds.push(speed);
                phases.push(phase);
            }
        }

        const indices: number[] = [];
        for (let i = 0; i < count; i++) {
            const base = i * 4;
            indices.push(base, base + 1, base + 2, base, base + 2, base + 3);
        }

        geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
        geo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
        geo.setAttribute('offset', new THREE.Float32BufferAttribute(offsets, 3));
        geo.setAttribute('speed', new THREE.Float32BufferAttribute(speeds, 1));
        geo.setAttribute('phase', new THREE.Float32BufferAttribute(phases, 1));
        geo.setAttribute('size', new THREE.Float32BufferAttribute(sizes, 1));
        geo.setIndex(indices);

        const mat = new THREE.ShaderMaterial({
            vertexShader: SNOW_VERTEX_SHADER,
            fragmentShader: SNOW_FRAGMENT_SHADER,
            uniforms: {
                uTime: { value: 0 },
                uWind: { value: wind.clone() },
                uIntensity: { value: intensity },
                uAreaSize: { value: areaSize },
                uHeight: { value: height },
                uColor: { value: new THREE.Color(color) },
            },
            transparent: true,
            depthWrite: false,
            side: THREE.DoubleSide,
        });

        return { geometry: geo, material: mat };
    }, [count, areaSize, height, flakeSize, color]);

    useFrame((state) => {
        if (material.uniforms) {
            material.uniforms.uTime.value = state.clock.elapsedTime;
            material.uniforms.uIntensity.value = intensity;
            material.uniforms.uWind.value.copy(wind);
        }
        if (meshRef.current) {
            meshRef.current.position.set(camera.position.x, 0, camera.position.z);
        }
    });

    useEffect(() => {
        return () => {
            geometry.dispose();
            material.dispose();
        };
    }, [geometry, material]);

    return <mesh ref={meshRef} geometry={geometry} material={material} frustumCulled={false} />;
}

export interface LightningProps {
    active?: boolean;
    frequency?: number;
    boltColor?: THREE.ColorRepresentation;
    flashColor?: THREE.ColorRepresentation;
    flashIntensity?: number;
    onStrike?: () => void;
}

export function Lightning({
    active = true,
    frequency = 0.1,
    boltColor = 0xccccff,
    flashColor = 0xffffff,
    flashIntensity = 2,
    onStrike,
}: LightningProps) {
    const [flash, setFlash] = useState(0);
    const [boltLine, setBoltLine] = useState<THREE.Line | null>(null);
    const lastStrike = useRef(0);
    const overlayRef = useRef<THREE.Mesh>(null);
    const groupRef = useRef<THREE.Group>(null);

    const boltMaterial = useMemo(() => {
        return new THREE.LineBasicMaterial({
            color: new THREE.Color(boltColor),
            linewidth: 2,
            transparent: true,
            opacity: 1,
        });
    }, [boltColor]);

    const flashMaterial = useMemo(() => {
        return new THREE.MeshBasicMaterial({
            color: new THREE.Color(flashColor),
            transparent: true,
            opacity: 0,
            depthTest: false,
        });
    }, [flashColor]);

    const generateBolt = (start: THREE.Vector3, end: THREE.Vector3, segments: number = 8): THREE.Vector3[] => {
        const points: THREE.Vector3[] = [start.clone()];
        const direction = end.clone().sub(start);
        const segmentLength = direction.length() / segments;
        direction.normalize();

        let current = start.clone();
        for (let i = 1; i < segments; i++) {
            current = current.clone().add(direction.clone().multiplyScalar(segmentLength));
            const offset = new THREE.Vector3(
                (Math.random() - 0.5) * 5,
                (Math.random() - 0.5) * 2,
                (Math.random() - 0.5) * 5
            );
            points.push(current.clone().add(offset));
        }
        points.push(end.clone());

        return points;
    };

    useFrame((state, delta) => {
        if (!active) {
            setFlash(0);
            if (boltLine && groupRef.current) {
                groupRef.current.remove(boltLine);
                boltLine.geometry.dispose();
                setBoltLine(null);
            }
            return;
        }

        const timeSinceLastStrike = state.clock.elapsedTime - lastStrike.current;
        const strikeChance = frequency * delta;

        if (timeSinceLastStrike > 2 && Math.random() < strikeChance) {
            const startX = (Math.random() - 0.5) * 100;
            const startZ = (Math.random() - 0.5) * 100;
            const startPoint = new THREE.Vector3(startX, 50, startZ);
            const endPoint = new THREE.Vector3(startX + (Math.random() - 0.5) * 20, 0, startZ + (Math.random() - 0.5) * 20);

            const boltPoints = generateBolt(startPoint, endPoint);
            
            if (boltLine && groupRef.current) {
                groupRef.current.remove(boltLine);
                boltLine.geometry.dispose();
            }

            const geometry = new THREE.BufferGeometry().setFromPoints(boltPoints);
            const line = new THREE.Line(geometry, boltMaterial);
            setBoltLine(line);
            
            if (groupRef.current) {
                groupRef.current.add(line);
            }

            setFlash(flashIntensity);
            lastStrike.current = state.clock.elapsedTime;
            onStrike?.();
        }

        if (flash > 0) {
            setFlash(prev => Math.max(0, prev - delta * 8));
        }

        if (boltLine && flash <= 0.1 && groupRef.current) {
            groupRef.current.remove(boltLine);
            boltLine.geometry.dispose();
            setBoltLine(null);
        }

        if (flashMaterial) {
            flashMaterial.opacity = Math.min(flash * 0.3, 0.5);
        }

        if (boltLine) {
            boltMaterial.opacity = flash / flashIntensity;
        }
    });

    useEffect(() => {
        return () => {
            boltMaterial.dispose();
            flashMaterial.dispose();
            if (boltLine) {
                boltLine.geometry.dispose();
            }
        };
    }, [boltMaterial, flashMaterial, boltLine]);

    return (
        <>
            <group ref={groupRef} />
            <mesh ref={overlayRef} renderOrder={1000}>
                <planeGeometry args={[2, 2]} />
                <primitive object={flashMaterial} attach="material" />
            </mesh>
        </>
    );
}

export interface WeatherSystemProps {
    weather?: Partial<WeatherStateConfig>;
    rainCount?: number;
    snowCount?: number;
    areaSize?: number;
    height?: number;
    enableLightning?: boolean;
}

export function WeatherSystem({
    weather,
    rainCount = 10000,
    snowCount = 5000,
    areaSize = 50,
    height = 30,
    enableLightning = true,
}: WeatherSystemProps) {
    const state: WeatherStateConfig = {
        type: 'clear',
        intensity: 0,
        windDirection: new THREE.Vector3(1, 0, 0),
        windIntensity: 0,
        temperature: 20,
        visibility: 1,
        cloudCoverage: 0,
        precipitationRate: 0,
        ...weather,
    };

    const wind = state.windDirection.clone().multiplyScalar(state.windIntensity);
    const showRain = (state.type === 'rain' || state.type === 'storm') && state.temperature > 0;
    const showSnow = (state.type === 'snow' || ((state.type === 'rain' || state.type === 'storm') && state.temperature <= 0));
    const showLightning = enableLightning && state.type === 'storm' && state.intensity > 0.5;

    return (
        <>
            {showRain && (
                <Rain
                    count={Math.floor(rainCount * state.intensity)}
                    areaSize={areaSize}
                    height={height}
                    intensity={state.intensity}
                    wind={wind}
                />
            )}
            {showSnow && (
                <Snow
                    count={Math.floor(snowCount * state.intensity)}
                    areaSize={areaSize}
                    height={height}
                    intensity={state.intensity}
                    wind={wind.clone().multiplyScalar(0.5)}
                />
            )}
            {showLightning && (
                <Lightning
                    active={true}
                    frequency={0.05 + state.intensity * 0.1}
                    flashIntensity={1 + state.intensity}
                />
            )}
        </>
    );
}
