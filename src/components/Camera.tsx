/**
 * Camera components for Strata
 * 
 * React Three Fiber camera components with various behaviors.
 */

import { useRef, useEffect, useMemo, useCallback, forwardRef, useImperativeHandle } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import { OrbitControls, PerspectiveCamera } from '@react-three/drei';
import * as THREE from 'three';
import {
    lerp,
    lerpVector3,
    smoothDampVector3,
    CameraShake as CameraShakeCore,
    FOVTransition,
    evaluateCatmullRom,
    calculateLookAhead,
    calculateHeadBob,
    easeInOutCubic,
} from '../core/camera';

export interface FollowCameraProps {
    target: THREE.Vector3 | React.RefObject<THREE.Object3D>;
    offset?: [number, number, number];
    smoothTime?: number;
    lookAheadDistance?: number;
    lookAheadSmoothing?: number;
    rotationSmoothing?: number;
    fov?: number;
    makeDefault?: boolean;
}

export interface FollowCameraRef {
    getCamera: () => THREE.PerspectiveCamera | null;
    setOffset: (offset: [number, number, number]) => void;
}

export const FollowCamera = forwardRef<FollowCameraRef, FollowCameraProps>(({
    target,
    offset = [0, 5, 10],
    smoothTime = 0.3,
    lookAheadDistance = 2,
    lookAheadSmoothing = 0.5,
    rotationSmoothing = 0.1,
    fov = 60,
    makeDefault = true,
}, ref) => {
    const cameraRef = useRef<THREE.PerspectiveCamera>(null);
    const velocityRef = useRef(new THREE.Vector3());
    const currentLookAhead = useRef(new THREE.Vector3());
    const lastTargetPos = useRef(new THREE.Vector3());
    const currentOffset = useRef(new THREE.Vector3(...offset));
    
    useImperativeHandle(ref, () => ({
        getCamera: () => cameraRef.current,
        setOffset: (newOffset: [number, number, number]) => {
            currentOffset.current.set(...newOffset);
        }
    }));
    
    const getTargetPosition = useCallback((): THREE.Vector3 => {
        if (target instanceof THREE.Vector3) {
            return target;
        }
        if (target.current) {
            return target.current.position;
        }
        return new THREE.Vector3();
    }, [target]);
    
    useFrame((_, delta) => {
        if (!cameraRef.current) return;
        
        const targetPos = getTargetPosition();
        const targetVelocity = targetPos.clone().sub(lastTargetPos.current).divideScalar(Math.max(delta, 0.001));
        lastTargetPos.current.copy(targetPos);
        
        const lookAhead = calculateLookAhead(
            targetVelocity,
            lookAheadDistance,
            lookAheadSmoothing,
            currentLookAhead.current,
            delta
        );
        currentLookAhead.current.copy(lookAhead);
        
        const desiredPosition = targetPos.clone()
            .add(currentOffset.current)
            .add(lookAhead);
        
        const newPosition = smoothDampVector3(
            cameraRef.current.position,
            desiredPosition,
            velocityRef.current,
            smoothTime,
            delta
        );
        
        cameraRef.current.position.copy(newPosition);
        
        const lookTarget = targetPos.clone().add(lookAhead);
        const currentQuat = cameraRef.current.quaternion.clone();
        cameraRef.current.lookAt(lookTarget);
        const targetQuat = cameraRef.current.quaternion.clone();
        cameraRef.current.quaternion.copy(currentQuat).slerp(targetQuat, 1 - Math.exp(-rotationSmoothing / delta));
    });
    
    return (
        <PerspectiveCamera
            ref={cameraRef}
            fov={fov}
            makeDefault={makeDefault}
            position={offset}
        />
    );
});

FollowCamera.displayName = 'FollowCamera';

export interface OrbitCameraProps {
    target?: [number, number, number];
    minDistance?: number;
    maxDistance?: number;
    minPolarAngle?: number;
    maxPolarAngle?: number;
    autoRotate?: boolean;
    autoRotateSpeed?: number;
    enableDamping?: boolean;
    dampingFactor?: number;
    enableZoom?: boolean;
    enablePan?: boolean;
    fov?: number;
    makeDefault?: boolean;
}

export interface OrbitCameraRef {
    getCamera: () => THREE.PerspectiveCamera | null;
    getControls: () => any;
    setTarget: (target: [number, number, number]) => void;
}

