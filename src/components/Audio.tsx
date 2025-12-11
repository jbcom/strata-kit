/**
 * Audio Components
 *
 * React components for spatial audio in Three.js scenes.
 */

import { useRef, useEffect, useImperativeHandle, forwardRef, createContext, useContext, useMemo, useCallback, useState } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import {
    AudioManager,
    AudioSource,
    AmbientSource,
    AudioSourceConfig,
    EnvironmentConfig,
    DistanceModel,
    createAudioManager,
} from '../core/audio';

export interface AudioContextValue {
    manager: AudioManager;
    isReady: boolean;
}

const AudioContext = createContext<AudioContextValue | null>(null);

export function useAudioContext(): AudioContextValue {
    const context = useContext(AudioContext);
    if (!context) {
        throw new Error('useAudioContext must be used within an AudioProvider');
    }
    return context;
}

export function useAudioManager(): AudioManager | null {
    const context = useContext(AudioContext);
    return context?.manager ?? null;
}

export interface AudioProviderProps {
    children: React.ReactNode;
    maxSounds?: number;
    enableHRTF?: boolean;
}

export function AudioProvider({ children, maxSounds = 32, enableHRTF = true }: AudioProviderProps) {
    const [isReady, setIsReady] = useState(false);
    const managerRef = useRef<AudioManager | null>(null);

    useEffect(() => {
        managerRef.current = createAudioManager({ maxSounds, enableHRTF });
        setIsReady(true);

        const handleUserInteraction = async () => {
            await managerRef.current?.resume();
            document.removeEventListener('click', handleUserInteraction);
            document.removeEventListener('keydown', handleUserInteraction);
        };

        document.addEventListener('click', handleUserInteraction);
        document.addEventListener('keydown', handleUserInteraction);

        return () => {
            document.removeEventListener('click', handleUserInteraction);
            document.removeEventListener('keydown', handleUserInteraction);
            managerRef.current?.dispose();
        };
    }, [maxSounds, enableHRTF]);

    const value = useMemo(() => ({
        manager: managerRef.current!,
        isReady,
    }), [isReady]);

    if (!isReady) return null;

    return <AudioContext.Provider value={value}>{children}</AudioContext.Provider>;
}

export interface AudioListenerProps {
    camera?: THREE.Camera;
}

export function AudioListener({ camera: propCamera }: AudioListenerProps) {
    const { camera: defaultCamera } = useThree();
    const manager = useAudioManager();
    const camera = propCamera ?? defaultCamera;
    const forward = useRef(new THREE.Vector3());
    const up = useRef(new THREE.Vector3());

    useFrame(() => {
        if (!manager) return;

        manager.setListenerPosition(camera.position.x, camera.position.y, camera.position.z);

        camera.getWorldDirection(forward.current);
        camera.up.normalize();
        up.current.copy(camera.up);

        manager.setListenerOrientation(
            forward.current.x,
            forward.current.y,
            forward.current.z,
            up.current.x,
            up.current.y,
            up.current.z
        );
    });

    return null;
}

export interface PositionalAudioProps {
    url: string;
    position?: [number, number, number];
    loop?: boolean;
    autoplay?: boolean;
    volume?: number;
    refDistance?: number;
    maxDistance?: number;
    rolloffFactor?: number;
    distanceModel?: DistanceModel;
    playbackRate?: number;
    onLoad?: () => void;
    onEnd?: () => void;
}

export interface PositionalAudioRef {
    play: () => void;
    pause: () => void;
    stop: () => void;
    setVolume: (volume: number, fadeTime?: number) => void;
    setPosition: (x: number, y: number, z: number) => void;
    isPlaying: () => boolean;
}

