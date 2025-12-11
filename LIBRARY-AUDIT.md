# Library Audit: Custom vs Library Solutions

## Summary

This audit identifies unnecessary custom implementations that could use existing libraries, and missing libraries that would add significant value.

---

## UNNECESSARY CUSTOM IMPLEMENTATIONS

### 1. State Management (src/core/state.ts) - KEEP CUSTOM ✅
**Current**: Custom GameState, UndoStack, SaveSystem, Checkpoint classes
**Alternative**: Zustand, Jotai, or Valtio

**Verdict**: KEEP CUSTOM
- Game-specific features (checkpoints, save slots, autosave)
- Undo/redo tailored for game state
- No React dependency in core (important for framework-agnostic design)
- Zustand would add dependency overhead for minimal benefit

### 2. Audio System (src/core/audio.ts) - PARTIAL REPLACE 🔄
**Current**: Custom AudioSource, AmbientSource, SoundPool, ReverbEffect, AudioManager
**Alternative**: 
- Three.js PositionalAudio, AudioListener (already in peer deps)
- Howler.js (5kb, excellent browser support)
- Tone.js (comprehensive but heavy)

**Verdict**: HYBRID APPROACH
- Three.js audio integrates naturally with R3F scene graph
- Current implementation duplicates Web Audio API features Three.js already wraps
- BUT: Keep environment effects, sound pooling (Three.js lacks these)

**Recommendation**: 
- Add `howler` (peer dep) for 2D audio, fallbacks, format support
- Refactor spatial audio to wrap Three.js PositionalAudio
- Keep ReverbEffect, EnvironmentEffect, SoundPool (original features)

### 3. Noise/Random Functions (src/core/sdf.ts) - CONSIDER LIBRARY 🟡
**Current**: Custom noise3D, fbm, hash functions
**Alternative**: simplex-noise, noisejs, or glsl-noise

**Verdict**: OPTIONAL
- Current implementation is ~100 lines, well-tested
- Adding a library for just noise would be overhead
- GLSL noise is needed anyway for shaders (can't use JS library there)
- KEEP for consistency between JS and GLSL

### 4. Marching Cubes (src/core/marching-cubes.ts) - KEEP CUSTOM ✅
**Current**: Custom implementation with edge/tri tables
**Alternative**: Three.js MarchingCubes (exists in examples)

**Verdict**: KEEP CUSTOM
- Current impl is SDF-focused with proper normal generation
- Three.js version is metaball-focused, different use case
- Custom gives control over performance optimizations

---

## MISSING LIBRARIES TO ADD

### 1. Animation Clip Support - ADD drei's useAnimations ✅
**Gap**: No animation clip playback from FBX/GLTF
**Solution**: Re-export and extend `@react-three/drei`'s `useAnimations` hook
**Effort**: Low - already a peer dependency

### 2. Graph/Pathfinding Algorithms - ADD ngraph or pathfinding ✅
**Gap**: No A*, Dijkstra, BFS for AI navigation
**Options**:
- `ngraph.path` - Lightweight, flexible graph algorithms
- `pathfinding` - A* focused, grid-based
- `javascript-astar` - Simple A* implementation

**Recommendation**: Add `ngraph.path` + `ngraph.graph`
- Works with arbitrary graphs (not just grids)
- Integrates with Yuka's NavMesh
- ~10kb total

### 3. Easing Functions - ADD @tweenjs/tween.js or popmotion ✅
**Gap**: Limited animation easing in current code
**Options**:
- `@tweenjs/tween.js` - Lightweight, well-known
- `popmotion` - Modern, includes springs
- Just export Three.js MathUtils (already available)

**Recommendation**: Use Three.js MathUtils (already available)
- Has smoothstep, smootherstep, lerp, clamp, mapLinear
- No new dependency needed

### 4. Input Gestures - CONSIDER hammer.js or use-gesture 🟡
**Gap**: Basic input in src/core/input.ts
**Options**:
- `@use-gesture/react` - React-focused gestures
- `hammer.js` - Vanilla JS gestures

**Recommendation**: SKIP for now
- Current InputManager covers most game needs
- Gestures are more for UI than games

### 5. Mesh Simplification - ADD meshoptimizer 🟡
**Gap**: LOD system exists but no mesh decimation
**Options**:
- `meshoptimizer` (WASM) - Best quality, used by glTF
- Three.js SimplifyModifier (in examples)

**Recommendation**: Add `meshoptimizer` as optional peer dep
- Only needed for advanced LOD workflows
- WASM so can't be bundled directly

### 6. Post-Processing Effects - ALREADY HAVE ✅
`postprocessing` and `@react-three/postprocessing` already installed.
Just need to wrap more effects (GodRays, Outline, Glitch).

---

## DEPENDENCIES TO ADD

### Required (High Value)
```json
{
  "ngraph.graph": "^20.0.1",
  "ngraph.path": "^1.4.0"
}
```

### Peer Dependencies (Optional)
```json
{
  "peerDependencies": {
    "howler": ">=2.2.0"
  },
  "peerDependenciesMeta": {
    "howler": { "optional": true }
  }
}
```

### Already Installed (Need to Use More)
- `yuka` - Use full Graph, Fuzzy Logic modules
- `postprocessing` - Wrap more effects
- `@react-three/drei` - Re-export useAnimations, useGLTF, etc.

---

## ACTION ITEMS

### Phase 1: Use Existing Libraries Better
1. ✅ Wrap `@react-three/drei` useAnimations for clip playback
2. ✅ Wrap more `postprocessing` effects
3. ✅ Use full Yuka API (Graph, FuzzyModule, MessageDispatcher)

### Phase 2: Add Missing Libraries
4. Add `ngraph.graph` + `ngraph.path` for graph algorithms
5. Add optional `howler` peer dep for audio fallbacks

### Phase 3: Fix Critical Bugs
6. Fix Ragdoll joints (use Rapier properly)
7. Fix CharacterController (use native Rapier KinematicCharacterController)

---

## VERDICT SUMMARY

| Area | Current | Recommendation |
|------|---------|----------------|
| State Management | Custom | Keep (game-specific) |
| Audio | Custom | Hybrid (Three.js spatial + custom effects) |
| Noise/Math | Custom | Keep (needed for GLSL parity) |
| Marching Cubes | Custom | Keep (SDF-focused) |
| Animation | Missing | Use drei's useAnimations |
| Graph Search | Missing | Add ngraph |
| Easing | Minimal | Use Three.js MathUtils |
| Mesh Simplify | Missing | Optional meshoptimizer |
