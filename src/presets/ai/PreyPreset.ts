import * as YUKA from 'yuka';
import type { AIPresetResult, PreyPresetConfig } from './types';

/**
 * Create prey animals that wander peacefully and flee from threats.
 *
 * Prey entities exhibit natural wildlife behavior - wandering randomly within an area
 * until a threat approaches, then fleeing at high speed. Perfect for rabbits, deer,
 * fish, neutral NPCs, or any character that should avoid danger.
 *
 * The preset includes intelligent state management that transitions between calm
 * wandering and panicked fleeing, creating believable animal behavior.
 *
 * @category Entities & Simulation
 *
 * @example Basic Rabbit AI
 * ```typescript
 * import { createPreyPreset } from '@jbcom/strata/presets/ai';
 *
 * const rabbit = createPreyPreset({
 *   wanderRadius: 3,
 *   fleeDistance: 10,
 *   fleeSpeed: 12,
 *   maxSpeed: 6
 * });
 *
 * // In game loop
 * function update(delta) {
 *   // Rabbit flees from nearest predator
 *   rabbit.update(delta, {
 *     threatPosition: nearestPredator?.position
 *   });
 * }
 * ```
 *
 * @example Wildlife Ecosystem
 * ```typescript
 * import { createPreyPreset, createPredatorPreset } from '@jbcom/strata/presets/ai';
 *
 * // Create multiple prey animals
 * const rabbits = Array.from({ length: 10 }, () =>
 *   createPreyPreset({
 *     wanderRadius: 4,
 *     fleeDistance: 12,
 *     fleeSpeed: 14
 *   })
 * );
 *
 * // Spawn them in world
 * rabbits.forEach((rabbit, i) => {
 *   rabbit.vehicle.position.set(
 *     Math.random() * 50 - 25,
 *     0,
 *     Math.random() * 50 - 25
 *   );
 * });
 *
 * // Update with predator awareness
 * const wolf = createPredatorPreset({ pursuitSpeed: 15 });
 *
 * function updateEcosystem(delta) {
 *   rabbits.forEach(rabbit => {
 *     rabbit.update(delta, {
 *       threatPosition: wolf.vehicle.position
 *     });
 *   });
 *
 *   wolf.update(delta, {
 *     preyPosition: rabbits[0].vehicle.position
 *   });
 * }
 * ```
 *
 * @example Different Prey Species
 * ```typescript
 * // Timid prey - flees early
 * const mouse = createPreyPreset({
 *   wanderRadius: 2,
 *   fleeDistance: 15,  // Notices threats from far away
 *   fleeSpeed: 10,
 *   maxSpeed: 5
 * });
 *
 * // Bold prey - flees late
 * const boar = createPreyPreset({
 *   wanderRadius: 5,
 *   fleeDistance: 5,   // Only flees when threat is close
 *   fleeSpeed: 8,
 *   maxSpeed: 4,
 *   mass: 2            // Heavier, slower to change direction
 * });
 *
 * // Fast prey - quick escape
 * const gazelle = createPreyPreset({
 *   wanderRadius: 6,
 *   fleeDistance: 12,
 *   fleeSpeed: 18,     // Very fast escape
 *   maxSpeed: 8
 * });
 * ```
 *
 * @example Prey with Stamina System
 * ```typescript
 * const deer = createPreyPreset({
 *   wanderRadius: 4,
 *   fleeDistance: 10,
 *   fleeSpeed: 14
 * });
 *
 * let stamina = 100;
 * let isExhausted = false;
 *
 * function updateDeer(delta, predatorPos) {
 *   const isFleeing = deer.vehicle.position.distanceTo(predatorPos) < 10;
 *
 *   if (isFleeing && !isExhausted) {
 *     stamina -= delta * 20; // Drain stamina while fleeing
 *     if (stamina <= 0) {
 *       isExhausted = true;
 *       deer.vehicle.maxSpeed = 4; // Too tired to run fast
 *     }
 *   } else {
 *     stamina = Math.min(100, stamina + delta * 5); // Recover
 *     if (stamina > 50) {
 *       isExhausted = false;
 *       deer.vehicle.maxSpeed = 14;
 *     }
 *   }
 *
 *   deer.update(delta, { threatPosition: predatorPos });
 * }
 * ```
 *
 * @example Schooling Fish
 * ```typescript
 * // Small fish flee as a group
 * const fishSchool = Array.from({ length: 20 }, () =>
 *   createPreyPreset({
 *     wanderRadius: 2,
 *     fleeDistance: 8,
 *     fleeSpeed: 10,
 *     maxSpeed: 5
 *   })
 * );
 *
 * function updateFishSchool(delta, sharkPos) {
 *   fishSchool.forEach(fish => {
 *     // All fish flee from same threat
 *     fish.update(delta, { threatPosition: sharkPos });
 *
 *     // Keep fish underwater
 *     fish.vehicle.position.y = Math.max(
 *       fish.vehicle.position.y,
 *       -5  // Min depth
 *     );
 *   });
 * }
 * ```
 *
 * @example Prey with Safe Zones
 * ```typescript
 * const prey = createPreyPreset({
 *   wanderRadius: 3,
 *   fleeDistance: 10,
 *   fleeSpeed: 12
 * });
 *
 * const safeZoneCenter = new YUKA.Vector3(0, 0, 0);
 * const safeZoneRadius = 15;
 *
 * function isInSafeZone(position) {
 *   return position.distanceTo(safeZoneCenter) < safeZoneRadius;
 * }
 *
 * function updatePrey(delta, threatPos) {
 *   const inSafeZone = isInSafeZone(prey.vehicle.position);
 *
 *   // Only flee if threat is present AND we're not in safe zone
 *   const shouldFlee = !inSafeZone && threatPos;
 *
 *   prey.update(delta, {
 *     threatPosition: shouldFlee ? threatPos : undefined
 *   });
 *
 *   // If fleeing, add steering toward safe zone
 *   if (shouldFlee) {
 *     const toSafety = safeZoneCenter.clone()
 *       .subtract(prey.vehicle.position)
 *       .normalize()
 *       .multiplyScalar(2); // Seek safety
 *
 *     prey.vehicle.velocity.add(toSafety);
 *   }
 * }
 * ```
 *
 * @example Herd Behavior
 * ```typescript
 * // Create herd that flees together
 * const herd = Array.from({ length: 15 }, () =>
 *   createPreyPreset({
 *     wanderRadius: 4,
 *     fleeDistance: 12,
 *     fleeSpeed: 12
 *   })
 * );
 *
 * function updateHerd(delta, predatorPos) {
 *   // Calculate average herd position
 *   const avgPos = new YUKA.Vector3();
 *   herd.forEach(animal => avgPos.add(animal.vehicle.position));
 *   avgPos.divideScalar(herd.length);
 *
 *   herd.forEach(animal => {
 *     const distToHerd = animal.vehicle.position.distanceTo(avgPos);
 *
 *     // Lone animals are more vulnerable
 *     const effectiveFleeDistance = distToHerd > 10 ? 15 : 12;
 *
 *     animal.update(delta, { threatPosition: predatorPos });
 *   });
 * }
 * ```
 *
 * @see {@link https://jonbogaty.com/nodejs-strata/demos/ai.html Live AI Demo}
 * @see {@link PreyPresetConfig} - Configuration options
 * @see {@link AIPresetResult} - Return value structure
 */