export const PositionalAudio = forwardRef<PositionalAudioRef, PositionalAudioProps>(({
    url,
    position = [0, 0, 0],
    loop = false,
    autoplay = false,
    volume = 1,
    refDistance = 1,
    maxDistance = 10000,
    rolloffFactor = 1,
    distanceModel = 'inverse',
    playbackRate = 1,
    onLoad,
    onEnd,
}, ref) => {
    const manager = useAudioManager();
    const sourceRef = useRef<AudioSource | null>(null);
    const idRef = useRef(`positional-${Math.random().toString(36).substr(2, 9)}`);

    useEffect(() => {
        if (!manager) return;

        const config: AudioSourceConfig = {
            url,
            loop,
            volume,
            refDistance,
            maxDistance,
            rolloffFactor,
            distanceModel,
            playbackRate,
        };

        manager.createPositionalSound(idRef.current, config).then((source) => {
            sourceRef.current = source;
            source.setPosition(position[0], position[1], position[2]);
            onLoad?.();

            if (autoplay) {
                manager.resume().then(() => source.play());
            }
        });

        return () => {
            manager.removeSource(idRef.current);
            sourceRef.current = null;
        };
    }, [url, manager]);

    useEffect(() => {
        if (sourceRef.current) {
            sourceRef.current.setPosition(position[0], position[1], position[2]);
        }
    }, [position[0], position[1], position[2]]);

    useEffect(() => {
        if (sourceRef.current) {
            sourceRef.current.setVolume(volume);
        }
    }, [volume]);

    useImperativeHandle(ref, () => ({
        play: () => {
            manager?.resume().then(() => sourceRef.current?.play());
        },
        pause: () => sourceRef.current?.pause(),
        stop: () => sourceRef.current?.stop(),
        setVolume: (vol: number, fadeTime?: number) => sourceRef.current?.setVolume(vol, fadeTime),
        setPosition: (x: number, y: number, z: number) => sourceRef.current?.setPosition(x, y, z),
        isPlaying: () => sourceRef.current?.getIsPlaying() ?? false,
    }), [manager]);

    return null;
});

PositionalAudio.displayName = 'PositionalAudio';

export interface AmbientAudioProps {
    url: string;
    volume?: number;
    loop?: boolean;
    autoplay?: boolean;
    fadeTime?: number;
    onLoad?: () => void;
}

export interface AmbientAudioRef {
    play: () => void;
    stop: () => void;
    fadeIn: (duration: number) => void;
    fadeOut: (duration: number) => void;
    setVolume: (volume: number, fadeTime?: number) => void;
    isPlaying: () => boolean;
}

export const AmbientAudio = forwardRef<AmbientAudioRef, AmbientAudioProps>(({
    url,
    volume = 1,
    loop = true,
    autoplay = false,
    fadeTime = 0,
    onLoad,
}, ref) => {
    const manager = useAudioManager();
    const sourceRef = useRef<AmbientSource | null>(null);
    const idRef = useRef(`ambient-${Math.random().toString(36).substr(2, 9)}`);

    useEffect(() => {
        if (!manager) return;

        manager.createAmbientSound(idRef.current, url, volume, loop).then((source) => {
            sourceRef.current = source;
            onLoad?.();

            if (autoplay) {
                manager.resume().then(() => {
                    if (fadeTime > 0) {
                        source.fadeIn(fadeTime);
                    } else {
                        source.play();
                    }
                });
            }
        });

        return () => {
            manager.removeAmbientSource(idRef.current);
            sourceRef.current = null;
        };
    }, [url, manager]);

    useEffect(() => {
        if (sourceRef.current) {
            sourceRef.current.setVolume(volume);
        }
    }, [volume]);

    useImperativeHandle(ref, () => ({
        play: () => {
            manager?.resume().then(() => sourceRef.current?.play());
        },
        stop: () => sourceRef.current?.stop(),
        fadeIn: (duration: number) => {
            manager?.resume().then(() => sourceRef.current?.fadeIn(duration));
        },
        fadeOut: (duration: number) => sourceRef.current?.fadeOut(duration),
        setVolume: (vol: number, fadeTime?: number) => sourceRef.current?.setVolume(vol, fadeTime),
        isPlaying: () => sourceRef.current?.getIsPlaying() ?? false,
    }), [manager]);

    return null;
});