export const OrbitCamera = forwardRef<OrbitCameraRef, OrbitCameraProps>(({
    target = [0, 0, 0],
    minDistance = 2,
    maxDistance = 50,
    minPolarAngle = 0,
    maxPolarAngle = Math.PI / 2,
    autoRotate = false,
    autoRotateSpeed = 2,
    enableDamping = true,
    dampingFactor = 0.05,
    enableZoom = true,
    enablePan = true,
    fov = 60,
    makeDefault = true,
}, ref) => {
    const cameraRef = useRef<THREE.PerspectiveCamera>(null);
    const controlsRef = useRef<any>(null);
    
    useImperativeHandle(ref, () => ({
        getCamera: () => cameraRef.current,
        getControls: () => controlsRef.current,
        setTarget: (newTarget: [number, number, number]) => {
            if (controlsRef.current) {
                controlsRef.current.target.set(...newTarget);
            }
        }
    }));
    
    return (
        <>
            <PerspectiveCamera
                ref={cameraRef}
                fov={fov}
                makeDefault={makeDefault}
                position={[0, 5, 10]}
            />
            <OrbitControls
                ref={controlsRef}
                camera={cameraRef.current ?? undefined}
                target={new THREE.Vector3(...target)}
                minDistance={minDistance}
                maxDistance={maxDistance}
                minPolarAngle={minPolarAngle}
                maxPolarAngle={maxPolarAngle}
                autoRotate={autoRotate}
                autoRotateSpeed={autoRotateSpeed}
                enableDamping={enableDamping}
                dampingFactor={dampingFactor}
                enableZoom={enableZoom}
                enablePan={enablePan}
            />
        </>
    );
});

OrbitCamera.displayName = 'OrbitCamera';

export interface FPSCameraProps {
    position?: [number, number, number];
    sensitivity?: number;
    headBobEnabled?: boolean;
    headBobFrequency?: number;
    headBobAmplitude?: number;
    fov?: number;
    makeDefault?: boolean;
    movementSpeed?: number;
}

export interface FPSCameraRef {
    getCamera: () => THREE.PerspectiveCamera | null;
    setPosition: (position: [number, number, number]) => void;
    setMovementSpeed: (speed: number) => void;
    getMoving: () => boolean;
}

export const FPSCamera = forwardRef<FPSCameraRef, FPSCameraProps>(({
    position = [0, 1.7, 0],
    sensitivity = 0.002,
    headBobEnabled = true,
    headBobFrequency = 10,
    headBobAmplitude = 0.05,
    fov = 75,
    makeDefault = true,
    movementSpeed = 5,
}, ref) => {
    const cameraRef = useRef<THREE.PerspectiveCamera>(null);
    const euler = useRef(new THREE.Euler(0, 0, 0, 'YXZ'));
    const isMoving = useRef(false);
    const currentSpeed = useRef(movementSpeed);
    const bobTime = useRef(0);
    const basePosition = useRef(new THREE.Vector3(...position));
    const keys = useRef<Set<string>>(new Set());
    
    useImperativeHandle(ref, () => ({
        getCamera: () => cameraRef.current,
        setPosition: (newPosition: [number, number, number]) => {
            basePosition.current.set(...newPosition);
        },
        setMovementSpeed: (speed: number) => {
            currentSpeed.current = speed;
        },
        getMoving: () => isMoving.current,
    }));
    
    useEffect(() => {
        const handleMouseMove = (event: MouseEvent) => {
            if (document.pointerLockElement) {
                euler.current.y -= event.movementX * sensitivity;
                euler.current.x -= event.movementY * sensitivity;
                euler.current.x = Math.max(-Math.PI / 2, Math.min(Math.PI / 2, euler.current.x));
            }
        };
        
        const handleKeyDown = (event: KeyboardEvent) => {
            keys.current.add(event.code);
        };
        
        const handleKeyUp = (event: KeyboardEvent) => {
            keys.current.delete(event.code);
        };
        
        document.addEventListener('mousemove', handleMouseMove);
        document.addEventListener('keydown', handleKeyDown);
        document.addEventListener('keyup', handleKeyUp);
        
        return () => {
            document.removeEventListener('mousemove', handleMouseMove);
            document.removeEventListener('keydown', handleKeyDown);
            document.removeEventListener('keyup', handleKeyUp);
        };
    }, [sensitivity]);
    
    useFrame((_, delta) => {
        if (!cameraRef.current) return;
        
        cameraRef.current.quaternion.setFromEuler(euler.current);
        
        const direction = new THREE.Vector3();
        const forward = new THREE.Vector3(0, 0, -1).applyQuaternion(cameraRef.current.quaternion);
        forward.y = 0;
        forward.normalize();
        const right = new THREE.Vector3(1, 0, 0).applyQuaternion(cameraRef.current.quaternion);
        right.y = 0;
        right.normalize();
        
        if (keys.current.has('KeyW')) direction.add(forward);
        if (keys.current.has('KeyS')) direction.sub(forward);
        if (keys.current.has('KeyD')) direction.add(right);
        if (keys.current.has('KeyA')) direction.sub(right);
        
        isMoving.current = direction.lengthSq() > 0;
        
        if (isMoving.current) {
            direction.normalize().multiplyScalar(currentSpeed.current * delta);
            basePosition.current.add(direction);
        }
        
        const finalPosition = basePosition.current.clone();
        
        if (headBobEnabled && isMoving.current) {
            bobTime.current += delta * currentSpeed.current;
            const bob = calculateHeadBob(bobTime.current, currentSpeed.current, headBobFrequency, headBobAmplitude);
            finalPosition.add(bob);
        }
        
        cameraRef.current.position.copy(finalPosition);
    });
    
    return (
        <PerspectiveCamera
            ref={cameraRef}
            fov={fov}
            makeDefault={makeDefault}
            position={position}
        />
    );
});