export function createPreyPreset(config: PreyPresetConfig = {}): AIPresetResult {
    const {
        wanderRadius = 2,
        fleeDistance = 10,
        fleeSpeed = 10,
        maxSpeed = 6,
        maxForce = 8,
        mass = 1,
    } = config;

    const vehicle = new YUKA.Vehicle();
    vehicle.maxSpeed = maxSpeed;
    vehicle.maxForce = maxForce;
    vehicle.mass = mass;

    const wanderBehavior = new YUKA.WanderBehavior();
    wanderBehavior.radius = wanderRadius;
    wanderBehavior.distance = 5;
    wanderBehavior.jitter = 3;
    wanderBehavior.active = true;

    const fleeBehavior = new YUKA.FleeBehavior();
    fleeBehavior.panicDistance = fleeDistance;
    fleeBehavior.active = false;
    fleeBehavior.weight = 2;

    const behaviors: YUKA.SteeringBehavior[] = [wanderBehavior, fleeBehavior];
    vehicle.steering.add(wanderBehavior);
    vehicle.steering.add(fleeBehavior);

    class WanderState extends YUKA.State<YUKA.Vehicle> {
        enter(entity: YUKA.Vehicle): void {
            entity.maxSpeed = maxSpeed;
            wanderBehavior.active = true;
            fleeBehavior.active = false;
        }
        execute(): void {}
        exit(): void {}
    }

    class FleeState extends YUKA.State<YUKA.Vehicle> {
        enter(entity: YUKA.Vehicle): void {
            entity.maxSpeed = fleeSpeed;
            wanderBehavior.active = false;
            fleeBehavior.active = true;
        }
        execute(): void {}
        exit(): void {}
    }

    const stateMachine = new YUKA.StateMachine(vehicle);
    const wanderState = new WanderState();
    const fleeState = new FleeState();
    stateMachine.currentState = wanderState;

    const update = (_delta: number, context?: { threatPosition?: YUKA.Vector3 }) => {
        if (context?.threatPosition) {
            const distance = vehicle.position.distanceTo(context.threatPosition);

            if (distance < fleeDistance) {
                if (stateMachine.currentState !== fleeState) {
                    stateMachine.changeTo(fleeState);
                }
                fleeBehavior.target = context.threatPosition;
            } else {
                if (stateMachine.currentState !== wanderState) {
                    stateMachine.changeTo(wanderState);
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
