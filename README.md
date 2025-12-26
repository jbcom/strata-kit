# @jbcom/strata

> The complete solution for foreground, midground, and background layer 3D gaming in Node.js

Strata provides everything you need to build high-quality 3D games and experiences, from terrain generation to character animation, all optimized for performance across mobile, web, and desktop.

[![CI](https://github.com/strata-game-library/core/actions/workflows/ci.yml/badge.svg)](https://github.com/strata-game-library/core/actions/workflows/ci.yml)
[![npm version](https://img.shields.io/npm/v/@jbcom/strata.svg)](https://www.npmjs.com/package/@jbcom/strata)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

---

## 📚 Documentation

**Full documentation is available at [strata.game](https://strata.game)**

- [Getting Started](https://strata.game/getting-started/)
- [API Reference](https://strata.game/api/)
- [Live Demos](https://strata.game/showcase/)
- [Examples & Tutorials](https://strata.game/getting-started/quick-start/)

---

## 🚀 Quick Start

```bash
pnpm install @jbcom/strata @react-three/fiber @react-three/drei three
```

```tsx
import { Canvas } from '@react-three/fiber';
import { Water, ProceduralSky, GrassInstances } from '@jbcom/strata';

function Game() {
  return (
    <Canvas>
      <ProceduralSky sunPosition={[100, 50, 100]} />
      <Water size={200} depth={20} />
      <GrassInstances count={10000} spread={100} />
    </Canvas>
  );
}
```

---

## 🎮 Features

- 🏔️ **Procedural Terrain** - SDF-based terrain generation with marching cubes
- 🌊 **Advanced Water** - Realistic water with reflections, caustics, and foam
- 🌿 **GPU Vegetation** - Thousands of instances with biome-based placement
- ☁️ **Volumetric Effects** - Fog, atmospheric scattering, and weather
- 🌅 **Procedural Sky** - Dynamic day/night cycle with stars and sun positioning
- 🎮 **Character Animation** - IK chains, procedural walk, and physics

---

## 🏢 Enterprise Context

**Strata** is the Games & Procedural division of the [jbcom enterprise](https://jbcom.github.io). This package is part of a coherent suite of specialized tools, sharing a unified design system and interconnected with sibling organizations like [Agentic](https://agentic.dev) and [Extended Data](https://extendeddata.dev).

## License

MIT © [Jon Bogaty](https://github.com/jbcom)
