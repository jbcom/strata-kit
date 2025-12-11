# Library Audit: Strata as a Curated R3F Ecosystem

## Philosophy

Strata's goal is to bring together the BEST existing libraries under one comprehensive procedural generation API. Custom implementations should be avoided - instead, wrap established, battle-tested libraries.

---

## LIBRARY INTEGRATIONS

### Core R3F Stack (Already Present)
| Library | Purpose | Status |
|---------|---------|--------|
| `three` | 3D rendering | ✅ Peer dep |
| `@react-three/fiber` | React reconciler | ✅ Peer dep |
| `@react-three/drei` | Helpers & utilities | ✅ Peer dep |
| `@react-three/rapier` | Physics | ✅ Installed |
| `@react-three/postprocessing` | Effects | ✅ Installed |
| `yuka` | AI behaviors | ✅ Installed |

### State Management - REPLACE CUSTOM
| Library | Purpose | Action |
|---------|---------|--------|
| `zustand` | State store | ✅ ADD - Replace custom GameState |
| `immer` | Immutable updates | ✅ ADD - Zustand middleware |
| `zundo` | Undo/redo middleware | ✅ ADD - Replace custom UndoStack |

**Migration**: Replace `src/core/state.ts` with Zustand store + zundo middleware

### Entity Component System - NEW
| Library | Purpose | Action |
|---------|---------|--------|
| `miniplex` | Lightweight ECS | ✅ ADD |
| `miniplex-react` | React bindings | ✅ ADD |

**Use for**: Entity management, game objects, AI entities, physics bodies

### Audio - REPLACE CUSTOM
| Library | Purpose | Action |
|---------|---------|--------|
| `howler` | 2D audio, formats | ✅ ADD |
| Three.PositionalAudio | 3D spatial audio | ✅ USE (already available) |

**Migration**: Replace `src/core/audio.ts` with Howler + Three audio wrappers

### Animation - EXTEND
| Library | Purpose | Action |
|---------|---------|--------|
| drei `useAnimations` | Clip playback | ✅ USE (already available) |
| `xstate` | State machines | ✅ ADD |
| `@xstate/react` | React bindings | ✅ ADD |

**Use for**: Animation state machines, blend trees, game state FSM

### Pathfinding/Graph - NEW
| Library | Purpose | Action |
|---------|---------|--------|
| `ngraph.graph` | Graph data structure | ✅ ADD |
| `ngraph.path` | A*, Dijkstra | ✅ ADD |

**Use for**: Yuka NavMesh integration, waypoint pathfinding, graph search

### Math & Noise - REPLACE CUSTOM
| Library | Purpose | Action |
|---------|---------|--------|
| `maath` | R3F math utilities | ✅ ADD |
| `simplex-noise` | Noise generation | ✅ ADD |

**Migration**: Replace custom noise in `src/core/sdf.ts` with simplex-noise

### Shaders - EXTEND
| Library | Purpose | Action |
|---------|---------|--------|
| `lamina` | Composable shaders | ✅ ADD |
| `glsl-noise` | GLSL snippets | 🟡 Consider |

**Use for**: Layered materials, shader composition

### Debug & Tooling - NEW
| Library | Purpose | Action |
|---------|---------|--------|
| `leva` | Debug panels | ✅ ADD |
| `tunnel-rat` | React portals | ✅ ADD |
| `@use-gesture/react` | Input gestures | 🟡 Optional |

### Additional R3F Ecosystem
| Library | Purpose | Action |
|---------|---------|--------|
| `@react-three/a11y` | Accessibility | 🟡 Consider |
| `@react-three/xr` | VR/AR | 🟡 Consider |
| `suspend-react` | Suspense utilities | 🟡 Consider |

---

## PACKAGE.JSON UPDATES

