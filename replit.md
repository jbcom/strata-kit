# Strata - Comprehensive 3D Gaming Library for React Three Fiber

## Overview
Strata is a world-class procedural 3D graphics and game development library for React Three Fiber. It provides production-ready components for terrain, water, vegetation, sky, volumetrics, characters, particles, weather, cameras, AI, audio, physics, post-processing, animation, state management, UI, shaders, and interactive controls.

## Project Structure
- `src/` - TypeScript source code for the library
  - `components/` - React Three Fiber components
  - `core/` - Core algorithms (marching cubes, SDF, particles, weather, audio, AI, physics, animation, state, UI)
  - `presets/` - Pre-configured setups for various effects
  - `shaders/` - GLSL shader code and custom materials
  - `hooks/` - React hooks (useYuka for AI behaviors, useGameState, useUndo, etc.)
  - `utils/` - Utility functions
- `docs-site/` - Vite + React documentation site with interactive demos
  - `src/pages/demos/` - Live demo pages for each feature (24 demos)
  - Uses Material UI for UI chrome
  - Dogfoods @jbcom/strata components
- `tests/` - Unit, integration, and e2e tests
- `dist/` - Compiled library output

## Feature Systems

### Core Graphics (Original)
- **Terrain** - SDF-based terrain with marching cubes
- **Water** - Reflective water with waves, AdvancedWater for oceans
- **Vegetation** - GPU-instanced grass, trees, rocks
- **Sky** - ProceduralSky with day/night cycle
- **Volumetrics** - Fog, underwater effects, enhanced fog
- **Characters** - Animated characters with fur rendering

### New Features (Dec 2024)

#### GPU Particle System
- `ParticleEmitter` component with GPU instancing
- Presets: fire, smoke, sparks, magic, explosion
- Forces: gravity, wind, turbulence
- Emission shapes: point, sphere, cone, box

#### Dynamic Weather
- `Rain`, `Snow`, `Lightning` components
- Weather state machine with smooth transitions
- Wind simulation with gusts
- Presets: clear, rain, thunderstorm, snow, blizzard

#### Procedural Clouds
- `CloudLayer`, `CloudSky`, `VolumetricClouds`
- FBM noise-based generation with wind movement
- Day/night color adaptation
- Presets: clear, partly cloudy, overcast, stormy, sunset

#### Camera Systems
- `FollowCamera`, `OrbitCamera`, `FPSCamera`, `CinematicCamera`
- Camera shake with trauma-based decay
- FOV transitions, head bob, look-ahead
- Presets: third-person action, RTS, side-scroller, cinematic

#### Decals & Billboards
- `Decal`, `Billboard`, `AnimatedBillboard`, `DecalPool`
- Sprite sheet animation support
- Automatic fade over time
- Presets: bullet holes, blood, scorch marks, footprints

#### LOD System
- `LODMesh`, `LODGroup`, `Impostor`, `LODVegetation`
- Automatic level-of-detail switching
- Cross-fade transitions
- Presets: performance, quality, mobile, desktop, ultra

#### God Rays / Volumetric Lighting
- `GodRays`, `VolumetricSpotlight`, `VolumetricPointLight`
- Radial blur light shafts from sun
- Scattering intensity based on viewing angle
- Presets: cathedral, forest canopy, underwater, dusty room

#### 3D Joystick/Trigger System
- `Joystick3D` - Real 3D joystick with depth and shadows
- `GroundSwitch` - Metallic lever with haptic feedback
- `PressurePlate` - Floor depress button
- `WallButton` - Mounted push button
- `TriggerComposer` - Build custom triggers
- Haptic feedback support

#### YukaJS AI Integration
- `YukaEntityManager` - AI entity management
- `YukaVehicle` - Steering agent with behaviors
- `YukaPath` - Waypoint visualization
- `YukaStateMachine` - FSM wrapper
- `YukaNavMesh` - Pathfinding on navmesh
- Steering hooks: useSeek, useFlee, useWander, useFollowPath, etc.
- Presets: guard, prey, predator, flock, follower

#### Spatial Audio
- `AudioProvider`, `AudioListener` - Web Audio API integration
- `PositionalAudio` - 3D positioned sounds with falloff
- `AmbientAudio` - Background audio
- `AudioZone`, `AudioEmitter` - Trigger volumes and dynamic sources
- Distance models: linear, inverse, exponential
- Presets: forest, cave, city, underwater, combat

#### Physics System (@react-three/rapier)
- `CharacterController` - FPS/third-person character with WASD, jumping, slopes
- `VehicleBody` - Car-like physics with wheels and suspension
- `Destructible` - Breakable objects that shatter
- `Buoyancy` - Floating objects with water simulation
- `Ragdoll` - Full ragdoll body with joints
- Presets: fps, thirdPerson, platformer, car, truck

#### Post-Processing Effects
- `CinematicEffects`, `DreamyEffects`, `HorrorEffects`, `NeonEffects`
- `RealisticEffects`, `VintageEffects`, `DynamicDOF`
- Bloom, depth of field, vignette, chromatic aberration, noise
- Mood presets: cinematic, dreamy, horror, neon, vintage, noir, sci-fi

