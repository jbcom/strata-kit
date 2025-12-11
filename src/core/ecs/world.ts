/**
 * World factory and entity management utilities for Strata ECS.
 * @module core/ecs/world
 * @public
 */

import { World } from 'miniplex';
import type { BaseEntity, WorldConfig, StrataWorld, Archetype } from './types';

let entityIdCounter = 0;

/**
 * Generates a unique entity ID.
 * @returns A unique string identifier
 * @example
 * ```typescript
 * const id = generateEntityId(); // 'entity_1'
 * ```
 */
export function generateEntityId(): string {
  return `entity_${++entityIdCounter}`;
}

/**
 * Resets the entity ID counter. Useful for testing.
 * @example
 * ```typescript
 * resetEntityIdCounter();
 * generateEntityId(); // 'entity_1'
 * ```
 */
export function resetEntityIdCounter(): void {
  entityIdCounter = 0;
}

/**
 * Creates a new Strata ECS world with enhanced utilities.
 * @param config - Optional configuration for the world
 * @returns A StrataWorld instance with entity management utilities
 * @throws {Error} When maxEntities is exceeded
 * @example
 * ```typescript
 * interface GameEntity extends BaseEntity { position: { x: number; y: number; z: number }; }
 * const world = createWorld<GameEntity>();
 * const player = world.spawn({ position: { x: 0, y: 0, z: 0 } });
 * ```
 */
export function createWorld<T extends BaseEntity>(config: WorldConfig<T> = {}): StrataWorld<T> {
  const miniplexWorld = new World<T>();
  const { enableLogging = false, maxEntities, initialEntities = [] } = config;
  const log = (msg: string) => { if (enableLogging) console.debug(`[Strata ECS] ${msg}`); };

  const spawn = (entity: T): T => {
    if (maxEntities && miniplexWorld.entities.length >= maxEntities) {
      throw new Error(`Maximum entity limit (${maxEntities}) reached`);
    }
    const e: T = { ...entity, id: entity.id ?? generateEntityId() };
    miniplexWorld.add(e);
    log(`Spawned entity: ${e.id}`);
    return e;
  };

  const despawn = (entity: T): void => {
    miniplexWorld.remove(entity);
    log(`Despawned entity: ${entity.id}`);
  };

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const query = <K extends keyof T>(...c: K[]) => miniplexWorld.with(...(c as any)) as Iterable<T>;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const queryWithout = <K extends keyof T>(...c: K[]) => miniplexWorld.without(...(c as any)) as Iterable<T>;

  const clear = (): void => {
    [...miniplexWorld.entities].forEach((e) => miniplexWorld.remove(e));
    log('Cleared all entities');
  };

  for (const entity of initialEntities) spawn(entity);

  return {
    world: miniplexWorld,
    spawn,
    despawn,
    query,
    queryWithout,
    get entities() { return miniplexWorld.entities as T[]; },
    get size() { return miniplexWorld.entities.length; },
    clear,
  };
}

/**
 * Creates an entity that matches a specific archetype.
 * @param archetype - The archetype definition
 * @param components - The component values for the entity
 * @returns A new entity matching the archetype
 * @example
 * ```typescript
 * const player = createFromArchetype(playerArchetype, { position: { x: 0, y: 0, z: 0 } });
 * ```
 */
export function createFromArchetype<T extends BaseEntity>(archetype: Archetype<T>, components: Partial<T>): T {
  for (const key of archetype.components) {
    if (!(key in components)) throw new Error(`Archetype '${archetype.name}' requires component '${String(key)}'`);
  }
  return { id: generateEntityId(), ...components } as T;
}

/** Common game entity archetypes for quick entity creation. @public */
export const ARCHETYPES = {
  MOVABLE: { name: 'movable', components: ['position', 'velocity'] as const, tags: ['physics'] },
  RENDERABLE: { name: 'renderable', components: ['position', 'mesh'] as const, tags: ['graphics'] },
  LIVING: { name: 'living', components: ['health'] as const, tags: ['combat'] },
  INTERACTIVE: { name: 'interactive', components: ['position', 'collider'] as const, tags: ['physics', 'interaction'] },
} as const;

/**
 * Checks if an entity has all specified components.
 * @param entity - The entity to check
 * @param components - Component keys to check for
 * @returns True if entity has all components
 * @example
 * ```typescript
 * hasComponents(entity, 'position', 'health'); // true or false
 * ```
 */
export function hasComponents<T extends BaseEntity>(entity: T, ...components: (keyof T)[]): boolean {
  return components.every((key) => key in entity && entity[key] !== undefined);
}

/**
 * Adds a component to an existing entity.
 * @param world - The Strata world
 * @param entity - The entity to modify
 * @param component - The component key
 * @param value - The component value
 * @example
 * ```typescript
 * addComponent(world, entity, 'velocity', { x: 1, y: 0, z: 0 });
 * ```
 */
export function addComponent<T extends BaseEntity, K extends keyof T>(
  world: StrataWorld<T>, entity: T, component: K, value: T[K]
): void {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  world.world.addComponent(entity, component as any, value);
}

/**
 * Removes a component from an existing entity.
 * @param world - The Strata world
 * @param entity - The entity to modify
 * @param component - The component key to remove
 * @example
 * ```typescript
 * removeComponent(world, entity, 'velocity');
 * ```
 */
export function removeComponent<T extends BaseEntity, K extends keyof T>(
  world: StrataWorld<T>, entity: T, component: K
): void {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  world.world.removeComponent(entity, component as any);
}

/**
 * Finds an entity by its ID.
 * @param world - The Strata world
 * @param id - The entity ID to find
 * @returns The entity if found, undefined otherwise
 * @example
 * ```typescript
 * const player = findEntityById(world, 'entity_1');
 * ```
 */
export function findEntityById<T extends BaseEntity>(world: StrataWorld<T>, id: string): T | undefined {
  return world.entities.find((e) => e.id === id);
}

/**
 * Counts entities matching a specific query.
 * @param world - The Strata world
 * @param components - Component keys to query
 * @returns Number of matching entities
 * @example
 * ```typescript
 * const movingCount = countEntities(world, 'position', 'velocity');
 * ```
 */
export function countEntities<T extends BaseEntity>(world: StrataWorld<T>, ...components: (keyof T)[]): number {
  let count = 0;
  for (const _ of world.query(...components)) count++;
  return count;
}
