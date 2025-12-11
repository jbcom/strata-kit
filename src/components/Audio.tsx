/**
 * Audio Components
 *
 * React components for spatial audio in Three.js scenes.
 * Provides positional audio, ambient audio, audio zones, and environmental effects.
 * @module components/Audio
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

/**
 * Context value provided by AudioProvider
 * 
 * @property manager - The AudioManager instance
 * @property isReady - Whether the audio system is initialized
 */
export interface AudioContextValue {
    manager: AudioManager;
    isReady: boolean;
}

const AudioContext = createContext<AudioContextValue | null>(null);

/**
 * Hook to access the audio context within an AudioProvider.
 * Must be used inside an AudioProvider component tree.
 * 
 * @example
 * ```tsx
 * function AudioControlPanel() {
 *   const { manager, isReady } = useAudioContext();
 *   // Control audio functionality
 * }
 * ```
 * 
 * @returns AudioContextValue with manager and ready state
 * @throws Error if used outside AudioProvider
 */
export function useAudioContext(): AudioContextValue {
    const context = useContext(AudioContext);
    if (!context) {
        throw new Error('useAudioContext must be used within an AudioProvider');
    }
    return context;
}

/**
 * Hook to get the AudioManager instance (nullable).
 * Safe to use without error when outside AudioProvider.
 * 
 * @example
 * ```tsx
 * function AudioControls() {
 *   const manager = useAudioManager();
 *   if (!manager) return null;
 *   // Use manager
 * }
 * ```
 * 
 * @returns AudioManager or null if not in context
 */
export function useAudioManager(): AudioManager | null {
    const context = useContext(AudioContext);
    return context?.manager ?? null;
}

/**
 * Props for the AudioProvider component
 * 
 * @property children - Child components that can use audio
 * @property maxSounds - Maximum concurrent sounds
 * @property enableHRTF - Enable head-related transfer function for spatial audio
 */
export interface AudioProviderProps {
    children: React.ReactNode;
    maxSounds?: number;
    enableHRTF?: boolean;
}

/**
 * Context provider that manages the audio system and handles autoplay restrictions.
 * Must wrap all audio-related components in your scene.
 * 
 * @example
 * ```tsx
 * <Canvas>
 *   <AudioProvider maxSounds={32} enableHRTF={true}>
 *     <AudioListener />
 *     <AmbientAudio url="/music/background.mp3" autoplay />
 *     <PositionalAudio url="/sfx/waterfall.mp3" position={[10, 0, 5]} />
 *   </AudioProvider>
 * </Canvas>
 * ```
 * 
 * @param props - AudioProviderProps
 * @returns Provider component for audio context
 */
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

/**
 * Props for the AudioListener component
 * 
 * @property camera - Optional custom camera (defaults to scene camera)
 */
export interface AudioListenerProps {
    camera?: THREE.Camera;
}

/**
 * Audio listener that syncs with the camera for 3D spatial audio.
 * Updates listener position and orientation each frame.
 * 
 * @example
 * ```tsx
 * // Use default scene camera
 * <AudioListener />
 * 
 * // Use custom camera
 * <AudioListener camera={customCameraRef.current} />
 * ```
 * 
 * @param props - AudioListenerProps
 * @returns null (logic only component)
 */
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

/**
 * Props for the PositionalAudio component
 * 
 * @property url - URL of the audio file
 * @property position - Position in 3D space [x, y, z]
 * @property loop - Whether to loop the audio
 * @property autoplay - Start playing immediately
 * @property volume - Volume level (0-1)
 * @property refDistance - Distance at which volume starts to decrease
 * @property maxDistance - Maximum audible distance
 * @property rolloffFactor - How quickly volume decreases with distance
 * @property distanceModel - Distance attenuation model
 * @property playbackRate - Playback speed multiplier
 * @property onLoad - Callback when audio loads
 * @property onEnd - Callback when audio ends
 */
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