#### Procedural Animation
- `IKChain`, `IKLimb` - Inverse kinematics (FABRIK, CCD, two-bone)
- `SpringBone`, `TailPhysics` - Spring dynamics for secondary motion
- `LookAt`, `HeadTracker` - Head/eye tracking
- `ProceduralWalk` - Procedural foot placement
- `BreathingAnimation`, `BlinkController` - Subtle animations
- Presets: humanArm, humanLeg, spiderLeg, tentacle, walk, run

#### State Management
- `GameStateProvider`, `useGameState` - React context for game state
- `useSaveLoad`, `useUndo`, `useCheckpoint` - Save/load, undo/redo
- `AutoSave` - Automatic save at intervals
- `StateDebugger` - Debug overlay
- Presets: RPG, puzzle, platformer, sandbox templates

#### UI System (HUD)
- `HealthBar`, `Nameplate`, `DamageNumber` - Entity UI
- `ProgressBar3D` - 3D mesh-based progress bars
- `Inventory` - Grid-based drag-and-drop inventory
- `DialogBox` - Typewriter effect with choices
- `Minimap`, `Crosshair`, `Tooltip`, `Notification`
- Presets: rpg, fps, mmo, visual_novel

#### Shader Library
- `ToonMesh`, `HologramMesh`, `DissolveMesh` - Custom materials
- `Forcefield`, `GlitchMesh`, `CrystalMesh`, `GradientMesh`
- ShaderChunks: noise, lighting, UV, color, animation, effects
- Presets: anime, comic, matrix, fire, ice, magic

## Development Commands
- `pnpm run build` - Compile TypeScript to dist/
- `pnpm run dev` - Watch mode for development
- `pnpm run test` - Run all tests (778 tests)
- `pnpm run lint` - Run ESLint
- `pnpm run format` - Format code with Prettier

## Documentation Site
Run `cd docs-site && pnpm dev` to start the documentation server on port 5000.

### Demo Pages (24 total)
- `/` - Homepage with hero scene
- `/demos/terrain` - SDF terrain with marching cubes
- `/demos/water` - Water and AdvancedWater components
- `/demos/sky` - ProceduralSky with day/night cycle
- `/demos/vegetation` - GPU-instanced grass, trees, rocks
- `/demos/volumetrics` - Fog, underwater effects
- `/demos/characters` - Animated characters with fur
- `/demos/full-scene` - All features combined
- `/demos/particles` - GPU particle effects
- `/demos/weather` - Rain, snow, lightning
- `/demos/clouds` - Procedural cloud layers
- `/demos/camera` - Camera systems
- `/demos/decals` - Decals and billboards
- `/demos/lod` - Level of detail system
- `/demos/god-rays` - Volumetric lighting
- `/demos/input` - 3D joystick and triggers
- `/demos/ai` - YukaJS AI agents
- `/demos/audio` - Spatial audio
- `/demos/physics` - Physics with @react-three/rapier
- `/demos/postprocessing` - Post-processing effects
- `/demos/animation` - Procedural animation (IK, springs)
- `/demos/state` - State management
- `/demos/ui` - Game HUD components
- `/demos/shaders` - Custom shader materials

## API Design Principles
- Components accept `THREE.ColorRepresentation` (strings, hex numbers, Color objects)
- Common props like `size`, `color`, `opacity` are exposed at the top level
- Components support `forwardRef` for animation hooks
- Consistent naming across all components
- Framework-agnostic core logic (can be used outside React)
- Comprehensive JSDoc documentation on all exports

## Dependencies
- React Three Fiber / Drei
- Three.js
- Yuka (game AI)
- @react-three/rapier (physics)
- @react-three/postprocessing (effects)
- Material UI (docs site)
- Vite (docs site bundler)
- Vitest for testing
- Playwright for e2e tests
- pnpm workspace

## Test Coverage
- 778 unit tests covering all features
- 24 demo pages with e2e tests across 5 browsers
- Core systems, presets, and utilities fully tested
- TypeScript compilation verified

## Environment Configuration

The project uses a multi-environment configuration system in `config/environments.ts`:

### Environments
| Environment | Detection | Base URL | Browser |
|------------|-----------|----------|---------|
| **local** | Default | localhost:5000 | Bundled Chromium |
| **development** | `REPL_ID` set | Replit dev URL | System Chromium |
| **staging** | `GITHUB_ACTIONS` set | localhost:5000 | Playwright MCP |
| **production** | `NODE_ENV=production` | GitHub Pages | N/A |

### Replit Development
- Uses live dev URL from `REPLIT_DOMAINS` environment variable
- Uses system Chromium (`CHROMIUM_PATH`) for faster tests
- No software rendering needed - tests run ~3x faster

### GitHub Copilot Staging
- VS Code MCP configuration in `.vscode/settings.json`
- Playwright MCP server for browser automation (HTTP mode on port 8080)
- Multi-browser testing (Chromium, Firefox, WebKit)

### Playwright MCP Server
The Playwright MCP server runs as a background workflow on startup:
- **Port**: 8080
- **Health Check**: `curl http://localhost:8080/health`
- **MCP Endpoint**: `http://localhost:8080/mcp`
- **Version**: @executeautomation/playwright-mcp-server

### Running E2E Tests
```bash
# Replit (uses live dev URL)
pnpm test:e2e

# Local (starts dev server)
pnpm test:e2e

# Specific tests
pnpm test:e2e --grep "Homepage"
```
