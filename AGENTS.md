# Agent Instructions for strata

## Overview

Procedural 3D graphics library for React Three Fiber providing terrain, water, sky, vegetation, and effects.

## Before Starting

```bash
cat memory-bank/activeContext.md
```

## Development Commands

```bash
# Install dependencies
pnpm install

# Build
pnpm run build

# Test
pnpm run test

# Format with Prettier
pnpm run format
pnpm run format:check

# Lint
pnpm run lint
```

## Architecture

- **Core** (`src/core/`): Pure TypeScript algorithms, no React
- **Components** (`src/components/`): React Three Fiber components
- **Shaders** (`src/shaders/`): GLSL shaders
- **Presets** (`src/presets/`): Ready-to-use configurations

## Commit Messages

Use conventional commits:
- `feat(terrain): new terrain feature` → minor
- `fix(water): bug fix` → patch
- `refactor(shaders): code cleanup` → patch

## Important Notes

- Keep core algorithms in `src/core/` (pure TypeScript)
- React components go in `src/components/`
- Shaders use `/* glsl */` template literals
- All uniform interfaces need index signatures for THREE.js compatibility