/**
 * Ref interface for PositionalAudio imperative control
 * 
 * @property play - Start playback
 * @property pause - Pause playback
 * @property stop - Stop and reset playback
 * @property setVolume - Set volume with optional fade
 * @property setPosition - Update 3D position
 * @property isPlaying - Check if currently playing
 */
export interface PositionalAudioRef {
    play: () => void;
    pause: () => void;
    stop: () => void;
    setVolume: (volume: number, fadeTime?: number) => void;
    setPosition: (x: number, y: number, z: number) => void;
    isPlaying: () => boolean;
}

/**
 * 3D positional audio source with distance-based attenuation.
 * Sound volume decreases as the listener moves away from the source.
 * 
 * @example
 * ```tsx
 * // Waterfall sound at a fixed position
 * <PositionalAudio
 *   url="/sounds/waterfall.mp3"
 *   position={[10, 0, 5]}
 *   loop={true}
 *   autoplay={true}
 *   refDistance={5}
 *   maxDistance={50}
 * />
 * 
 * // Interactive sound with ref control
 * const audioRef = useRef<PositionalAudioRef>(null);
 * 
 * <PositionalAudio
 *   ref={audioRef}
 *   url="/sounds/bell.mp3"
 *   position={bellPosition}
 *   onLoad={() => console.log('Bell sound loaded')}
 * />
 * 
 * // Trigger sound
 * const ringBell = () => audioRef.current?.play();
 * ```
 * 
 * @param props - PositionalAudioProps configuration
 * @returns null (audio only component)
 */
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

/**
 * Props for the AmbientAudio component
 * 
 * @property url - URL of the audio file
 * @property volume - Volume level (0-1)
 * @property loop - Whether to loop the audio
 * @property autoplay - Start playing immediately
 * @property fadeTime - Duration for auto-fade on play
 * @property onLoad - Callback when audio loads
 */
export interface AmbientAudioProps {
    url: string;
    volume?: number;
    loop?: boolean;
    autoplay?: boolean;
    fadeTime?: number;
    onLoad?: () => void;
}

/**
 * Ref interface for AmbientAudio imperative control
 * 
 * @property play - Start playback
 * @property stop - Stop playback
 * @property fadeIn - Fade in over duration
 * @property fadeOut - Fade out over duration
 * @property setVolume - Set volume with optional fade
 * @property isPlaying - Check if currently playing
 */
export interface AmbientAudioRef {
    play: () => void;
    stop: () => void;
    fadeIn: (duration: number) => void;
    fadeOut: (duration: number) => void;
    setVolume: (volume: number, fadeTime?: number) => void;
    isPlaying: () => boolean;
}

/**
 * Non-positional ambient audio for background music and atmosphere.
 * Plays at constant volume regardless of listener position.
 * 
 * @example
 * ```tsx
 * // Background music
 * <AmbientAudio
 *   url="/music/ambient.mp3"
 *   volume={0.5}
 *   loop={true}
 *   autoplay={true}
 *   fadeTime={2}
 * />
 * 
 * // Controlled ambient sound
 * const ambientRef = useRef<AmbientAudioRef>(null);
 * 
 * <AmbientAudio
 *   ref={ambientRef}
 *   url="/music/exploration.mp3"
 *   loop={true}
 * />
 * 
 * // Fade in when entering area
 * const enterForest = () => ambientRef.current?.fadeIn(3);
 * const exitForest = () => ambientRef.current?.fadeOut(2);
 * ```
 * 
 * @param props - AmbientAudioProps configuration
 * @returns null (audio only component)
 */
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

/**
 * Props for the AudioZone component
 * 
 * @property position - Center position of the zone [x, y, z]
 * @property geometry - Zone shape ('box' or 'sphere')
 * @property size - Size for box zones [width, height, depth]
 * @property radius - Radius for sphere zones
 * @property audioUrl - Optional ambient audio to play in zone
 * @property audioVolume - Volume for zone audio
 * @property audioLoop - Whether zone audio loops
 * @property fadeTime - Fade duration when entering/exiting
 * @property onEnter - Callback when listener enters zone
 * @property onExit - Callback when listener exits zone
 * @property debug - Show zone visualization
 * @property children - Child components
 */
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

