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

### [vegetation-showcase](./vegetation-showcase/)

Comprehensive demonstration of GPU-instanced vegetation rendering.

**Features demonstrated:**

- GPU instancing for thousands of grass, trees, and rocks
- Biome-based placement with varying densities
- Seeded random generation for reproducibility
- Height-based positioning on procedural terrain
- Interactive controls with Leva for real-time adjustments
- Wind animation for organic movement

**Run it:**

```bash
cd examples/vegetation-showcase
pnpm install
pnpm dev
```

### [sky-volumetrics](./sky-volumetrics/)

Interactive showcase of procedural sky and atmospheric effects.

**Features demonstrated:**

- Dynamic day/night cycle simulation
- Procedural sky with sun positioning
- Star visibility that changes with time of day
- Atmospheric fog with adjustable density
- Weather effects system
- Time-of-day presets (dawn, noon, sunset, night, stormy)

**Run it:**

```bash
cd examples/sky-volumetrics
pnpm install
pnpm dev
```

### [api-showcase](./api-showcase/) ⭐ **NEW**

**The most comprehensive example**: JSDoc-linked examples for EVERY Strata API.

**What makes this special:**

- 🔗 **JSDoc-Linked**: Every example directly references API source code
- 📚 **Complete Coverage**: 26+ examples covering 18+ API methods
- 📖 **Documentation**: Each example includes detailed explanations
- 🎯 **Searchable**: Find examples by API, category, or feature
- 📋 **Copy-Paste Ready**: Production-quality code snippets
- 🎓 **Progressive**: Basic → Advanced → Complete examples
- 🔍 **Source-Linked**: Direct GitHub URLs to implementation

**Systems covered:**

- **Vegetation** (8 examples): `createGrassInstances`, `createTreeInstances`, `createRockInstances`, `createVegetationMesh`, `generateInstanceData`
- **Water** (8 examples): `Water`, `AdvancedWater`, caustics, reflections, presets
- **Sky & Volumetrics** (10 examples): `ProceduralSky`, day/night cycles, weather, fog, underwater effects

**Example structure:**

```typescript
/**
 * @example Copy-paste ready code
 * @see Direct link to API source
 * @apiExample API method name
 * @category Basic|Advanced|Complete
 */
export function Example_FeatureName() {
    // Returns metadata + working implementation
}
```

**Run it:**

```bash
cd examples/api-showcase
pnpm install
pnpm dev       # Interactive showcase
pnpm docs      # Generate documentation
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
