import * as YUKA from 'yuka';
import type { AIPresetResult, PredatorPresetConfig } from './types';

/**
 * Create hunting predators that patrol or wander, then pursue detected prey.
 *
 * Predator entities intelligently search for prey and initiate high-speed pursuits
 * when targets are detected. They can patrol fixed routes or wander freely, making
 * them perfect for wolves, enemies, sharks, or any aggressive hunting character.
 *
 * The preset includes state management for switching between hunting and pursuit
 * behaviors, with configurable detection ranges and speeds.
 *
 * @category Entities & Simulation
 *
 * @example Basic Wolf Predator
 * ```typescript
 * import { createPredatorPreset } from '@jbcom/strata/presets/ai';
 *
 * const wolf = createPredatorPreset({
 *   pursuitSpeed: 15,
 *   detectionRadius: 25,
 *   maxSpeed: 12
 * });
 *
 * // In game loop
 * function update(delta) {
 *   wolf.update(delta, {
 *     preyPosition: nearestPrey?.position
 *   });
 * }
 * ```
 *
 * @example Predator with Patrol Route
 * ```typescript
 * const patrollingPredator = createPredatorPreset({
 *   patrolWaypoints: [
 *     [0, 0, 0],
 *     [20, 0, 0],
 *     [20, 0, 20],
 *     [0, 0, 20]
 *   ],
 *   pursuitSpeed: 16,
 *   detectionRadius: 20
 * });
 *
 * // Patrols until prey detected, then gives chase
 * patrollingPredator.update(delta, { preyPosition: rabbit.position });
 * ```
 *
 * @example Pack Hunting Behavior
 * ```typescript
 * import { createPredatorPreset } from '@jbcom/strata/presets/ai';
 *
 * // Create wolf pack
 * const pack = Array.from({ length: 5 }, () =>
 *   createPredatorPreset({
 *     pursuitSpeed: 14,
 *     detectionRadius: 30,  // Wide detection for coordination
 *     maxSpeed: 12,
 *     maxForce: 15
 *   })
 * );
 *
 * // Spawn in formation
 * pack.forEach((wolf, i) => {
 *   const angle = (i / pack.length) * Math.PI * 2;
 *   wolf.vehicle.position.set(
 *     Math.cos(angle) * 5,
 *     0,
 *     Math.sin(angle) * 5
 *   );
 * });
 *
 * function updatePack(delta, preyPos) {
 *   // All wolves target same prey
 *   pack.forEach(wolf => {
 *     wolf.update(delta, { preyPosition: preyPos });
 *   });
 * }
 * ```
 *
 * @example Shark with Underwater Constraints
 * ```typescript
 * const shark = createPredatorPreset({
 *   pursuitSpeed: 18,
 *   detectionRadius: 35,
 *   maxSpeed: 15,
 *   mass: 3  // Heavy, momentum-based movement
 * });
 *
 * function updateShark(delta, fishPos) {
 *   shark.update(delta, { preyPosition: fishPos });
 *
 *   // Keep shark underwater
 *   shark.vehicle.position.y = Math.max(
 *     shark.vehicle.position.y,
 *     -10  // Maximum depth
 *   );
 *   shark.vehicle.position.y = Math.min(
 *     shark.vehicle.position.y,
 *     -2   // Minimum depth (below surface)
 *   );
 * }
 * ```
 *
 * @example Stealth Predator (Ambush Hunter)
 * ```typescript
 * const ambushPredator = createPredatorPreset({
 *   pursuitSpeed: 20,  // Very fast when attacking
 *   detectionRadius: 15, // Close range only
 *   maxSpeed: 10
 * });
 *
 * let isHidden = true;
 *
 * function updateAmbushPredator(delta, preyPos) {
 *   const distance = ambushPredator.vehicle.position.distanceTo(preyPos);
 *
 *   if (isHidden && distance < 8) {
 *     // Surprise attack!
 *     isHidden = false;
 *     ambushPredator.vehicle.maxSpeed = 20;
 *     playSound('roar');
 *   } else if (!isHidden && distance > 30) {
 *     // Return to hiding
 *     isHidden = true;
 *     ambushPredator.vehicle.maxSpeed = 2;
 *   }
 *
 *   ambushPredator.update(delta, {
 *     preyPosition: !isHidden ? preyPos : undefined
 *   });
 * }
 * ```
 *
 * @example Territory-Based Predator
 * ```typescript
 * const territorialPredator = createPredatorPreset({
 *   patrolWaypoints: territoryBoundary,
 *   pursuitSpeed: 14,
 *   detectionRadius: 25
 * });
 *
 * const territoryCenter = new YUKA.Vector3(0, 0, 0);
 * const territoryRadius = 30;
 *
 * function updateTerritorialPredator(delta, preyPos) {
 *   const distFromCenter = territorialPredator.vehicle.position
 *     .distanceTo(territoryCenter);
 *
 *   // Only pursue if prey is in territory
 *   const preyInTerritory = preyPos &&
 *     preyPos.distanceTo(territoryCenter) < territoryRadius;
 *
 *   territorialPredator.update(delta, {
 *     preyPosition: preyInTerritory ? preyPos : undefined
 *   });
 *
 *   // Return to territory if too far
 *   if (distFromCenter > territoryRadius + 10) {
 *     const returnVector = territoryCenter.clone()
 *       .subtract(territorialPredator.vehicle.position)
 *       .normalize()
 *       .multiplyScalar(3);
 *
 *     territorialPredator.vehicle.velocity.add(returnVector);
 *   }
 * }
 * ```
 *
 * @example Boss Predator with Phases
 * ```typescript
 * const bossPredator = createPredatorPreset({
 *   pursuitSpeed: 12,
 *   detectionRadius: 40,
 *   maxSpeed: 12,
 *   mass: 5  // Very heavy, hard to evade
 * });
 *
 * let bossPhase = 1;
 * let health = 100;
 *
 * function updateBossPredator(delta, playerPos) {
 *   // Phase transitions
 *   if (health < 60 && bossPhase === 1) {
 *     bossPhase = 2;
 *     bossPredator.vehicle.maxSpeed = 16;
 *     console.log('Boss enraged!');
 *   } else if (health < 30 && bossPhase === 2) {
 *     bossPhase = 3;
 *     bossPredator.vehicle.maxSpeed = 20;
 *     spawnMinions();
 *     console.log('Boss desperate!');
 *   }
 *
 *   bossPredator.update(delta, { preyPosition: playerPos });
 *
 *   // Special abilities per phase
 *   if (bossPhase === 3 && Math.random() < 0.02) {
 *     performSpecialAttack();
 *   }
 * }
 * ```
 *
 * @example Predator-Prey Ecosystem
 * ```typescript
 * const predators = Array.from({ length: 3 }, () =>
 *   createPredatorPreset({ pursuitSpeed: 14, detectionRadius: 25 })
 * );
 *
 * const prey = Array.from({ length: 20 }, () =>
 *   createPreyPreset({ fleeSpeed: 12, fleeDistance: 12 })
 * );
 *
 * function updateEcosystem(delta) {
 *   predators.forEach(predator => {
 *     // Find nearest prey
 *     let nearest = null;
 *     let nearestDist = Infinity;
 *
 *     prey.forEach(p => {
 *       const dist = predator.vehicle.position.distanceTo(
 *         p.vehicle.position
 *       );
 *       if (dist < nearestDist) {
 *         nearestDist = dist;
 *         nearest = p;
 *       }
 *     });
 *
 *     predator.update(delta, {
 *       preyPosition: nearest?.vehicle.position
 *     });
 *   });
 *
 *   prey.forEach(p => {
 *     // Find nearest predator
 *     let nearest = null;
 *     let nearestDist = Infinity;
 *
 *     predators.forEach(predator => {
 *       const dist = p.vehicle.position.distanceTo(
 *         predator.vehicle.position
 *       );
 *       if (dist < nearestDist) {
 *         nearestDist = dist;
 *         nearest = predator;
 *       }
 *     });
 *
 *     p.update(delta, {
 *       threatPosition: nearest?.vehicle.position
 *     });
 *   });
 * }
 * ```
 *
 * @see {@link https://jonbogaty.com/nodejs-strata/demos/ai.html Live AI Demo}
 * @see {@link PredatorPresetConfig} - Configuration options
 * @see {@link AIPresetResult} - Return value structure
 */
