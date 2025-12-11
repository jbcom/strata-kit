/**
 * State Store Unit Tests
 * 
 * Tests for createGameStore with ideal, normal, edge, and error cases.
 * 
 * @module core/state/__tests__/store.test
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { createGameStore, createPersistenceAdapter } from '../store';
import type { PersistenceAdapter, SaveData } from '../types';

interface TestState {
  count: number;
  name: string;
  items: string[];
}

const initialState: TestState = {
  count: 0,
  name: 'test',
  items: [],
};

describe('createGameStore', () => {
  describe('ideal case - basic operations', () => {
    it('creates store with initial state', () => {
      const store = createGameStore(initialState);
      const state = store.getState();
      
      expect(state.data.count).toBe(0);
      expect(state.data.name).toBe('test');
      expect(state.data.items).toEqual([]);
    });

    it('updates state via set with object', () => {
      const store = createGameStore(initialState);
      
      store.getState().set({ count: 10, name: 'updated', items: ['a'] });
      
      expect(store.getState().data.count).toBe(10);
      expect(store.getState().data.name).toBe('updated');
      expect(store.getState().data.items).toEqual(['a']);
    });

    it('updates state via set with function', () => {
      const store = createGameStore(initialState);
      
      store.getState().set((prev) => ({ ...prev, count: prev.count + 5 }));
      
      expect(store.getState().data.count).toBe(5);
    });

    it('patches state partially', () => {
      const store = createGameStore(initialState);
      
      store.getState().patch({ count: 42 });
      
      expect(store.getState().data.count).toBe(42);
      expect(store.getState().data.name).toBe('test');
    });

    it('resets state to initial', () => {
      const store = createGameStore(initialState);
      
      store.getState().set({ count: 100, name: 'changed', items: ['x'] });
      store.getState().reset();
      
      expect(store.getState().data).toEqual(initialState);
    });
  });

  describe('normal usage - undo/redo', () => {
    it('supports undo after state change', () => {
      const store = createGameStore(initialState);
      
      store.getState().set({ ...initialState, count: 10 });
      expect(store.getState().data.count).toBe(10);
      
      store.getState().undo();
      expect(store.getState().data.count).toBe(0);
    });

    it('supports redo after undo', () => {
      const store = createGameStore(initialState);
      
      store.getState().set({ ...initialState, count: 10 });
      store.getState().undo();
      store.getState().redo();
      
      expect(store.getState().data.count).toBe(10);
    });

    it('reports canUndo correctly', () => {
      const store = createGameStore(initialState);
      
      expect(store.getState().canUndo()).toBe(false);
      
      store.getState().set({ ...initialState, count: 5 });
      expect(store.getState().canUndo()).toBe(true);
    });

    it('reports canRedo correctly', () => {
      const store = createGameStore(initialState);
      
      store.getState().set({ ...initialState, count: 5 });
      expect(store.getState().canRedo()).toBe(false);
      
      store.getState().undo();
      expect(store.getState().canRedo()).toBe(true);
    });

    it('clears history', () => {
      const store = createGameStore(initialState);
      
      store.getState().set({ ...initialState, count: 5 });
      store.getState().set({ ...initialState, count: 10 });
      store.getState().clearHistory();
      
      expect(store.getState().canUndo()).toBe(false);
    });
  });

  describe('normal usage - persistence', () => {
    let mockAdapter: PersistenceAdapter;
    let storage: Map<string, SaveData<TestState>>;

    beforeEach(() => {
      storage = new Map();
      mockAdapter = {
        save: vi.fn(async (key, data) => {
          storage.set(key, data as SaveData<TestState>);
          return true;
        }),
        load: vi.fn(async (key) => storage.get(key) ?? null),
        delete: vi.fn(async (key) => {
          storage.delete(key);
          return true;
        }),
        listSaves: vi.fn(async (prefix) => {
          return Array.from(storage.keys())
            .filter(k => k.startsWith(prefix))
            .map(k => k.slice(prefix.length + 1));
        }),
        getSaveInfo: vi.fn(async (key) => {
          const data = storage.get(key);
          return data ? { timestamp: data.timestamp, version: data.version } : null;
        }),
      };
    });

    it('saves and loads state', async () => {
      const store = createGameStore(initialState, {
        persistenceAdapter: mockAdapter,
      });
      
      store.getState().set({ ...initialState, count: 42 });
      
      const saved = await store.getState().save('slot1');
      expect(saved).toBe(true);
      expect(mockAdapter.save).toHaveBeenCalled();
      
      store.getState().reset();
      expect(store.getState().data.count).toBe(0);
      
      const loaded = await store.getState().load('slot1');
      expect(loaded).toBe(true);
      expect(store.getState().data.count).toBe(42);
    });

    it('lists saves', async () => {
      const store = createGameStore(initialState, {
        persistenceAdapter: mockAdapter,
        storagePrefix: 'test_prefix',
      });
      
      await store.getState().save('save1');
      await store.getState().save('save2');
      
      const saves = await store.getState().listSaves();
      expect(saves).toContain('save1');
      expect(saves).toContain('save2');
    });

    it('deletes saves', async () => {
      const store = createGameStore(initialState, {
        persistenceAdapter: mockAdapter,
      });
      
      await store.getState().save('toDelete');
      expect(storage.size).toBeGreaterThan(0);
      
      await store.getState().deleteSave('toDelete');
      expect(mockAdapter.delete).toHaveBeenCalled();
    });
  });

  describe('normal usage - checkpoints', () => {
    it('creates and restores checkpoints', async () => {
      const store = createGameStore(initialState, { enablePersistence: false });
      
      store.getState().set({ ...initialState, count: 100 });
      await store.getState().createCheckpoint('checkpoint1');
      
      store.getState().set({ ...initialState, count: 200 });
      expect(store.getState().data.count).toBe(200);
      
      await store.getState().restoreCheckpoint('checkpoint1');
      expect(store.getState().data.count).toBe(100);
    });

    it('lists checkpoints', async () => {
      const store = createGameStore(initialState, { enablePersistence: false });
      
      await store.getState().createCheckpoint('cp1', { description: 'First checkpoint' });
      await store.getState().createCheckpoint('cp2', { description: 'Second checkpoint' });
      
      const checkpoints = store.getState().listCheckpoints();
      expect(checkpoints).toHaveLength(2);
      expect(checkpoints.find(c => c.name === 'cp1')?.description).toBe('First checkpoint');
    });

    it('deletes checkpoints', async () => {
      const store = createGameStore(initialState, { enablePersistence: false });
      
      await store.getState().createCheckpoint('toDelete');
      expect(store.getState().listCheckpoints()).toHaveLength(1);
      
      await store.getState().deleteCheckpoint('toDelete');
      expect(store.getState().listCheckpoints()).toHaveLength(0);
    });
  });

  describe('edge cases', () => {
    it('handles empty initial state', () => {
      const store = createGameStore({});
      expect(store.getState().data).toEqual({});
    });

    it('handles deeply nested state', () => {
      interface DeepState {
        level1: {
          level2: {
            level3: {
              value: number;
            };
          };
        };
      }
      
      const deepInitial: DeepState = {
        level1: { level2: { level3: { value: 0 } } },
      };
      
      const store = createGameStore(deepInitial);
      
      store.getState().set({
        level1: { level2: { level3: { value: 42 } } },
      });
      
      expect(store.getState().data.level1.level2.level3.value).toBe(42);
    });

    it('handles rapid state updates', () => {
      const store = createGameStore(initialState);
      
      for (let i = 0; i < 100; i++) {
        store.getState().patch({ count: i });
      }
      
      expect(store.getState().data.count).toBe(99);
    });

    it('limits undo history to maxUndoHistory', () => {
      const store = createGameStore(initialState, { maxUndoHistory: 5 });
      
      for (let i = 1; i <= 10; i++) {
        store.getState().set({ ...initialState, count: i });
      }
      
      let undoCount = 0;
      while (store.getState().canUndo()) {
        store.getState().undo();
        undoCount++;
      }
      
      expect(undoCount).toBeLessThanOrEqual(5);
    });

    it('returns false when restoring non-existent checkpoint', async () => {
      const store = createGameStore(initialState, { enablePersistence: false });
      
      const result = await store.getState().restoreCheckpoint('nonexistent');
      expect(result).toBe(false);
    });
  });

  describe('error cases', () => {
    it('handles persistence disabled gracefully', async () => {
      const store = createGameStore(initialState, { enablePersistence: false });
      
      const saved = await store.getState().save('slot1');
      expect(saved).toBe(false);
      
      const loaded = await store.getState().load('slot1');
      expect(loaded).toBe(false);
    });

    it('handles failing persistence adapter', async () => {
      const failingAdapter: PersistenceAdapter = {
        save: vi.fn(async () => false),
        load: vi.fn(async () => null),
        delete: vi.fn(async () => false),
        listSaves: vi.fn(async () => []),
        getSaveInfo: vi.fn(async () => null),
      };
      
      const store = createGameStore(initialState, {
        persistenceAdapter: failingAdapter,
      });
      
      const saved = await store.getState().save();
      expect(saved).toBe(false);
    });
  });
});

describe('createPersistenceAdapter', () => {
  it('validates adapter has required methods', () => {
    const validAdapter: PersistenceAdapter = {
      save: async () => true,
      load: async () => null,
      delete: async () => true,
      listSaves: async () => [],
      getSaveInfo: async () => null,
    };
    
    expect(() => createPersistenceAdapter(validAdapter)).not.toThrow();
  });

  it('throws when adapter missing methods', () => {
    const invalidAdapter = {
      save: async () => true,
    } as unknown as PersistenceAdapter;
    
    expect(() => createPersistenceAdapter(invalidAdapter)).toThrow(
      /missing required method/
    );
  });
});
