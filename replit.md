# Strata - Comprehensive 3D Gaming Library for React Three Fiber

## Overview
Strata is a world-class procedural 3D graphics and game development library for React Three Fiber. It provides production-ready components for terrain, water, vegetation, sky, volumetrics, characters, particles, weather, cameras, AI, audio, and interactive controls.

## Project Structure
- `src/` - TypeScript source code for the library
  - `components/` - React Three Fiber components
  - `core/` - Core algorithms (marching cubes, SDF, particles, weather, audio, AI)
  - `presets/` - Pre-configured setups for various effects
  - `shaders/` - GLSL shader code
  - `hooks/` - React hooks (useYuka for AI behaviors)
  - `utils/` - Utility functions
- `docs-site/` - Vite + React documentation site with interactive demos
  - `src/pages/demos/` - Live demo pages for each feature
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

#### 3D Joystick/Trigger System (nipplejs replacement)
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

## Development Commands
- `pnpm run build` - Compile TypeScript to dist/
- `pnpm run dev` - Watch mode for development
- `pnpm run test` - Run all tests (496 tests)
- `pnpm run lint` - Run ESLint
- `pnpm run format` - Format code with Prettier

## Documentation Site
Run `cd docs-site && pnpm dev` to start the documentation server on port 5000.

### Demo Pages
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
- `/demos/godrays` - Volumetric lighting
- `/demos/input` - 3D joystick and triggers
- `/demos/ai` - YukaJS AI agents
- `/demos/audio` - Spatial audio

## API Design Principles
- Components accept `THREE.ColorRepresentation` (strings, hex numbers, Color objects)
- Common props like `size`, `color`, `opacity` are exposed at the top level
- Components support `forwardRef` for animation hooks
- Consistent naming across all components
- Framework-agnostic core logic (can be used outside React)

## Dependencies
- React Three Fiber / Drei
- Three.js
- Yuka (game AI)
- Material UI (docs site)
- Vite (docs site bundler)
- Vitest for testing
- Playwright for e2e tests
- pnpm workspace

## Test Coverage
- 496 unit tests covering all features
- Core systems, presets, and utilities fully tested
- TypeScript compilation verified
