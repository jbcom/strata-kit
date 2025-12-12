/**
 * State Management Module
 *
 * Zustand-based state management with Immer for immutable updates,
 * zundo for undo/redo, and cross-platform persistence adapters.
 *
 * @module core/state
 * @public
 *
 * @example
 * ```typescript
 * import { createGameStore } from '@jbcom/strata/core/state';
 *
 * const useGameStore = createGameStore({
 *   player: { health: 100, score: 0 },
 *   world: { time: 0, weather: 'clear' },
 * });
 *
 * // Use in React components
 * function HealthBar() {
 *   const health = useGameStore(s => s.data.player.health);
 *   const { set, undo, save } = useGameStore();
 *
 *   return <div>Health: {health}</div>;
 * }
 * ```
 */

export { createGameStore, createPersistenceAdapter } from './store';
export type { GameStoreApi, GameStoreState, GameStoreActions, GameStore } from './store';

export type {
    SaveData,
    CheckpointData,
    PersistenceAdapter,
    StoreConfig,
    CheckpointOptions,
    StateChangeType,
    StateChangeEvent,
    StateListener,
    AutoSaveConfig,
} from './types';

export { calculateChecksum, verifyChecksum } from './types';

export {
    WebPersistenceAdapter,
    webPersistenceAdapter,
    createWebPersistenceAdapter,
} from './adapters/web/persistence';

export { create, useStore } from 'zustand';
export { temporal } from 'zundo';
export { immer } from 'zustand/middleware/immer';