export function createPredatorPreset(config: PredatorPresetConfig = {}): AIPresetResult {
    const {
        patrolWaypoints = [],
        pursuitSpeed = 12,
        detectionRadius = 20,
        maxSpeed = 12,
        maxForce = 15,
        mass = 2,
    } = config;

    const vehicle = new YUKA.Vehicle();
    vehicle.maxSpeed = maxSpeed;
    vehicle.maxForce = maxForce;
    vehicle.mass = mass;

    const wanderBehavior = new YUKA.WanderBehavior();
    wanderBehavior.radius = 3;
    wanderBehavior.distance = 8;
    wanderBehavior.jitter = 2;

    let followPathBehavior: YUKA.FollowPathBehavior | null = null;
    if (patrolWaypoints.length > 0) {
        const path = new YUKA.Path();
        path.loop = true;
        for (const [x, y, z] of patrolWaypoints) {
            path.add(new YUKA.Vector3(x, y, z));
        }
        followPathBehavior = new YUKA.FollowPathBehavior(path);
        followPathBehavior.active = true;
        wanderBehavior.active = false;
    } else {
        wanderBehavior.active = true;
    }

    const seekBehavior = new YUKA.SeekBehavior();
    seekBehavior.active = false;
    seekBehavior.weight = 2;

    const behaviors: YUKA.SteeringBehavior[] = [wanderBehavior, seekBehavior];
    vehicle.steering.add(wanderBehavior);
    vehicle.steering.add(seekBehavior);

    if (followPathBehavior) {
        behaviors.push(followPathBehavior);
        vehicle.steering.add(followPathBehavior);
    }

    class PatrolState extends YUKA.State<YUKA.Vehicle> {
        enter(entity: YUKA.Vehicle): void {
            entity.maxSpeed = maxSpeed * 0.5;
            seekBehavior.active = false;
            if (followPathBehavior) {
                followPathBehavior.active = true;
                wanderBehavior.active = false;
            } else {
                wanderBehavior.active = true;
            }
        }
        execute(): void {}
        exit(): void {}
    }

    class PursueState extends YUKA.State<YUKA.Vehicle> {
        enter(entity: YUKA.Vehicle): void {
            entity.maxSpeed = pursuitSpeed;
            wanderBehavior.active = false;
            if (followPathBehavior) {
                followPathBehavior.active = false;
            }
            seekBehavior.active = true;
        }
        execute(): void {}
        exit(): void {}
    }

    const stateMachine = new YUKA.StateMachine(vehicle);
    const patrolState = new PatrolState();
    const pursueState = new PursueState();
    stateMachine.currentState = patrolState;

    const update = (_delta: number, context?: { preyPosition?: YUKA.Vector3 }) => {
        if (context?.preyPosition) {
            const distance = vehicle.position.distanceTo(context.preyPosition);

            if (distance < detectionRadius) {
                if (stateMachine.currentState !== pursueState) {
                    stateMachine.changeTo(pursueState);
                }
                seekBehavior.target = context.preyPosition;
            } else {
                if (stateMachine.currentState !== patrolState) {
                    stateMachine.changeTo(patrolState);
                }
            }
        }

        stateMachine.update();
    };

    return {
        vehicle,
        behaviors,
        stateMachine,
        update,
    };
}
