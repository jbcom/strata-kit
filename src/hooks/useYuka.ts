/**
 * YukaJS Steering Behavior Hooks
 *
 * React hooks for creating and managing Yuka steering behaviors.
 * Use with YukaVehicle component to add AI behaviors.
 */

import { useMemo, useEffect } from 'react';
import * as YUKA from 'yuka';
import * as THREE from 'three';

// =============================================================================
// HELPER FUNCTIONS
// =============================================================================

function threeToYukaVector3(v: THREE.Vector3 | [number, number, number]): YUKA.Vector3 {
    if (Array.isArray(v)) {
        return new YUKA.Vector3(v[0], v[1], v[2]);
    }
    return new YUKA.Vector3(v.x, v.y, v.z);
}

// =============================================================================
// SEEK BEHAVIOR
// =============================================================================

export interface UseSeekOptions {
    weight?: number;
}

export function useSeek(
    target: THREE.Vector3 | [number, number, number] | YUKA.Vector3 | YUKA.GameEntity,
    options: UseSeekOptions = {}
): YUKA.SeekBehavior {
    const { weight = 1 } = options;

    return useMemo(() => {
        const behavior = new YUKA.SeekBehavior();
        behavior.weight = weight;

        if (target instanceof YUKA.Vector3) {
            behavior.target = target;
        } else if (target instanceof YUKA.GameEntity) {
            behavior.target = target.position;
        } else {
            behavior.target = threeToYukaVector3(target);
        }

        return behavior;
    }, [target, weight]);
}

// =============================================================================
// FLEE BEHAVIOR
// =============================================================================

export interface UseFleeOptions {
    weight?: number;
    panicDistance?: number;
}

export function useFlee(
    target: THREE.Vector3 | [number, number, number] | YUKA.Vector3 | YUKA.GameEntity,
    options: UseFleeOptions = {}
): YUKA.FleeBehavior {
    const { weight = 1, panicDistance = 10 } = options;

    return useMemo(() => {
        const behavior = new YUKA.FleeBehavior();
        behavior.weight = weight;
        behavior.panicDistance = panicDistance;

        if (target instanceof YUKA.Vector3) {
            behavior.target = target;
        } else if (target instanceof YUKA.GameEntity) {
            behavior.target = target.position;
        } else {
            behavior.target = threeToYukaVector3(target);
        }

        return behavior;
    }, [target, weight, panicDistance]);
}

// =============================================================================
// ARRIVE BEHAVIOR
// =============================================================================

export interface UseArriveOptions {
    weight?: number;
    deceleration?: number;
    tolerance?: number;
}

export function useArrive(
    target: THREE.Vector3 | [number, number, number] | YUKA.Vector3 | YUKA.GameEntity,
    options: UseArriveOptions = {}
): YUKA.ArriveBehavior {
    const { weight = 1, deceleration = 3, tolerance = 0.1 } = options;

    return useMemo(() => {
        const behavior = new YUKA.ArriveBehavior();
        behavior.weight = weight;
        behavior.deceleration = deceleration;
        behavior.tolerance = tolerance;

        if (target instanceof YUKA.Vector3) {
            behavior.target = target;
        } else if (target instanceof YUKA.GameEntity) {
            behavior.target = target.position;
        } else {
            behavior.target = threeToYukaVector3(target);
        }

        return behavior;
    }, [target, weight, deceleration, tolerance]);
}

// =============================================================================
// PURSUE BEHAVIOR
// =============================================================================

export interface UsePursueOptions {
    weight?: number;
}

export function usePursue(
    evader: YUKA.Vehicle,
    options: UsePursueOptions = {}
): YUKA.PursuitBehavior {
    const { weight = 1 } = options;

    return useMemo(() => {
        const behavior = new YUKA.PursuitBehavior(evader);
        behavior.weight = weight;
        return behavior;
    }, [evader, weight]);
}

// =============================================================================
// EVADE BEHAVIOR
// =============================================================================

export interface UseEvadeOptions {
    weight?: number;
    panicDistance?: number;
}

export function useEvade(
    pursuer: YUKA.Vehicle,
    options: UseEvadeOptions = {}
): YUKA.EvadeBehavior {
    const { weight = 1, panicDistance = 10 } = options;

    return useMemo(() => {
        const behavior = new YUKA.EvadeBehavior(pursuer);
        behavior.weight = weight;
        behavior.panicDistance = panicDistance;
        return behavior;
    }, [pursuer, weight, panicDistance]);
}

// =============================================================================
// WANDER BEHAVIOR
// =============================================================================

export interface UseWanderOptions {
    weight?: number;
    radius?: number;
    distance?: number;
    jitter?: number;
}

export function useWander(options: UseWanderOptions = {}): YUKA.WanderBehavior {
    const { weight = 1, radius = 1, distance = 5, jitter = 5 } = options;

    return useMemo(() => {
        const behavior = new YUKA.WanderBehavior();
        behavior.weight = weight;
        behavior.radius = radius;
        behavior.distance = distance;
        behavior.jitter = jitter;
        return behavior;
    }, [weight, radius, distance, jitter]);
}

