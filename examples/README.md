# Strata Examples

This directory contains working example projects demonstrating how to use Strata in real applications.

## 🎨 Visual Examples

> **Quick Start:** Run `pnpm demo` from the root directory to serve the HTML demos at `docs/demos/`.

## Examples

### [basic-terrain](./basic-terrain/)

A complete React Three Fiber example showing procedural terrain generation.

**Features demonstrated:**

- Procedural heightmap terrain with multiple noise layers
- Water plane with transparency effects
- Sky component with dynamic sun position
- Camera controls with damping
- Core-only usage patterns (see `src/core-usage.ts`)

**Run it:**

```bash
cd examples/basic-terrain
pnpm install
pnpm dev
```

### [water-scene](./water-scene/)

An interactive water scene with animated waves and floating objects.

**Features demonstrated:**

- Custom water shader with animated waves
- Fresnel effect for realistic edge glow
- Animated caustics pattern
- Floating objects with simulated buoyancy
- Environment lighting with HDRI

**Run it:**

```bash
cd examples/water-scene
pnpm install
pnpm dev
```

## HTML Demos

The `docs/demos/` directory contains standalone HTML demos for quick visual testing:

| Demo | Description |
|------|-------------|
| `terrain.html` | Terrain generation showcase |
| `water.html` | Water effects demonstration |
| `sky.html` | Procedural sky and lighting |
| `vegetation.html` | GPU-instanced vegetation |
| `volumetrics.html` | Volumetric fog and effects |
| `characters.html` | Character animation system |
| `full-scene.html` | Complete scene with all features |

## Core-Only Usage

Strata's core algorithms work without React. See `src/core-usage.ts` in each example for patterns like:

```typescript
import * as THREE from 'three';

// Seeded random for reproducible results
const instances = generateInstanceData(1000, 100, heightFunc, undefined, undefined, 42);

// Create instanced mesh for vanilla Three.js
const mesh = createInstancedMesh({
  geometry,
  material,
  count: instances.length,
  instances,
});

scene.add(mesh);
```

## TypeScript Types

All Strata exports include full TypeScript definitions:

```typescript
import type { InstanceData, BiomeData, TerrainChunk } from '@jbcom/strata';
```

## Contributing Examples

We welcome contributions! Guidelines:

1. Each example should be self-contained with its own `package.json`
2. Include a README.md explaining what the example demonstrates
3. Keep dependencies minimal
4. Use TypeScript with strict mode
5. Follow Biome formatting rules