/**
 * Ref interface for AudioZone
 * 
 * @property isInside - Check if listener is inside zone
 * @property getAudio - Get the zone's audio ref
 */
export interface AudioZoneRef {
    isInside: () => boolean;
    getAudio: () => AmbientAudioRef | null;
}

/**
 * Spatial audio zone that triggers audio when listener enters.
 * Automatically fades audio in/out based on listener position.
 * 
 * @example
 * ```tsx
 * // Cave zone with echo audio
 * <AudioZone
 *   position={[0, 0, -20]}
 *   geometry="sphere"
 *   radius={15}
 *   audioUrl="/sounds/cave-ambience.mp3"
 *   fadeTime={1}
 *   onEnter={() => setEnvironment('cave')}
 *   onExit={() => setEnvironment('outdoor')}
 * />
 * 
 * // Debug visualization
 * <AudioZone
 *   position={[10, 0, 10]}
 *   geometry="box"
 *   size={[20, 10, 20]}
 *   audioUrl="/sounds/market.mp3"
 *   debug={true}
 * />
 * ```
 * 
 * @param props - AudioZoneProps configuration
 * @returns React element with optional visualization
 */
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

/**
 * Props for the AudioEmitter component
 * 
 * @property url - URL of the audio file
 * @property position - Static position [x, y, z]
 * @property follow - Object to follow for dynamic position
 * @property loop - Whether to loop
 * @property autoplay - Start playing immediately
 * @property volume - Volume level (0-1)
 * @property refDistance - Distance at which volume starts decreasing
 * @property maxDistance - Maximum audible distance
 * @property rolloffFactor - Distance attenuation factor
 * @property distanceModel - Attenuation curve type
 * @property onLoad - Callback when loaded
 */
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

/**
 * Ref interface for AudioEmitter
 */
export interface AudioEmitterRef {
    play: () => void;
    stop: () => void;
    pause: () => void;
    setVolume: (volume: number, fadeTime?: number) => void;
    setPosition: (x: number, y: number, z: number) => void;
    isPlaying: () => boolean;
}

/**
 * Positional audio emitter that can follow an object.
 * Useful for sounds attached to moving entities.
 * 
 * @example
 * ```tsx
 * // Engine sound following a car
 * const carRef = useRef<THREE.Group>(null);
 * 
 * <group ref={carRef}>
 *   <Car />
 * </group>
 * <AudioEmitter
 *   url="/sounds/engine.mp3"
 *   follow={carRef}
 *   loop={true}
 *   autoplay={true}
 *   refDistance={5}
 * />
 * 
 * // Footsteps following player
 * <AudioEmitter
 *   url="/sounds/footsteps.mp3"
 *   follow={playerRef}
 *   loop={true}
 *   volume={0.6}
 * />
 * ```
 * 
 * @param props - AudioEmitterProps configuration
 * @returns null (audio only component)
 */
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

/**
 * Props for the AudioEnvironment component
 * 
 * @property type - Environment preset
 * @property reverbDecay - Reverb decay time in seconds
 * @property reverbWet - Reverb wet/dry mix (0-1)
 * @property lowpassFrequency - Low pass filter frequency
 * @property highpassFrequency - High pass filter frequency
 */
export interface AudioEnvironmentProps {
    type: 'outdoor' | 'indoor' | 'cave' | 'underwater' | 'none';
    reverbDecay?: number;
    reverbWet?: number;
    lowpassFrequency?: number;
    highpassFrequency?: number;
}