AmbientAudio.displayName = 'AmbientAudio';

export interface AudioZoneProps {
    position?: [number, number, number];
    geometry: 'box' | 'sphere';
    size?: [number, number, number];
    radius?: number;
    audioUrl?: string;
    audioVolume?: number;
    audioLoop?: boolean;
    fadeTime?: number;
    onEnter?: () => void;
    onExit?: () => void;
    debug?: boolean;
    children?: React.ReactNode;
}

export interface AudioZoneRef {
    isInside: () => boolean;
    getAudio: () => AmbientAudioRef | null;
}

export const AudioZone = forwardRef<AudioZoneRef, AudioZoneProps>(({
    position = [0, 0, 0],
    geometry,
    size = [10, 10, 10],
    radius = 5,
    audioUrl,
    audioVolume = 1,
    audioLoop = true,
    fadeTime = 0.5,
    onEnter,
    onExit,
    debug = false,
    children,
}, ref) => {
    const manager = useAudioManager();
    const audioRef = useRef<AmbientAudioRef>(null);
    const isInsideRef = useRef(false);
    const meshRef = useRef<THREE.Mesh>(null);
    const boundingBox = useRef(new THREE.Box3());
    const boundingSphere = useRef(new THREE.Sphere());

    useEffect(() => {
        const pos = new THREE.Vector3(...position);
        if (geometry === 'box') {
            const halfSize = new THREE.Vector3(size[0] / 2, size[1] / 2, size[2] / 2);
            boundingBox.current.setFromCenterAndSize(pos, new THREE.Vector3(size[0], size[1], size[2]));
        } else {
            boundingSphere.current.set(pos, radius);
        }
    }, [position, size, radius, geometry]);

    useFrame(() => {
        if (!manager) return;

        const listenerPos = manager.getListenerPosition();
        let inside = false;

        if (geometry === 'box') {
            inside = boundingBox.current.containsPoint(listenerPos);
        } else {
            inside = boundingSphere.current.containsPoint(listenerPos);
        }

        if (inside && !isInsideRef.current) {
            isInsideRef.current = true;
            onEnter?.();
            if (audioRef.current) {
                audioRef.current.fadeIn(fadeTime);
            }
        } else if (!inside && isInsideRef.current) {
            isInsideRef.current = false;
            onExit?.();
            if (audioRef.current) {
                audioRef.current.fadeOut(fadeTime);
            }
        }
    });

    useImperativeHandle(ref, () => ({
        isInside: () => isInsideRef.current,
        getAudio: () => audioRef.current,
    }), []);

    return (
        <>
            {debug && (
                <mesh ref={meshRef} position={position}>
                    {geometry === 'box' ? (
                        <boxGeometry args={size} />
                    ) : (
                        <sphereGeometry args={[radius, 16, 16]} />
                    )}
                    <meshBasicMaterial color={0x00ff00} wireframe transparent opacity={0.3} />
                </mesh>
            )}
            {audioUrl && (
                <AmbientAudio
                    ref={audioRef}
                    url={audioUrl}
                    volume={audioVolume}
                    loop={audioLoop}
                />
            )}
            {children}
        </>
    );
});

AudioZone.displayName = 'AudioZone';

export interface AudioEmitterProps {
    url: string;
    position?: [number, number, number];
    follow?: React.RefObject<THREE.Object3D>;
    loop?: boolean;
    autoplay?: boolean;
    volume?: number;
    refDistance?: number;
    maxDistance?: number;
    rolloffFactor?: number;
    distanceModel?: DistanceModel;
    onLoad?: () => void;
}

export interface AudioEmitterRef {
    play: () => void;
    stop: () => void;
    pause: () => void;
    setVolume: (volume: number, fadeTime?: number) => void;
    setPosition: (x: number, y: number, z: number) => void;
    isPlaying: () => boolean;
}

