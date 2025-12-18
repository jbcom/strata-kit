# @jbcom/strata

> The complete solution for foreground, midground, and background layer 3D gaming in Node.js

Strata provides everything you need to build high-quality 3D games and experiences, from terrain generation to character animation, all optimized for performance across mobile, web, and desktop.

[![CI](https://github.com/jbcom/nodejs-strata/actions/workflows/ci.yml/badge.svg)](https://github.com/jbcom/nodejs-strata/actions/workflows/ci.yml)
[![npm version](https://img.shields.io/npm/v/@jbcom/strata.svg)](https://www.npmjs.com/package/@jbcom/strata)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

---

## 🎨 Visual Showcase & Interactive Demos

> **Experience Strata in action!** See live, interactive demos showcasing every feature.

### 🌐 Online Demo Gallery

Visit our [**Interactive Demo Gallery**](https://jbcom.github.io/nodejs-strata/) to explore:

- 🏔️ **Procedural Terrain** - SDF-based terrain generation with marching cubes
- 🌊 **Advanced Water** - Realistic water with reflections, caustics, and foam  
- 🌿 **GPU Vegetation** - Thousands of instances with biome-based placement
- ☁️ **Volumetric Effects** - Fog, atmospheric scattering, and weather
- 🌅 **Procedural Sky** - Dynamic day/night cycle with stars and sun positioning
- 🎮 **Character Animation** - IK chains, procedural walk, and physics
- 🎬 **Full Scene** - Complete integration of all features

### 🚀 Run Demos Locally

```bash
# Serve the demo gallery
pnpm demo

# Run comprehensive React examples
cd examples/vegetation-showcase && pnpm install && pnpm dev   # Port 3002
cd examples/sky-volumetrics && pnpm install && pnpm dev       # Port 3003
cd examples/basic-terrain && pnpm install && pnpm dev         # Port 3000
cd examples/water-scene && pnpm install && pnpm dev           # Port 3001
```

Each example includes:
- ✅ Interactive controls with real-time adjustments
- ✅ Copy-paste ready code snippets
- ✅ Comprehensive documentation
- ✅ Performance stats and optimization tips

---

## 🎮 What is Strata?

Strata is a comprehensive library that solves the hardest problems in 3D game development:

- **Terrain Generation** - SDF-based terrain with marching cubes
- **Water Systems** - Advanced water rendering with caustics and foam
- **Vegetation** - GPU-accelerated instanced grass, trees, and rocks
- **Characters** - Articulated character system with procedural animation
- **Fur & Shells** - GPU-accelerated fur rendering using shell techniques
- **Molecular Rendering** - Scientific visualization and particle systems
- **Sky & Volumetrics** - Procedural sky with volumetric fog
- **Ray Marching** - GPU-accelerated SDF ray marching

All organized into **presets** that you can drop into your game.

## 📚 Documentation

### Core Documentation
- **[Public API Contract](./PUBLIC_API.md)** - Stable, versioned API reference
- **[API Reference](./API.md)** - Complete API documentation
- **[Developer Contract](./CONTRACT.md)** - Stability guarantees and versioning

### Examples & Tutorials
- **[Examples → API Map](./EXAMPLES_API_MAP.md)** ⭐ **NEW** - Direct mapping from every example to API source
- **[API Showcase](./examples/api-showcase/)** ⭐ **NEW** - JSDoc-linked examples for 100% API coverage
- **[Interactive Examples](./examples/)** - Working examples for all features
- **[Tests](./tests/)** - Test suite documentation

### Features
- **26+ Complete Examples** with direct links to API source code
- **JSDoc Annotations** linking examples to implementations
- **Progressive Complexity** from basic to advanced to complete
- **Copy-Paste Ready** production-quality code snippets

## 🚀 Quick Start

```bash
pnpm install @jbcom/strata @react-three/fiber @react-three/drei three
```

```tsx
import { Water, Terrain, Character, createFurSystem } from '@jbcom/strata';
import { Canvas } from '@react-three/fiber';

function Game() {
  return (
    <Canvas>
      {/* Background Layer */}
      <Sky timeOfDay={{ sunAngle: 60 }} />
      <Terrain biomes={biomes} />

      {/* Midground Layer */}
      <Water size={100} />
      <Vegetation count={8000} />

      {/* Foreground Layer */}
      <Character
        position={[0, 0, 0]}
        onAnimate={(time) => animateCharacter(character, time)}
      />
    </Canvas>
  );
}
```

## 🎯 Presets

Strata organizes features into **presets** - ready-to-use game development primitives:

### Background Layer

- `Sky` - Procedural sky with time-of-day and weather
- `Volumetrics` - Volumetric fog and underwater effects
- `Terrain` - SDF-based terrain generation
- `MarchingCubes` - Mesh generation from SDFs

### Midground Layer

- `Water` - Advanced water rendering
- `Vegetation` - GPU-instanced grass, trees, rocks
- `Raymarching` - GPU-accelerated SDF rendering

### Foreground Layer

- `Character` - Articulated character system
- `Fur` - Shell-based fur rendering
- `Molecular` - Molecular structure visualization

## 🧪 Testing

```bash
# Unit tests (core algorithms)
pnpm run test:unit

# Integration tests (React components)
pnpm run test:integration

# E2E tests (Playwright)
pnpm run test:e2e

# All tests
pnpm run test:all
```

See [tests/README.md](./tests/README.md) for test documentation.

## 📖 Examples

```bash
# Basic examples
cd examples/basic/water
pnpm install && pnpm run dev

# Comprehensive example
cd examples/comprehensive
pnpm install && pnpm run dev
```

See [examples/README.md](./examples/README.md) for all examples.

## 🏗️ Architecture

Strata is built with a clear separation of concerns:

- **Core** (`src/core/`) - Pure TypeScript algorithms (no React)
- **Presets** (`src/presets/`) - Organized game primitives
- **Components** (`src/components/`) - React Three Fiber components
- **Shaders** (`src/shaders/`) - GLSL shader code

This architecture ensures:

- ✅ Framework-agnostic core
- ✅ Easy to test
- ✅ Reusable in any JavaScript/TypeScript environment
- ✅ Type-safe APIs

## 📦 Package Structure

```text
@jbcom/strata
├── core/          # Pure TypeScript algorithms
├── presets/        # Organized game primitives
├── components/     # React Three Fiber components
├── shaders/        # GLSL shader code
└── utils/          # Utilities (texture loading, etc.)
```

## 🔗 Exports

```tsx
// Core algorithms (no React)
import { generateInstanceData, createWaterMaterial } from '@jbcom/strata/core';

// Presets (organized by layer)
import { Water, Terrain, Character } from '@jbcom/strata/presets';

// React components
import { Water, Terrain, Character } from '@jbcom/strata/components';

// Shaders
import { waterVertexShader, waterFragmentShader } from '@jbcom/strata/shaders';

// Main export (everything)
import { Water, createFurSystem, Character } from '@jbcom/strata';
```

## 🎨 Features

### GPU-Accelerated Everything

- Instanced rendering for thousands of objects
- GPU-driven wind and LOD calculations
- Ray marching for complex SDFs
- Shell-based fur rendering

### Production-Ready

- Input validation on all APIs
- Comprehensive error handling
- Seeded random for deterministic generation
- Performance optimized for mobile

### Developer Experience

- Full TypeScript support
- Comprehensive test coverage
- Visual regression testing
- Clear API contracts

## 📋 Public API Contract

The public API is defined in [PUBLIC_API.md](./PUBLIC_API.md). All APIs listed there are:

- **Stable** - Follow semantic versioning
- **Tested** - Covered by automated tests
- **Documented** - Clear examples and types

APIs not in PUBLIC_API.md are **internal** and may change without notice.

## 🤝 Contributing

See [CONTRIBUTING.md](.github/CONTRIBUTING.md) for guidelines.

## 📄 License

MIT

## 🙏 Acknowledgments

Built on top of:

- [Three.js](https://threejs.org/)
- [React Three Fiber](https://docs.pmnd.rs/react-three-fiber)
- [Drei](https://github.com/pmndrs/drei)

Inspired by techniques from:

- Inigo Quilez's SDF articles
- Marching.js by Charlie Roberts
- Various procedural generation research
