/**
 * System registration and execution utilities for Strata ECS.
 * @module core/ecs/systems
 * @public
 */

import type { BaseEntity, SystemFn, SystemConfig, StrataWorld } from './types';

/**
 * System scheduler for managing and executing ECS systems.
 * @public
 * @example
 * ```typescript
 * const scheduler = createSystemScheduler<GameEntity>();
 * scheduler.register({ name: 'movement', fn: movementSystem, priority: 10 });
 * scheduler.run(world, deltaTime);
 * ```
 */
export interface SystemScheduler<T extends BaseEntity> {
  register: (config: SystemConfig<T>) => void;
  unregister: (name: string) => boolean;
  run: (world: StrataWorld<T>, deltaTime: number) => void;
  enable: (name: string) => void;
  disable: (name: string) => void;
  getSystemNames: () => string[];
  isEnabled: (name: string) => boolean;
  clear: () => void;
}

/**
 * Creates a new system scheduler for managing ECS systems.
 * @returns A SystemScheduler instance
 * @example
 * ```typescript
 * const scheduler = createSystemScheduler<GameEntity>();
 * scheduler.register({ name: 'physics', fn: physicsSystem, priority: 0 });
 * scheduler.run(world, 1/60);
 * ```
 */
export function createSystemScheduler<T extends BaseEntity>(): SystemScheduler<T> {
  const systems = new Map<string, SystemConfig<T>>();

  return {
    register(config: SystemConfig<T>): void {
      if (systems.has(config.name)) throw new Error(`System '${config.name}' is already registered`);
      systems.set(config.name, { ...config, priority: config.priority ?? 0, enabled: config.enabled ?? true });
    },
    unregister: (name: string) => systems.delete(name),
    run(world: StrataWorld<T>, deltaTime: number): void {
      [...systems.values()]
        .filter((s) => s.enabled)
        .sort((a, b) => (a.priority ?? 0) - (b.priority ?? 0))
        .forEach((system) => system.fn(world, deltaTime));
    },
    enable(name: string): void { const s = systems.get(name); if (s) s.enabled = true; },
    disable(name: string): void { const s = systems.get(name); if (s) s.enabled = false; },
    getSystemNames: () => [...systems.keys()],
    isEnabled: (name: string) => systems.get(name)?.enabled ?? false,
    clear: () => systems.clear(),
  };
}

/**
 * Creates a simple system function from a query and update function.
 * @param components - Component keys to query for
 * @param update - Function to call for each matching entity
 * @returns A SystemFn that can be registered with the scheduler
 * @example
 * ```typescript
 * const movementSystem = createSystem<GameEntity>(['position', 'velocity'], (entity, delta) => {
 *   entity.position.x += entity.velocity!.x * delta;
 * });
 * ```
 */
export function createSystem<T extends BaseEntity>(
  components: (keyof T)[],
  update: (entity: T, deltaTime: number) => void
): SystemFn<T> {
  return (world: StrataWorld<T>, deltaTime: number) => {
    for (const entity of world.query(...components)) update(entity, deltaTime);
  };
}

/**
 * Wraps a system function with performance timing.
 * @param name - Name for logging
 * @param system - The system function to wrap
 * @returns A wrapped system that logs execution time
 * @example
 * ```typescript
 * const timedMovement = withTiming('movement', movementSystem);
 * ```
 */
export function withTiming<T extends BaseEntity>(name: string, system: SystemFn<T>): SystemFn<T> {
  return (world: StrataWorld<T>, deltaTime: number) => {
    const start = performance.now();
    system(world, deltaTime);
    console.debug(`[System: ${name}] executed in ${(performance.now() - start).toFixed(2)}ms`);
  };
}

/**
 * Combines multiple systems into a single system function.
 * @param systems - Array of system functions to combine
 * @returns A single system that runs all provided systems
 * @example
 * ```typescript
 * const physicsSystem = combineSystems([gravitySystem, collisionSystem, velocitySystem]);
 * ```
 */
export function combineSystems<T extends BaseEntity>(systems: SystemFn<T>[]): SystemFn<T> {
  return (world: StrataWorld<T>, deltaTime: number) => {
    for (const system of systems) system(world, deltaTime);
  };
}

/**
 * Creates a conditional system that only runs when a predicate is true.
 * @param predicate - Function that returns whether to run the system
 * @param system - The system function to conditionally run
 * @returns A system that only executes when predicate returns true
 * @example
 * ```typescript
 * const pausableMovement = conditionalSystem(() => !isPaused, movementSystem);
 * ```
 */
export function conditionalSystem<T extends BaseEntity>(
  predicate: () => boolean,
  system: SystemFn<T>
): SystemFn<T> {
  return (world: StrataWorld<T>, deltaTime: number) => {
    if (predicate()) system(world, deltaTime);
  };
}