### New Dependencies
```json
{
  "dependencies": {
    "zustand": "^4.5.0",
    "immer": "^10.0.0",
    "zundo": "^2.1.0",
    "miniplex": "^2.0.0",
    "miniplex-react": "^2.0.0",
    "howler": "^2.2.4",
    "xstate": "^5.9.0",
    "@xstate/react": "^4.1.0",
    "ngraph.graph": "^20.0.1",
    "ngraph.path": "^1.4.0",
    "maath": "^0.10.0",
    "simplex-noise": "^4.0.1",
    "lamina": "^1.1.23",
    "leva": "^0.9.35",
    "tunnel-rat": "^0.1.2"
  }
}
```

### Peer Dependencies (Optional)
```json
{
  "peerDependenciesMeta": {
    "@use-gesture/react": { "optional": true },
    "@react-three/xr": { "optional": true }
  }
}
```

---

## MIGRATION PLAN

### Phase 1: Foundation (State, Audio, Animation)

1. **State Management**
   - Add zustand, immer, zundo
   - Create `src/core/store.ts` wrapping Zustand
   - Provide undo/redo, checkpoints, autosave as middleware/helpers
   - Deprecate old GameState API

2. **Audio System**
   - Add howler
   - Create `src/core/audio/` directory
   - `SpatialAudio` - wraps Three.PositionalAudio
   - `SoundManager` - wraps Howler for 2D/streaming
   - `AudioBus` - mixer hierarchy using Howler groups
   - Keep environment presets as configuration

3. **Animation System**
   - Add xstate, @xstate/react
   - Create `src/components/AnimationController.tsx`
   - Use drei's useAnimations for clip playback
   - Add `AnimationStateMachine` component using XState
   - Keep procedural animation (IK, springs) as complementary

### Phase 2: ECS, AI, Physics

4. **Entity Component System**
   - Add miniplex, miniplex-react
   - Create `src/core/ecs.ts` with entity archetypes
   - Provide systems for physics sync, AI, animation

5. **AI/Pathfinding**
   - Add ngraph.graph, ngraph.path
   - Create `src/core/pathfinding.ts`
   - Bridge Yuka NavMesh to ngraph
   - Expose A*, Dijkstra, BFS utilities

6. **Physics Fixes**
   - Fix Ragdoll with proper Rapier joints
   - Use Rapier's native KinematicCharacterController
   - Simplify wrappers to configuration-only

### Phase 3: Shaders, Math, Tooling

7. **Math & Noise**
   - Add maath, simplex-noise
   - Re-export maath utilities
   - Replace custom noise with simplex-noise

8. **Shader System**
   - Add lamina
   - Create composable shader layers
   - Keep custom GLSL for specialized effects

9. **Debug Tooling**
   - Add leva, tunnel-rat
   - Create debug panel presets
   - Provide performance monitors

---

## STRATA API DESIGN

Strata should provide a unified API that wraps these libraries:

```typescript
// Re-exports from ecosystem
export { useAnimations, useGLTF, useFBX } from '@react-three/drei';
export { RigidBody, CuboidCollider } from '@react-three/rapier';
export { EffectComposer, Bloom } from '@react-three/postprocessing';

// Strata-enhanced wrappers
export { useGameStore, useUndo, useCheckpoint } from './store';
export { useEntity, useSystem, World } from './ecs';
export { useSpatialAudio, useAudioBus } from './audio';
export { AnimationController, useAnimationState } from './animation';
export { usePathfinding, useNavMesh } from './pathfinding';

// Original Strata features (procedural generation)
export { Terrain, Water, Sky, Clouds } from './components';
export { GPUParticles, Weather } from './components';
export { IKChain, SpringBone, ProceduralWalk } from './components';
```

---

## SUMMARY

| System | Old (Custom) | New (Library) |
|--------|-------------|---------------|
| State | GameState class | Zustand + zundo |
| ECS | None | Miniplex |
| Audio | AudioManager | Howler + Three.Audio |
| Animation | Manual | drei + XState |
| Pathfinding | Partial Yuka | Yuka + ngraph |
| Math | Custom utils | maath |
| Noise | Custom functions | simplex-noise |
| Shaders | Custom GLSL | lamina + custom |
| Debug | None | leva |
