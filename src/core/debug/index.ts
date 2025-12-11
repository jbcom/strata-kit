/**
 * Debug Module
 *
 * Debug utilities integrating leva for control panels and tunnel-rat for
 * React portals. Provides game development debugging tools with minimal overhead.
 *
 * @module core/debug
 * @public
 *
 * @example
 * ```typescript
 * import {
 *   useControls,
 *   useDebugControls,
 *   useCameraDebug,
 *   useStats,
 *   DebugOverlayTunnel,
 *   Leva
 * } from '@jbcom/strata/core/debug';
 *
 * function Game() {
 *   const camera = useCameraDebug();
 *   const stats = useStats();
 *
 *   const { wireframe, showGrid } = useDebugControls({
 *     wireframe: false,
 *     showGrid: true,
 *   });
 *
 *   return (
 *     <>
 *       <Leva collapsed />
 *       <Canvas>
 *         <PerspectiveCamera fov={camera.fov} />
 *         {showGrid && <Grid />}
 *         <Scene wireframe={wireframe} />
 *         <DebugOverlayTunnel.In>
 *           <div className="fps">FPS: {stats.fps.toFixed(0)}</div>
 *         </DebugOverlayTunnel.In>
 *       </Canvas>
 *       <DebugOverlayTunnel.Out />
 *     </>
 *   );
 * }
 * ```
 */

export {
  createDebugPanel,
  useDebugControls,
  useDebugFolder,
  useCameraDebug,
  usePhysicsDebug,
  useLightingDebug,
  usePostProcessingDebug,
  createDebugButton,
  Leva,
  LevaPanel,
  useControls,
  folder,
  button,
  useCreateStore,
} from './panel';

export {
  createTunnel,
  getTunnel,
  clearTunnels,
  getDebugTunnel,
  DebugOverlayTunnel,
  FPSCounterTunnel,
  StatsPanelTunnel,
  tunnelRat,
} from './tunnel';

export {
  useStats,
  formatStats,
  createStatsSnapshot,
  calculateAverageStats,
} from './stats';

export type {
  DebugPanelConfig,
  DebugPanelTheme,
  DebugValue,
  DebugSchema,
  DebugStore,
  DebugInputs,
  TunnelConfig,
  Tunnel,
  DebugTunnelId,
  PerformanceStats,
  StatsConfig,
  DebugPreset,
  CameraDebugValues,
  PhysicsDebugValues,
  LightingDebugValues,
  PostProcessingDebugValues,
} from './types';

export type { FormatStatsOptions, FormattedStats, StatsSnapshot } from './stats';