FPSCamera.displayName = 'FPSCamera';

export interface CinematicCameraProps {
    path: THREE.Vector3[];
    duration?: number;
    tension?: number;
    closed?: boolean;
    lookAt?: THREE.Vector3 | React.RefObject<THREE.Object3D>;
    autoPlay?: boolean;
    loop?: boolean;
    fov?: number;
    fovKeyframes?: { time: number; fov: number }[];
    makeDefault?: boolean;
    onComplete?: () => void;
}

export interface CinematicCameraRef {
    getCamera: () => THREE.PerspectiveCamera | null;
    play: () => void;
    pause: () => void;
    reset: () => void;
    setProgress: (t: number) => void;
    getProgress: () => number;
}

export const CinematicCamera = forwardRef<CinematicCameraRef, CinematicCameraProps>(({
    path,
    duration = 5,
    tension = 0.5,
    closed = false,
    lookAt,
    autoPlay = true,
    loop = false,
    fov = 50,
    fovKeyframes,
    makeDefault = true,
    onComplete,
}, ref) => {
    const cameraRef = useRef<THREE.PerspectiveCamera>(null);
    const progressRef = useRef(0);
    const isPlaying = useRef(autoPlay);
    const hasCompleted = useRef(false);
    
    useImperativeHandle(ref, () => ({
        getCamera: () => cameraRef.current,
        play: () => { isPlaying.current = true; hasCompleted.current = false; },
        pause: () => { isPlaying.current = false; },
        reset: () => { progressRef.current = 0; hasCompleted.current = false; },
        setProgress: (t: number) => { progressRef.current = Math.max(0, Math.min(1, t)); },
        getProgress: () => progressRef.current,
    }));
    
    const getLookAtPosition = useCallback((): THREE.Vector3 | null => {
        if (!lookAt) return null;
        if (lookAt instanceof THREE.Vector3) return lookAt;
        if (lookAt.current) return lookAt.current.position;
        return null;
    }, [lookAt]);
    
    const interpolateFOV = useCallback((t: number): number => {
        if (!fovKeyframes || fovKeyframes.length === 0) return fov;
        if (fovKeyframes.length === 1) return fovKeyframes[0].fov;
        
        for (let i = 0; i < fovKeyframes.length - 1; i++) {
            const current = fovKeyframes[i];
            const next = fovKeyframes[i + 1];
            if (t >= current.time && t <= next.time) {
                const localT = (t - current.time) / (next.time - current.time);
                return lerp(current.fov, next.fov, easeInOutCubic(localT));
            }
        }
        
        return fovKeyframes[fovKeyframes.length - 1].fov;
    }, [fov, fovKeyframes]);
    
    useFrame((_, delta) => {
        if (!cameraRef.current || path.length < 2) return;
        
        if (isPlaying.current) {
            progressRef.current += delta / duration;
            
            if (progressRef.current >= 1) {
                if (loop) {
                    progressRef.current = progressRef.current % 1;
                } else {
                    progressRef.current = 1;
                    isPlaying.current = false;
                    if (!hasCompleted.current) {
                        hasCompleted.current = true;
                        onComplete?.();
                    }
                }
            }
        }
        
        const position = evaluateCatmullRom(path, progressRef.current, tension, closed);
        cameraRef.current.position.copy(position);
        
        const lookAtPos = getLookAtPosition();
        if (lookAtPos) {
            cameraRef.current.lookAt(lookAtPos);
        } else {
            const lookAheadT = Math.min(1, progressRef.current + 0.01);
            const lookAheadPos = evaluateCatmullRom(path, lookAheadT, tension, closed);
            cameraRef.current.lookAt(lookAheadPos);
        }
        
        cameraRef.current.fov = interpolateFOV(progressRef.current);
        cameraRef.current.updateProjectionMatrix();
    });
    
    const initialPosition = path[0] ?? new THREE.Vector3();
    
    return (
        <PerspectiveCamera
            ref={cameraRef}
            fov={fov}
            makeDefault={makeDefault}
            position={[initialPosition.x, initialPosition.y, initialPosition.z]}
        />
    );
});

