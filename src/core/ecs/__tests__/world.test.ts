/**
 * Tests for Strata ECS world and system utilities.
 *
 * @module core/ecs/__tests__/world.test
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  createWorld,
  createFromArchetype,
  resetEntityIdCounter,
  hasComponents,
  addComponent,
  removeComponent,
  findEntityById,
  countEntities,
  ARCHETYPES,
} from '../world';
import {
  createSystemScheduler,
  createSystem,
  withTiming,
  combineSystems,
  conditionalSystem,
} from '../systems';
import type { BaseEntity, Archetype } from '../types';

interface TestEntity extends BaseEntity {
  position: { x: number; y: number; z: number };
  velocity?: { x: number; y: number; z: number };
  health?: number;
  mesh?: object;
  collider?: object;
}

describe('createWorld', () => {
  beforeEach(() => {
    resetEntityIdCounter();
  });

  describe('ideal case', () => {
    it('creates an empty world', () => {
      const world = createWorld<TestEntity>();

      expect(world.size).toBe(0);
      expect(world.entities).toEqual([]);
    });

    it('spawns entities with auto-generated IDs', () => {
      const world = createWorld<TestEntity>();

      const entity = world.spawn({
        position: { x: 0, y: 0, z: 0 },
      });

      expect(entity.id).toBe('entity_1');
      expect(world.size).toBe(1);
    });

    it('spawns entities with custom IDs', () => {
      const world = createWorld<TestEntity>();

      const entity = world.spawn({
        id: 'player',
        position: { x: 0, y: 0, z: 0 },
      });

      expect(entity.id).toBe('player');
    });
  });

  describe('normal usage', () => {
    it('spawns multiple entities', () => {
      const world = createWorld<TestEntity>();

      world.spawn({ position: { x: 0, y: 0, z: 0 } });
      world.spawn({ position: { x: 1, y: 0, z: 0 } });
      world.spawn({ position: { x: 2, y: 0, z: 0 } });

      expect(world.size).toBe(3);
    });

    it('despawns entities', () => {
      const world = createWorld<TestEntity>();

      const entity = world.spawn({ position: { x: 0, y: 0, z: 0 } });
      expect(world.size).toBe(1);

      world.despawn(entity);
      expect(world.size).toBe(0);
    });

    it('queries entities with specific components', () => {
      const world = createWorld<TestEntity>();

      world.spawn({ position: { x: 0, y: 0, z: 0 } });
      world.spawn({
        position: { x: 1, y: 0, z: 0 },
        velocity: { x: 1, y: 0, z: 0 },
      });
      world.spawn({
        position: { x: 2, y: 0, z: 0 },
        velocity: { x: 2, y: 0, z: 0 },
      });

      const moving = [...world.query('position', 'velocity')];
      expect(moving.length).toBe(2);
    });

    it('queries entities without specific components', () => {
      const world = createWorld<TestEntity>();

      world.spawn({ position: { x: 0, y: 0, z: 0 } });
      world.spawn({
        position: { x: 1, y: 0, z: 0 },
        velocity: { x: 1, y: 0, z: 0 },
      });

      const stationary = [...world.queryWithout('velocity')];
      expect(stationary.length).toBe(1);
    });

    it('initializes with initial entities', () => {
      const world = createWorld<TestEntity>({
        initialEntities: [
          { position: { x: 0, y: 0, z: 0 } },
          { position: { x: 1, y: 1, z: 1 } },
        ],
      });

      expect(world.size).toBe(2);
    });
  });

  describe('edge cases', () => {
    it('handles empty world queries', () => {
      const world = createWorld<TestEntity>();

      const results = [...world.query('position')];
      expect(results).toEqual([]);
    });

    it('handles many entities efficiently', () => {
      const world = createWorld<TestEntity>();

      for (let i = 0; i < 1000; i++) {
        world.spawn({
          position: { x: i, y: 0, z: 0 },
          velocity: i % 2 === 0 ? { x: 1, y: 0, z: 0 } : undefined,
        });
      }

      expect(world.size).toBe(1000);

      const moving = [...world.query('velocity')];
      expect(moving.length).toBe(500);
    });

    it('clears all entities', () => {
      const world = createWorld<TestEntity>();

      world.spawn({ position: { x: 0, y: 0, z: 0 } });
      world.spawn({ position: { x: 1, y: 0, z: 0 } });

      world.clear();
      expect(world.size).toBe(0);
    });

    it('handles entity with all optional components missing', () => {
      const world = createWorld<TestEntity>();

      const entity = world.spawn({
        position: { x: 0, y: 0, z: 0 },
      });

      expect(entity.velocity).toBeUndefined();
      expect(entity.health).toBeUndefined();
    });
  });

  describe('error cases', () => {
    it('throws when maxEntities exceeded', () => {
      const world = createWorld<TestEntity>({ maxEntities: 2 });

      world.spawn({ position: { x: 0, y: 0, z: 0 } });
      world.spawn({ position: { x: 1, y: 0, z: 0 } });

      expect(() => {
        world.spawn({ position: { x: 2, y: 0, z: 0 } });
      }).toThrow('Maximum entity limit (2) reached');
    });
  });
});

describe('createFromArchetype', () => {
  beforeEach(() => {
    resetEntityIdCounter();
  });

  it('creates entity matching archetype', () => {
    const archetype: Archetype<TestEntity> = {
      name: 'movable',
      components: ['position', 'velocity'],
    };

    const entity = createFromArchetype(archetype, {
      position: { x: 0, y: 0, z: 0 },
      velocity: { x: 1, y: 0, z: 0 },
    });

    expect(entity.position).toEqual({ x: 0, y: 0, z: 0 });
    expect(entity.velocity).toEqual({ x: 1, y: 0, z: 0 });
    expect(entity.id).toBeDefined();
  });

  it('throws when required component is missing', () => {
    const archetype: Archetype<TestEntity> = {
      name: 'movable',
      components: ['position', 'velocity'],
    };

    expect(() => {
      createFromArchetype(archetype, {
        position: { x: 0, y: 0, z: 0 },
      });
    }).toThrow("Archetype 'movable' requires component 'velocity'");
  });
});

describe('hasComponents', () => {
  it('returns true when entity has all components', () => {
    const entity: TestEntity = {
      position: { x: 0, y: 0, z: 0 },
      velocity: { x: 1, y: 0, z: 0 },
    };

    expect(hasComponents(entity, 'position', 'velocity')).toBe(true);
  });

  it('returns false when entity is missing a component', () => {
    const entity: TestEntity = {
      position: { x: 0, y: 0, z: 0 },
    };

    expect(hasComponents(entity, 'position', 'velocity')).toBe(false);
  });
});

describe('addComponent and removeComponent', () => {
  beforeEach(() => {
    resetEntityIdCounter();
  });

  it('adds component to entity', () => {
    const world = createWorld<TestEntity>();
    const entity = world.spawn({ position: { x: 0, y: 0, z: 0 } });

    addComponent(world, entity, 'velocity', { x: 1, y: 0, z: 0 });

    expect(entity.velocity).toEqual({ x: 1, y: 0, z: 0 });
  });

  it('removes component from entity', () => {
    const world = createWorld<TestEntity>();
    const entity = world.spawn({
      position: { x: 0, y: 0, z: 0 },
      velocity: { x: 1, y: 0, z: 0 },
    });

    removeComponent(world, entity, 'velocity');

    expect(entity.velocity).toBeUndefined();
  });
});

describe('findEntityById', () => {
  beforeEach(() => {
    resetEntityIdCounter();
  });

  it('finds entity by ID', () => {
    const world = createWorld<TestEntity>();
    world.spawn({ id: 'player', position: { x: 0, y: 0, z: 0 } });

    const found = findEntityById(world, 'player');
    expect(found?.id).toBe('player');
  });

  it('returns undefined for non-existent ID', () => {
    const world = createWorld<TestEntity>();

    const found = findEntityById(world, 'nonexistent');
    expect(found).toBeUndefined();
  });
});

describe('countEntities', () => {
  beforeEach(() => {
    resetEntityIdCounter();
  });

  it('counts entities with specific components', () => {
    const world = createWorld<TestEntity>();

    world.spawn({ position: { x: 0, y: 0, z: 0 } });
    world.spawn({
      position: { x: 1, y: 0, z: 0 },
      velocity: { x: 1, y: 0, z: 0 },
    });
    world.spawn({
      position: { x: 2, y: 0, z: 0 },
      velocity: { x: 2, y: 0, z: 0 },
    });

    expect(countEntities(world, 'velocity')).toBe(2);
    expect(countEntities(world, 'position')).toBe(3);
  });
});

describe('ARCHETYPES', () => {
  it('defines common archetypes', () => {
    expect(ARCHETYPES.MOVABLE.components).toEqual(['position', 'velocity']);
    expect(ARCHETYPES.RENDERABLE.components).toEqual(['position', 'mesh']);
    expect(ARCHETYPES.LIVING.components).toEqual(['health']);
    expect(ARCHETYPES.INTERACTIVE.components).toEqual(['position', 'collider']);
  });
});

describe('createSystemScheduler', () => {
  beforeEach(() => {
    resetEntityIdCounter();
  });

  describe('ideal case', () => {
    it('registers and runs systems', () => {
      const world = createWorld<TestEntity>();
      const scheduler = createSystemScheduler<TestEntity>();
      const mockFn = vi.fn();

      scheduler.register({
        name: 'test',
        fn: mockFn,
      });

      scheduler.run(world, 1 / 60);

      expect(mockFn).toHaveBeenCalledWith(world, 1 / 60);
    });
  });

  describe('normal usage', () => {
    it('runs systems in priority order', () => {
      const world = createWorld<TestEntity>();
      const scheduler = createSystemScheduler<TestEntity>();
      const order: string[] = [];

      scheduler.register({
        name: 'last',
        fn: () => order.push('last'),
        priority: 100,
      });

      scheduler.register({
        name: 'first',
        fn: () => order.push('first'),
        priority: 0,
      });

      scheduler.register({
        name: 'middle',
        fn: () => order.push('middle'),
        priority: 50,
      });

      scheduler.run(world, 1 / 60);

      expect(order).toEqual(['first', 'middle', 'last']);
    });

    it('enables and disables systems', () => {
      const world = createWorld<TestEntity>();
      const scheduler = createSystemScheduler<TestEntity>();
      const mockFn = vi.fn();

      scheduler.register({ name: 'test', fn: mockFn });

      scheduler.disable('test');
      scheduler.run(world, 1 / 60);
      expect(mockFn).not.toHaveBeenCalled();

      scheduler.enable('test');
      scheduler.run(world, 1 / 60);
      expect(mockFn).toHaveBeenCalled();
    });

    it('unregisters systems', () => {
      const scheduler = createSystemScheduler<TestEntity>();

      scheduler.register({ name: 'test', fn: vi.fn() });
      expect(scheduler.getSystemNames()).toContain('test');

      scheduler.unregister('test');
      expect(scheduler.getSystemNames()).not.toContain('test');
    });
  });

  describe('edge cases', () => {
    it('handles no registered systems', () => {
      const world = createWorld<TestEntity>();
      const scheduler = createSystemScheduler<TestEntity>();

      expect(() => scheduler.run(world, 1 / 60)).not.toThrow();
    });

    it('clears all systems', () => {
      const scheduler = createSystemScheduler<TestEntity>();

      scheduler.register({ name: 'a', fn: vi.fn() });
      scheduler.register({ name: 'b', fn: vi.fn() });

      scheduler.clear();
      expect(scheduler.getSystemNames()).toEqual([]);
    });
  });

  describe('error cases', () => {
    it('throws when registering duplicate system name', () => {
      const scheduler = createSystemScheduler<TestEntity>();

      scheduler.register({ name: 'test', fn: vi.fn() });

      expect(() => {
        scheduler.register({ name: 'test', fn: vi.fn() });
      }).toThrow("System 'test' is already registered");
    });
  });
});

describe('createSystem', () => {
  beforeEach(() => {
    resetEntityIdCounter();
  });

  it('creates a system that iterates matching entities', () => {
    const world = createWorld<TestEntity>();

    world.spawn({
      position: { x: 0, y: 0, z: 0 },
      velocity: { x: 1, y: 0, z: 0 },
    });

    const movementSystem = createSystem<TestEntity>(
      ['position', 'velocity'],
      (entity, delta) => {
        entity.position.x += entity.velocity!.x * delta;
      }
    );

    movementSystem(world, 1);

    const entities = [...world.query('position')];
    expect(entities[0].position.x).toBe(1);
  });
});

describe('withTiming', () => {
  it('wraps system with performance logging', () => {
    const consoleSpy = vi.spyOn(console, 'debug').mockImplementation(() => {});
    const world = createWorld<TestEntity>();
    const mockFn = vi.fn();

    const timedSystem = withTiming<TestEntity>('test', mockFn);
    timedSystem(world, 1 / 60);

    expect(mockFn).toHaveBeenCalled();
    expect(consoleSpy).toHaveBeenCalled();
    expect(consoleSpy.mock.calls[0][0]).toContain('[System: test]');

    consoleSpy.mockRestore();
  });
});

describe('combineSystems', () => {
  it('combines multiple systems into one', () => {
    const world = createWorld<TestEntity>();
    const calls: string[] = [];

    const combined = combineSystems<TestEntity>([
      () => { calls.push('a'); },
      () => { calls.push('b'); },
      () => { calls.push('c'); },
    ]);

    combined(world, 1 / 60);

    expect(calls).toEqual(['a', 'b', 'c']);
  });
});

describe('conditionalSystem', () => {
  it('only runs when predicate is true', () => {
    const world = createWorld<TestEntity>();
    let isPaused = true;
    const mockFn = vi.fn();

    const pausable = conditionalSystem<TestEntity>(() => !isPaused, mockFn);

    pausable(world, 1 / 60);
    expect(mockFn).not.toHaveBeenCalled();

    isPaused = false;
    pausable(world, 1 / 60);
    expect(mockFn).toHaveBeenCalled();
  });
});
