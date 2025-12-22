/**
 * World factory and entity management utilities for Strata ECS.
 * @packageDocumentation
 * @module core/ecs/world
 * @category Game Systems
 */

import { World } from 'miniplex';
import type { Archetype, BaseEntity, QueryResult, StrataWorld, WorldConfig } from './types';

let entityIdCounter = 0;

/**
 * Generates a unique entity ID.
 * @category Game Systems
 * @returns A unique string identifier.
 */
export function generateEntityId(): string {
    return `entity_${++entityIdCounter}`;
}

/**
 * Resets the entity ID counter. Useful for testing.
 * @category Game Systems
 */
export function resetEntityIdCounter(): void {
    entityIdCounter = 0;
}

/**
 * Creates a new Strata ECS world with enhanced utilities.
 *
 * @category Game Systems
 * @param config - Optional configuration for the world.
 * @returns A StrataWorld instance with entity management utilities.
 * @throws {Error} When maxEntities is exceeded.
 */
export function createWorld<T extends BaseEntity>(config: WorldConfig<T> = {}): StrataWorld<T> {
    const miniplexWorld = new World<T>();
    const { enableLogging = false, maxEntities, initialEntities = [] } = config;

    // O(1) entity lookup by ID - updated on spawn/despawn/clear
    const entitiesById = new Map<string, T>();

    const log = (msg: string) => {
        if (enableLogging) console.debug(`[Strata ECS] ${msg}`);
    };

    const spawn = (entity: T): T => {
        if (maxEntities && miniplexWorld.entities.length >= maxEntities) {
            throw new Error(`Maximum entity limit (${maxEntities}) reached`);
        }
        const e: T = { ...entity, id: entity.id ?? generateEntityId() };
        miniplexWorld.add(e);
        entitiesById.set(e.id!, e);
        log(`Spawned entity: ${e.id}`);
        return e;
    };

    const despawn = (entity: T): void => {
        miniplexWorld.remove(entity);
        if (entity.id) entitiesById.delete(entity.id);
        log(`Despawned entity: ${entity.id}`);
    };

    const query = <K extends keyof T>(...c: K[]): QueryResult<T> =>
        miniplexWorld.with(...c) as QueryResult<T>;

    const queryWithout = <K extends keyof T>(...c: K[]): QueryResult<T> =>
        miniplexWorld.without(...c) as QueryResult<T>;

    const clear = (): void => {
        [...miniplexWorld.entities].forEach((e) => miniplexWorld.remove(e));
        entitiesById.clear();
        log('Cleared all entities');
    };

    /**
     * O(1) entity lookup by ID.
     * @param id - The entity ID to find
     * @returns The entity if found, undefined otherwise
     */
    const findById = (id: string): T | undefined => entitiesById.get(id);

    for (const entity of initialEntities) spawn(entity);

    return {
        world: miniplexWorld,
        spawn,
        despawn,
        query,
        queryWithout,
        findById,
        get entities() {
            return miniplexWorld.entities as T[];
        },
        get size() {
            return miniplexWorld.entities.length;
        },
        clear,
    };
}

/**
 * Creates an entity that matches a specific archetype.
 *
 * @category Game Systems
 * @param archetype - The archetype definition.
 * @param components - The component values for the entity.
 * @returns A new entity matching the archetype.
 */
export function createFromArchetype<T extends BaseEntity>(
    archetype: Archetype<T>,
    components: Partial<T>
): T {
    for (const key of archetype.components) {
        // Check both presence and non-undefined value for consistency with hasComponents
        if (!(key in components) || components[key] === undefined)
            throw new Error(`Archetype '${archetype.name}' requires component '${String(key)}'`);
    }
    // Use nullish coalescing to ensure components.id=undefined doesn't overwrite the generated ID
    const id = components.id ?? generateEntityId();
    return { ...components, id } as T;
}

/**
 * Common game entity archetypes for quick entity creation.
 * @category Game Systems
 */
export const ARCHETYPES = {
    MOVABLE: { name: 'movable', components: ['position', 'velocity'] as const, tags: ['physics'] },
    RENDERABLE: {
        name: 'renderable',
        components: ['position', 'mesh'] as const,
        tags: ['graphics'],
    },
    LIVING: { name: 'living', components: ['health'] as const, tags: ['combat'] },
    INTERACTIVE: {
        name: 'interactive',
        components: ['position', 'collider'] as const,
        tags: ['physics', 'interaction'],
    },
} as const;

/**
 * Checks if an entity has all specified components.
 *
 * @category Game Systems
 * @param entity - The entity to check.
 * @param components - Component keys to check for.
 * @returns True if entity has all components.
 */
export function hasComponents<T extends BaseEntity>(
    entity: T,
    ...components: (keyof T)[]
): boolean {
    return components.every((key) => key in entity && entity[key] !== undefined);
}

/**
 * Adds a component to an existing entity.
 *
 * @category Game Systems
 * @param world - The Strata world.
 * @param entity - The entity to modify.
 * @param component - The component key.
 * @param value - The component value.
 */
export function addComponent<T extends BaseEntity, K extends keyof T>(
    world: StrataWorld<T>,
    entity: T,
    component: K,
    value: T[K]
): void {
    world.world.addComponent(entity, component, value);
}

/**
 * Removes a component from an existing entity.
 *
 * @category Game Systems
 * @param world - The Strata world.
 * @param entity - The entity to modify.
 * @param component - The component key to remove.
 */
export function removeComponent<T extends BaseEntity, K extends keyof T>(
    world: StrataWorld<T>,
    entity: T,
    component: K
): void {
    world.world.removeComponent(entity, component);
}

/**
 * Finds an entity by its ID.
 * Uses O(1) lookup via internal Map when available, falls back to O(n) search.
 *
 * @category Game Systems
 * @param world - The Strata world.
 * @param id - The entity ID to find.
 * @returns The entity if found, undefined otherwise.
 */
export function findEntityById<T extends BaseEntity>(
    world: StrataWorld<T>,
    id: string
): T | undefined {
    // Use O(1) lookup if available (preferred)
    if (world.findById) {
        return world.findById(id);
    }
    // Fallback to O(n) for backwards compatibility
    return world.entities.find((e) => e.id === id);
}

/**
 * Counts entities matching a specific query.
 * Uses O(1) size property from Miniplex archetypes when available.
 *
 * @category Game Systems
 * @param world - The Strata world.
 * @param components - Component keys to query.
 * @returns Number of matching entities.
 */
export function countEntities<T extends BaseEntity>(
    world: StrataWorld<T>,
    ...components: (keyof T)[]
): number {
    const result = world.query(...components);
    // Use O(1) size property from Miniplex archetype if available
    if ('size' in result && typeof result.size === 'number') {
        return result.size;
    }
    // Fallback to iteration (should not be needed with Miniplex)
    let count = 0;
    for (const _ of result) count++;
    return count;
}