CinematicCamera.displayName = 'CinematicCamera';

export interface CameraShakeProps {
    intensity?: number;
    decay?: number;
    maxYaw?: number;
    maxPitch?: number;
    maxRoll?: number;
    yawFrequency?: number;
    pitchFrequency?: number;
    rollFrequency?: number;
}

export interface CameraShakeRef {
    addTrauma: (amount: number) => void;
    setTrauma: (amount: number) => void;
    getTrauma: () => number;
}

export const CameraShake = forwardRef<CameraShakeRef, CameraShakeProps>(({
    intensity = 1,
    decay = 1.5,
    maxYaw = 0.1,
    maxPitch = 0.1,
    maxRoll = 0.1,
    yawFrequency = 25,
    pitchFrequency = 25,
    rollFrequency = 25,
}, ref) => {
    const { camera } = useThree();
    const shakeRef = useRef<CameraShakeCore | null>(null);
    const initialRotation = useRef(new THREE.Euler());
    
    useEffect(() => {
        shakeRef.current = new CameraShakeCore({
            traumaDecay: decay,
            maxAngle: Math.max(maxYaw, maxPitch, maxRoll),
            maxOffset: 0,
            frequency: (yawFrequency + pitchFrequency + rollFrequency) / 3,
        });
        initialRotation.current.copy(camera.rotation);
    }, [camera, decay, maxYaw, maxPitch, maxRoll, yawFrequency, pitchFrequency, rollFrequency]);
    
    useImperativeHandle(ref, () => ({
        addTrauma: (amount: number) => shakeRef.current?.addTrauma(amount * intensity),
        setTrauma: (amount: number) => shakeRef.current?.setTrauma(amount * intensity),
        getTrauma: () => shakeRef.current?.getTrauma() ?? 0,
    }));
    
    useFrame((_, delta) => {
        if (!shakeRef.current) return;
        
        const { rotation } = shakeRef.current.update(delta);
        
        camera.rotation.x = initialRotation.current.x + rotation.x * (maxPitch / 0.1);
        camera.rotation.y = initialRotation.current.y + rotation.y * (maxYaw / 0.1);
        camera.rotation.z = initialRotation.current.z + rotation.z * (maxRoll / 0.1);
    });
    
    return null;
});

CameraShake.displayName = 'CameraShake';

export interface CameraTransitionProps {
    from: THREE.Vector3;
    to: THREE.Vector3;
    fromLookAt?: THREE.Vector3;
    toLookAt?: THREE.Vector3;
    duration?: number;
    easing?: (t: number) => number;
    onComplete?: () => void;
}

export function useCameraTransition() {
    const { camera } = useThree();
    const transitionRef = useRef<{
        from: THREE.Vector3;
        to: THREE.Vector3;
        fromLookAt?: THREE.Vector3;
        toLookAt?: THREE.Vector3;
        duration: number;
        elapsed: number;
        easing: (t: number) => number;
        onComplete?: () => void;
        active: boolean;
    } | null>(null);
    
    const startTransition = useCallback((props: CameraTransitionProps) => {
        transitionRef.current = {
            from: props.from.clone(),
            to: props.to.clone(),
            fromLookAt: props.fromLookAt?.clone(),
            toLookAt: props.toLookAt?.clone(),
            duration: props.duration ?? 1,
            elapsed: 0,
            easing: props.easing ?? easeInOutCubic,
            onComplete: props.onComplete,
            active: true,
        };
    }, []);
    
    useFrame((_, delta) => {
        if (!transitionRef.current?.active) return;
        
        const t = transitionRef.current;
        t.elapsed += delta;
        
        const progress = Math.min(1, t.elapsed / t.duration);
        const easedProgress = t.easing(progress);
        
        const position = lerpVector3(t.from, t.to, easedProgress);
        camera.position.copy(position);
        
        if (t.fromLookAt && t.toLookAt) {
            const lookAt = lerpVector3(t.fromLookAt, t.toLookAt, easedProgress);
            camera.lookAt(lookAt);
        }
        
        if (progress >= 1) {
            t.active = false;
            t.onComplete?.();
        }
    });
    
    return { startTransition };
}
