/**
 * GPU-Based Particle System React Components
 *
 * Provides React components for particle effects using GPU-instanced rendering.
 */

import { useRef, useEffect, forwardRef, useImperativeHandle } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import {
    ParticleEmitter as CoreParticleEmitter,
    ParticleEmitterConfig,
    EmissionShape,
    ParticleForces,
    ParticleBehavior,
    EmitterShapeParams,
} from '../core/particles';

export type { EmissionShape, ParticleForces, ParticleBehavior, EmitterShapeParams };

export interface ParticleEmitterProps {
    position?: [number, number, number] | THREE.Vector3;
    positionVariance?: [number, number, number] | THREE.Vector3;
    velocity?: [number, number, number] | THREE.Vector3;
    velocityVariance?: [number, number, number] | THREE.Vector3;
    maxParticles?: number;
    emissionRate?: number;
    lifetime?: number;
    lifetimeVariance?: number;
    startColor?: THREE.ColorRepresentation;
    endColor?: THREE.ColorRepresentation;
    startSize?: number;
    endSize?: number;
    sizeVariance?: number;
    startOpacity?: number;
    endOpacity?: number;
    shape?: EmissionShape;
    shapeParams?: EmitterShapeParams;
    forces?: ParticleForces;
    behavior?: ParticleBehavior;
    texture?: THREE.Texture;
    blending?: THREE.Blending;
    depthWrite?: boolean;
    sortParticles?: boolean;
    autoStart?: boolean;
    paused?: boolean;
}

export interface ParticleEmitterRef {
    emitter: CoreParticleEmitter;
    emit: (count: number) => void;
    burst: (count: number) => void;
    reset: () => void;
    setPosition: (position: THREE.Vector3) => void;
    setEmissionRate: (rate: number) => void;
}

function toVector3(value: [number, number, number] | THREE.Vector3 | undefined, defaultValue: THREE.Vector3): THREE.Vector3 {
    if (!value) return defaultValue;
    if (value instanceof THREE.Vector3) return value.clone();
    return new THREE.Vector3(value[0], value[1], value[2]);
}

export const ParticleEmitter = forwardRef<ParticleEmitterRef, ParticleEmitterProps>(({
    position = [0, 0, 0],
    positionVariance,
    velocity = [0, 1, 0],
    velocityVariance,
    maxParticles = 1000,
    emissionRate = 100,
    lifetime = 2.0,
    lifetimeVariance = 0.2,
    startColor = 0xffffff,
    endColor = 0xffffff,
    startSize = 0.1,
    endSize = 0.05,
    sizeVariance = 0.2,
    startOpacity = 1.0,
    endOpacity = 0.0,
    shape = 'point',
    shapeParams,
    forces,
    behavior,
    texture,
    blending = THREE.AdditiveBlending,
    depthWrite = false,
    sortParticles = false,
    autoStart = true,
    paused = false,
}, ref) => {
    const emitterRef = useRef<CoreParticleEmitter | null>(null);
    const groupRef = useRef<THREE.Group>(null);
    
    useEffect(() => {
        const config: ParticleEmitterConfig = {
            maxParticles,
            emissionRate: autoStart ? emissionRate : 0,
            lifetime,
            lifetimeVariance,
            position: toVector3(position, new THREE.Vector3(0, 0, 0)),
            positionVariance: toVector3(positionVariance, new THREE.Vector3(0, 0, 0)),
            velocity: toVector3(velocity, new THREE.Vector3(0, 1, 0)),
            velocityVariance: toVector3(velocityVariance, new THREE.Vector3(0.5, 0.5, 0.5)),
            startColor,
            endColor,
            startSize,
            endSize,
            sizeVariance,
            startOpacity,
            endOpacity,
            shape,
            shapeParams: shapeParams ? {
                ...shapeParams,
                direction: shapeParams.direction instanceof THREE.Vector3 
                    ? shapeParams.direction 
                    : shapeParams.direction 
                        ? new THREE.Vector3(...(shapeParams.direction as unknown as [number, number, number]))
                        : undefined,
            } : undefined,
            forces: forces ? {
                ...forces,
                gravity: forces.gravity instanceof THREE.Vector3 
                    ? forces.gravity 
                    : forces.gravity 
                        ? new THREE.Vector3(...(forces.gravity as unknown as [number, number, number]))
                        : undefined,
                wind: forces.wind instanceof THREE.Vector3 
                    ? forces.wind 
                    : forces.wind 
                        ? new THREE.Vector3(...(forces.wind as unknown as [number, number, number]))
                        : undefined,
            } : undefined,
            behavior,
            texture,
            blending,
            depthWrite,
            sortParticles,
        };
        
        const emitter = new CoreParticleEmitter(config);
        emitterRef.current = emitter;
        
        if (groupRef.current) {
            groupRef.current.add(emitter.mesh);
        }
        
        return () => {
            if (groupRef.current && emitter.mesh.parent === groupRef.current) {
                groupRef.current.remove(emitter.mesh);
            }
            emitter.dispose();
        };
    }, []);
    
    useEffect(() => {
        if (emitterRef.current) {
            emitterRef.current.setEmissionRate(paused ? 0 : emissionRate);
        }
    }, [paused, emissionRate]);
    
    useEffect(() => {
        if (emitterRef.current) {
            emitterRef.current.setPosition(toVector3(position, new THREE.Vector3(0, 0, 0)));
        }
    }, [position]);
    
    useImperativeHandle(ref, () => ({
        get emitter() {
            return emitterRef.current!;
        },
        emit(count: number) {
            emitterRef.current?.emit(count);
        },
        burst(count: number) {
            emitterRef.current?.burst(count);
        },
        reset() {
            emitterRef.current?.reset();
        },
        setPosition(pos: THREE.Vector3) {
            emitterRef.current?.setPosition(pos);
        },
        setEmissionRate(rate: number) {
            emitterRef.current?.setEmissionRate(rate);
        },
    }));
    
    useFrame((_, delta) => {
        if (emitterRef.current && !paused) {
            emitterRef.current.update(delta);
        }
    });
    
    return <group ref={groupRef} />;
});

ParticleEmitter.displayName = 'ParticleEmitter';

export interface ParticleBurstProps extends Omit<ParticleEmitterProps, 'emissionRate' | 'autoStart'> {
    count?: number;
    trigger?: boolean | number;
    onComplete?: () => void;
}

export const ParticleBurst = forwardRef<ParticleEmitterRef, ParticleBurstProps>(({
    count = 100,
    trigger = false,
    onComplete,
    ...props
}, ref) => {
    const emitterRef = useRef<ParticleEmitterRef>(null);
    const lastTrigger = useRef<boolean | number>(false);
    
    useImperativeHandle(ref, () => emitterRef.current!);
    
    useEffect(() => {
        if (trigger !== lastTrigger.current && trigger) {
            emitterRef.current?.burst(count);
            lastTrigger.current = trigger;
        }
    }, [trigger, count]);
    
    return (
        <ParticleEmitter
            ref={emitterRef}
            {...props}
            emissionRate={0}
            autoStart={false}
        />
    );
});

ParticleBurst.displayName = 'ParticleBurst';