// =============================================================================
// FOLLOW PATH BEHAVIOR
// =============================================================================

export interface UseFollowPathOptions {
    weight?: number;
    nextWaypointDistance?: number;
}

export function useFollowPath(
    path: YUKA.Path,
    options: UseFollowPathOptions = {}
): YUKA.FollowPathBehavior {
    const { weight = 1, nextWaypointDistance = 1 } = options;

    return useMemo(() => {
        const behavior = new YUKA.FollowPathBehavior(path);
        behavior.weight = weight;
        behavior.nextWaypointDistance = nextWaypointDistance;
        return behavior;
    }, [path, weight, nextWaypointDistance]);
}

// =============================================================================
// SEPARATION BEHAVIOR (Flocking)
// =============================================================================

export interface UseSeparationOptions {
    weight?: number;
}

export function useSeparation(
    entities: YUKA.Vehicle[] = [],
    options: UseSeparationOptions = {}
): YUKA.SeparationBehavior {
    const { weight = 1 } = options;

    const behavior = useMemo(() => {
        return new YUKA.SeparationBehavior();
    }, []);

    useEffect(() => {
        behavior.weight = weight;
    }, [behavior, weight]);

    return behavior;
}

// =============================================================================
// ALIGNMENT BEHAVIOR (Flocking)
// =============================================================================

export interface UseAlignmentOptions {
    weight?: number;
}

export function useAlignment(
    entities: YUKA.Vehicle[] = [],
    options: UseAlignmentOptions = {}
): YUKA.AlignmentBehavior {
    const { weight = 1 } = options;

    const behavior = useMemo(() => {
        return new YUKA.AlignmentBehavior();
    }, []);

    useEffect(() => {
        behavior.weight = weight;
    }, [behavior, weight]);

    return behavior;
}

// =============================================================================
// COHESION BEHAVIOR (Flocking)
// =============================================================================

export interface UseCohesionOptions {
    weight?: number;
}

export function useCohesion(
    entities: YUKA.Vehicle[] = [],
    options: UseCohesionOptions = {}
): YUKA.CohesionBehavior {
    const { weight = 1 } = options;

    const behavior = useMemo(() => {
        return new YUKA.CohesionBehavior();
    }, []);

    useEffect(() => {
        behavior.weight = weight;
    }, [behavior, weight]);

    return behavior;
}

// =============================================================================
// OBSTACLE AVOIDANCE BEHAVIOR
// =============================================================================

export interface UseObstacleAvoidanceOptions {
    weight?: number;
    dBoxMinLength?: number;
}

export function useObstacleAvoidance(
    obstacles: YUKA.GameEntity[] = [],
    options: UseObstacleAvoidanceOptions = {}
): YUKA.ObstacleAvoidanceBehavior {
    const { weight = 1, dBoxMinLength = 4 } = options;

    const behavior = useMemo(() => {
        return new YUKA.ObstacleAvoidanceBehavior(obstacles);
    }, []);

    useEffect(() => {
        behavior.weight = weight;
        behavior.dBoxMinLength = dBoxMinLength;
        behavior.obstacles = obstacles;
    }, [behavior, obstacles, weight, dBoxMinLength]);

    return behavior;
}

// =============================================================================
// OFFSET PURSUIT BEHAVIOR
// =============================================================================

export interface UseOffsetPursuitOptions {
    weight?: number;
}

export function useOffsetPursuit(
    leader: YUKA.Vehicle,
    offset: THREE.Vector3 | [number, number, number] | YUKA.Vector3,
    options: UseOffsetPursuitOptions = {}
): YUKA.OffsetPursuitBehavior {
    const { weight = 1 } = options;

    return useMemo(() => {
        let yukaOffset: YUKA.Vector3;
        if (offset instanceof YUKA.Vector3) {
            yukaOffset = offset;
        } else {
            yukaOffset = threeToYukaVector3(offset);
        }

        const behavior = new YUKA.OffsetPursuitBehavior(leader, yukaOffset);
        behavior.weight = weight;
        return behavior;
    }, [leader, offset, weight]);
}

// =============================================================================
// INTERPOSE BEHAVIOR
// =============================================================================

export interface UseInterposeOptions {
    weight?: number;
}

export function useInterpose(
    entity1: YUKA.Vehicle,
    entity2: YUKA.Vehicle,
    options: UseInterposeOptions = {}
): YUKA.InterposeBehavior {
    const { weight = 1 } = options;

    return useMemo(() => {
        const behavior = new YUKA.InterposeBehavior(entity1, entity2);
        behavior.weight = weight;
        return behavior;
    }, [entity1, entity2, weight]);
}

// =============================================================================
// EXPORTS
// =============================================================================

export type {
    YUKA,
};
