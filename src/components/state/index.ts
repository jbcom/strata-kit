/**
 * State Management React Components
 *
 * React integration for Zustand-based game state management.
 *
 * @module components/state
 * @public
 *
 * @example
 * ```tsx
 * import { GameStateProvider, useGameState, useSaveLoad } from './state';
 *
 * function App() {
 *   return (
 *     <GameStateProvider initialState={{ health: 100, score: 0 }}>
 *       <Game />
 *     </GameStateProvider>
 *   );
 * }
 *
 * function Game() {
 *   const health = useGameState(s => s.data.health);
 *   const { save, load } = useSaveLoad();
 *
 *   return <div>Health: {health}</div>;
 * }
 * ```
 */

export {
    GameStateProvider,
    GameStateContext,
    useGameStateContext,
    useGameState,
    useUndo,
    PersistGate,
    StateDebugger,
} from './context';

export { useSaveLoad, useCheckpoint, useAutoSave } from './hooks';

export type {
    GameStateContextValue,
    GameStateProviderProps,
    UseSaveLoadOptions,
    UseSaveLoadReturn,
    UseUndoReturn,
    UseCheckpointReturn,
    UseAutoSaveOptions,
    UseAutoSaveReturn,
    PersistGateProps,
    StateDebuggerProps,
    GameStoreApi,
    GameStore,
    CheckpointData,
    AutoSaveConfig,
    StateChangeEvent,
} from './types';
