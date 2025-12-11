/**
 * Strata ECS module - Entity Component System powered by Miniplex.
 * @module core/ecs
 * @public
 * @example
 * ```typescript
 * import { createWorld, createSystemScheduler, World } from '@jbcom/strata/core/ecs';
 * const world = createWorld<GameEntity>();
 * ```
 */

export { World } from 'miniplex';
export { default as createReactAPI } from 'miniplex-react';

export type {
  BaseEntity, WorldConfig, StrataWorld, ComponentKeys,
  RequiredComponents, OptionalComponents, Archetype, SystemFn, SystemConfig,
} from './types';

export {
  createWorld, createFromArchetype, generateEntityId, resetEntityIdCounter,
  hasComponents, addComponent, removeComponent, findEntityById, countEntities, ARCHETYPES,
} from './world';

export type { SystemScheduler } from './systems';
export { createSystemScheduler, createSystem, withTiming, combineSystems, conditionalSystem } from './systems';