export const AudioEmitter = forwardRef<AudioEmitterRef, AudioEmitterProps>(({
    url,
    position = [0, 0, 0],
    follow,
    loop = false,
    autoplay = false,
    volume = 1,
    refDistance = 1,
    maxDistance = 10000,
    rolloffFactor = 1,
    distanceModel = 'inverse',
    onLoad,
}, ref) => {
    const manager = useAudioManager();
    const sourceRef = useRef<AudioSource | null>(null);
    const idRef = useRef(`emitter-${Math.random().toString(36).substr(2, 9)}`);
    const positionRef = useRef(new THREE.Vector3(...position));

    useEffect(() => {
        if (!manager) return;

        const config: AudioSourceConfig = {
            url,
            loop,
            volume,
            refDistance,
            maxDistance,
            rolloffFactor,
            distanceModel,
        };

        manager.createPositionalSound(idRef.current, config).then((source) => {
            sourceRef.current = source;
            source.setPosition(positionRef.current.x, positionRef.current.y, positionRef.current.z);
            onLoad?.();

            if (autoplay) {
                manager.resume().then(() => source.play());
            }
        });

        return () => {
            manager.removeSource(idRef.current);
            sourceRef.current = null;
        };
    }, [url, manager]);

    useFrame(() => {
        if (!sourceRef.current) return;

        if (follow?.current) {
            follow.current.getWorldPosition(positionRef.current);
            sourceRef.current.setPosition(
                positionRef.current.x,
                positionRef.current.y,
                positionRef.current.z
            );
        }
    });

    useEffect(() => {
        if (!follow && sourceRef.current) {
            positionRef.current.set(position[0], position[1], position[2]);
            sourceRef.current.setPosition(position[0], position[1], position[2]);
        }
    }, [position[0], position[1], position[2], follow]);

    useEffect(() => {
        if (sourceRef.current) {
            sourceRef.current.setVolume(volume);
        }
    }, [volume]);

    useImperativeHandle(ref, () => ({
        play: () => {
            manager?.resume().then(() => sourceRef.current?.play());
        },
        stop: () => sourceRef.current?.stop(),
        pause: () => sourceRef.current?.pause(),
        setVolume: (vol: number, fadeTime?: number) => sourceRef.current?.setVolume(vol, fadeTime),
        setPosition: (x: number, y: number, z: number) => {
            positionRef.current.set(x, y, z);
            sourceRef.current?.setPosition(x, y, z);
        },
        isPlaying: () => sourceRef.current?.getIsPlaying() ?? false,
    }), [manager]);

    return null;
});

AudioEmitter.displayName = 'AudioEmitter';

export interface AudioEnvironmentProps {
    type: 'outdoor' | 'indoor' | 'cave' | 'underwater' | 'none';
    reverbDecay?: number;
    reverbWet?: number;
    lowpassFrequency?: number;
    highpassFrequency?: number;
}

export function AudioEnvironment({
    type,
    reverbDecay,
    reverbWet,
    lowpassFrequency,
    highpassFrequency,
}: AudioEnvironmentProps) {
    const manager = useAudioManager();

    useEffect(() => {
        if (!manager) return;

        const config: EnvironmentConfig = {
            type,
            reverb: reverbDecay !== undefined || reverbWet !== undefined ? {
                decay: reverbDecay,
                wet: reverbWet,
                dry: reverbWet !== undefined ? 1 - reverbWet : undefined,
            } : undefined,
            lowpassFrequency,
            highpassFrequency,
        };

        manager.setEnvironment(config);
    }, [manager, type, reverbDecay, reverbWet, lowpassFrequency, highpassFrequency]);

    return null;
}

export interface FootstepAudioProps {
    surfaces: Record<string, string>;
    defaultSurface?: string;
    volume?: number;
    poolSize?: number;
}

export interface FootstepAudioRef {
    playFootstep: (surface?: string, position?: THREE.Vector3) => void;
}

