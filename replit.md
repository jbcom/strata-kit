# Strata - Comprehensive 3D Gaming Library for React Three Fiber

## Overview
Strata is a world-class procedural 3D graphics and game development library for React Three Fiber. It provides production-ready components for terrain, water, vegetation, sky, volumetrics, characters, particles, weather, cameras, AI, audio, physics, post-processing, animation, state management, UI, shaders, and interactive controls.

## Project Structure (Monorepo)

```
├── packages/
│   ├── capacitor-plugin/     # @strata/capacitor-plugin - Cross-platform input/haptics
│   │   ├── src/              # TypeScript source
│   │   │   ├── definitions.ts    # Plugin interface definitions
│   │   │   ├── index.ts          # Plugin registration
│   │   │   ├── web.ts            # Web implementation
│   │   │   └── react/            # React hooks (useDevice, useInput, useHaptics)
│   │   ├── android/          # Android native code (future)
│   │   ├── ios/              # iOS native code (future)
│   │   └── dist/             # Compiled output
│   └── docs/                 # @strata/docs - Documentation website
│       ├── src/
│       │   ├── pages/demos/  # 24 interactive demo pages
│       │   ├── components/   # Layout, DemoLayout, etc.
│       │   └── App.tsx       # Route definitions
│       └── vite.config.ts    # Vite bundler config
├── src/                      # @jbcom/strata - Core library
│   ├── components/           # React Three Fiber components
│   ├── core/                 # Algorithms (marching cubes, SDF, particles, etc.)
│   ├── presets/              # Pre-configured setups
│   ├── shaders/              # GLSL shader code
│   ├── hooks/                # React hooks (useYuka, useGameState, etc.)
│   └── utils/                # Utility functions
├── tests/                    # Unit, integration, and e2e tests
├── config/                   # Environment configuration
└── dist/                     # Compiled library output
```

## Packages

### @jbcom/strata (Root)
The core 3D graphics library with all React Three Fiber components.

### @strata/capacitor-plugin
Cross-platform input, device detection, and haptics for game development.

**Features:**
- Device detection (mobile/tablet/foldable/desktop, iOS/Android/Web)
- Unified input (touch/keyboard/gamepad abstraction)
- Haptic feedback (device vibration + gamepad rumble)
- React hooks: `useDevice`, `useInput`, `useHaptics`, `useControlHints`

**Platform Support:**
- Web (pure browser)
- iOS/Android via Capacitor
- Desktop via Electron (@capacitor-community/electron)

### @strata/docs
Interactive documentation site with live demos. Uses Material UI for responsive layout.

## Feature Systems

### Core Graphics
- **Terrain** - SDF-based terrain with marching cubes
- **Water** - Reflective water with waves, AdvancedWater for oceans
- **Vegetation** - GPU-instanced grass, trees, rocks
- **Sky** - ProceduralSky with day/night cycle
- **Volumetrics** - Fog, underwater effects, enhanced fog
- **Characters** - Animated characters with fur rendering

### Extended Features
- **GPU Particles** - Fire, smoke, sparks, magic, explosion presets
- **Weather** - Rain, snow, lightning with state machine
- **Clouds** - Procedural FBM noise-based clouds
- **Camera Systems** - Follow, orbit, FPS, cinematic cameras
- **Decals & Billboards** - Sprite sheets, pooling, fade
- **LOD System** - Automatic level-of-detail with cross-fade
- **God Rays** - Volumetric lighting effects
- **3D Input Controls** - Joystick, switches, pressure plates
- **AI (YukaJS)** - Steering behaviors, FSM, navmesh pathfinding
- **Spatial Audio** - 3D positioned sounds with falloff
- **Physics (Rapier)** - Character controller, vehicles, ragdolls
- **Post-Processing** - Cinematic, dreamy, horror, neon effects
- **Procedural Animation** - IK chains, spring bones, look-at
- **State Management** - Save/load, undo/redo, checkpoints
- **Game UI** - Health bars, inventory, dialog, minimap
- **Shader Library** - Toon, hologram, dissolve, forcefield

## Development Commands

### Root Level
```bash
pnpm run build          # Build core library
pnpm run dev            # Watch mode
pnpm run test           # Run all tests
pnpm run lint           # ESLint
pnpm run format         # Prettier
```

### Documentation Site
```bash
cd packages/docs && pnpm dev    # Start dev server on port 5000
cd packages/docs && pnpm build  # Production build
```

### Capacitor Plugin
```bash
cd packages/capacitor-plugin && pnpm build  # Build plugin
```

## Demo Pages (24 total)
- `/` - Homepage with hero scene
- `/demos/terrain` - SDF terrain
- `/demos/water` - Water components
- `/demos/sky` - Day/night cycle
- `/demos/vegetation` - Instanced vegetation
- `/demos/volumetrics` - Fog effects
- `/demos/characters` - Animated characters
- `/demos/full-scene` - Combined features
- `/demos/particles` - GPU particles
- `/demos/weather` - Weather system
- `/demos/clouds` - Procedural clouds
- `/demos/camera` - Camera systems
- `/demos/decals` - Decals and billboards
- `/demos/lod` - Level of detail
- `/demos/god-rays` - Volumetric lighting
- `/demos/input` - 3D controls
- `/demos/ai` - AI agents
- `/demos/audio` - Spatial audio
- `/demos/physics` - Physics simulation
- `/demos/postprocessing` - Post effects
- `/demos/animation` - Procedural animation
- `/demos/state` - State management
- `/demos/ui` - Game HUD
- `/demos/shaders` - Shader materials

## API Design Principles
- Components accept `THREE.ColorRepresentation`
- Common props exposed at top level
- Components support `forwardRef`
- Framework-agnostic core logic
- Comprehensive JSDoc documentation

## Environment Configuration

| Environment | Detection | Base URL | Browser |
|------------|-----------|----------|---------|
| **local** | Default | localhost:5000 | Bundled Chromium |
| **development** | `REPL_ID` set | Replit dev URL | System Chromium |
| **staging** | `GITHUB_ACTIONS` set | localhost:5000 | Playwright MCP |
| **production** | `NODE_ENV=production` | GitHub Pages | N/A |

## User Preferences
- Responsive design for foldables (OnePlus Open) and tablets
- Device-aware control hints (no WASD on mobile)
- Thin one-line footer bar
- Maximize canvas space in demos
- Cross-platform support via Capacitor

## Recent Changes (Dec 2024)
- Reorganized to monorepo structure under `packages/`
- Created `@strata/capacitor-plugin` for cross-platform input/haptics
- Moved docs-site to `packages/docs`
- Redesigned DemoLayout with responsive top toolbar
- Fixed AI demo flocking behaviors (YUKA Vector3 compatibility)
- Added thin one-line footer