/**
 * Audio environment component for reverb and filter effects.
 * Applies global audio processing based on environment type.
 * 
 * @example
 * ```tsx
 * // Cave environment with echo
 * <AudioEnvironment
 *   type="cave"
 *   reverbDecay={4}
 *   reverbWet={0.6}
 * />
 * 
 * // Underwater muffled sound
 * <AudioEnvironment
 *   type="underwater"
 *   lowpassFrequency={800}
 * />
 * 
 * // Dynamic environment switching
 * <AudioEnvironment
 *   type={isIndoors ? 'indoor' : 'outdoor'}
 * />
 * ```
 * 
 * @param props - AudioEnvironmentProps configuration
 * @returns null (effect only component)
 */
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

/**
 * Props for the FootstepAudio component
 * 
 * @property surfaces - Map of surface type to audio URL
 * @property defaultSurface - Fallback surface type
 * @property volume - Footstep volume
 * @property poolSize - Sound pool size per surface
 */
export interface FootstepAudioProps {
    surfaces: Record<string, string>;
    defaultSurface?: string;
    volume?: number;
    poolSize?: number;
}

/**
 * Ref interface for FootstepAudio
 * 
 * @property playFootstep - Play footstep sound for a surface type
 */
export interface FootstepAudioRef {
    playFootstep: (surface?: string, position?: THREE.Vector3) => void;
}

/**
 * Footstep audio system with multiple surface types and sound pooling.
 * Prevents audio overlap with reusable sound pools.
 * 
 * @example
 * ```tsx
 * const footstepRef = useRef<FootstepAudioRef>(null);
 * 
 * <FootstepAudio
 *   ref={footstepRef}
 *   surfaces={{
 *     grass: '/sounds/footstep-grass.mp3',
 *     stone: '/sounds/footstep-stone.mp3',
 *     wood: '/sounds/footstep-wood.mp3',
 *     metal: '/sounds/footstep-metal.mp3'
 *   }}
 *   defaultSurface="stone"
 *   volume={0.7}
 *   poolSize={4}
 * />
 * 
 * // Trigger footstep based on ground type
 * const onStep = () => {
 *   const surface = detectGroundMaterial();
 *   footstepRef.current?.playFootstep(surface, playerPosition);
 * };
 * ```
 * 
 * @param props - FootstepAudioProps configuration
 * @returns null (audio only component)
 */
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

/**
 * Props for the WeatherAudio component
 * 
 * @property rainUrl - Rain sound URL
 * @property thunderUrl - Thunder sound URL
 * @property windUrl - Wind sound URL
 * @property rainIntensity - Rain volume (0-1)
 * @property windIntensity - Wind volume (0-1)
 * @property thunderActive - Enable random thunder
 * @property fadeTime - Volume fade duration
 */
export interface WeatherAudioProps {
    rainUrl?: string;
    thunderUrl?: string;
    windUrl?: string;
    rainIntensity?: number;
    windIntensity?: number;
    thunderActive?: boolean;
    fadeTime?: number;
}

/**
 * Weather audio system for rain, wind, and thunder effects.
 * Volumes can be dynamically adjusted based on weather intensity.
 * 
 * @example
 * ```tsx
 * // Storm with dynamic intensity
 * const [stormIntensity, setStormIntensity] = useState(0);
 * 
 * <WeatherAudio
 *   rainUrl="/sounds/rain-loop.mp3"
 *   windUrl="/sounds/wind-loop.mp3"
 *   thunderUrl="/sounds/thunder.mp3"
 *   rainIntensity={stormIntensity * 0.8}
 *   windIntensity={stormIntensity * 0.5}
 *   thunderActive={stormIntensity > 0.7}
 *   fadeTime={2}
 * />
 * 
 * // Gentle rain
 * <WeatherAudio
 *   rainUrl="/sounds/light-rain.mp3"
 *   rainIntensity={0.4}
 * />
 * ```
 * 
 * @param props - WeatherAudioProps configuration
 * @returns React element with ambient audio components
 */
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