export const FootstepAudio = forwardRef<FootstepAudioRef, FootstepAudioProps>(({
    surfaces,
    defaultSurface = 'default',
    volume = 1,
    poolSize = 4,
}, ref) => {
    const manager = useAudioManager();
    const poolsRef = useRef<Map<string, string>>(new Map());

    useEffect(() => {
        if (!manager) return;

        const loadPools = async () => {
            for (const [surface, url] of Object.entries(surfaces)) {
                const poolId = `footstep-${surface}`;
                await manager.createSoundPool(poolId, {
                    url,
                    poolSize,
                    config: { volume },
                });
                poolsRef.current.set(surface, poolId);
            }
        };

        loadPools();

        return () => {
            for (const poolId of poolsRef.current.values()) {
                manager.removeSoundPool(poolId);
            }
            poolsRef.current.clear();
        };
    }, [manager, surfaces, poolSize, volume]);

    useImperativeHandle(ref, () => ({
        playFootstep: (surface = defaultSurface, position?: THREE.Vector3) => {
            const poolId = poolsRef.current.get(surface) ?? poolsRef.current.get(defaultSurface);
            if (poolId && manager) {
                manager.resume().then(() => {
                    manager.playSoundFromPool(poolId, position);
                });
            }
        },
    }), [manager, defaultSurface]);

    return null;
});

FootstepAudio.displayName = 'FootstepAudio';

export interface WeatherAudioProps {
    rainUrl?: string;
    thunderUrl?: string;
    windUrl?: string;
    rainIntensity?: number;
    windIntensity?: number;
    thunderActive?: boolean;
    fadeTime?: number;
}

export function WeatherAudio({
    rainUrl,
    thunderUrl,
    windUrl,
    rainIntensity = 0,
    windIntensity = 0,
    thunderActive = false,
    fadeTime = 1,
}: WeatherAudioProps) {
    const manager = useAudioManager();
    const rainRef = useRef<AmbientAudioRef>(null);
    const windRef = useRef<AmbientAudioRef>(null);
    const thunderPoolIdRef = useRef<string | null>(null);
    const lastThunderTime = useRef(0);

    useEffect(() => {
        if (!manager || !thunderUrl) return;

        const poolId = `thunder-${Math.random().toString(36).substr(2, 9)}`;
        manager.createSoundPool(poolId, {
            url: thunderUrl,
            poolSize: 3,
            config: { volume: 1 },
        });
        thunderPoolIdRef.current = poolId;

        return () => {
            if (thunderPoolIdRef.current) {
                manager.removeSoundPool(thunderPoolIdRef.current);
            }
        };
    }, [manager, thunderUrl]);

    useEffect(() => {
        if (!rainRef.current) return;

        if (rainIntensity > 0) {
            rainRef.current.setVolume(rainIntensity, fadeTime);
            if (!rainRef.current.isPlaying()) {
                rainRef.current.fadeIn(fadeTime);
            }
        } else {
            rainRef.current.fadeOut(fadeTime);
        }
    }, [rainIntensity, fadeTime]);

    useEffect(() => {
        if (!windRef.current) return;

        if (windIntensity > 0) {
            windRef.current.setVolume(windIntensity, fadeTime);
            if (!windRef.current.isPlaying()) {
                windRef.current.fadeIn(fadeTime);
            }
        } else {
            windRef.current.fadeOut(fadeTime);
        }
    }, [windIntensity, fadeTime]);

    useFrame((state) => {
        if (!thunderActive || !thunderPoolIdRef.current || !manager) return;

        const timeSinceLast = state.clock.elapsedTime - lastThunderTime.current;
        if (timeSinceLast > 5 && Math.random() < 0.01) {
            manager.resume().then(() => {
                manager.playSoundFromPool(thunderPoolIdRef.current!);
            });
            lastThunderTime.current = state.clock.elapsedTime;
        }
    });

    return (
        <>
            {rainUrl && (
                <AmbientAudio
                    ref={rainRef}
                    url={rainUrl}
                    volume={0}
                    loop
                />
            )}
            {windUrl && (
                <AmbientAudio
                    ref={windRef}
                    url={windUrl}
                    volume={0}
                    loop
                />
            )}
        </>
    );
}
