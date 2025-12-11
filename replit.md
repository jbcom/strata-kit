# Strata - 3D Gaming Library for React Three Fiber

## Overview
Strata is a procedural 3D graphics library for React Three Fiber that provides components for terrain, water, vegetation, sky, volumetrics, and character rendering.

## Project Structure
- `src/` - TypeScript source code for the library
  - `components/` - React Three Fiber components
  - `core/` - Core algorithms (marching cubes, SDF, raymarching)
  - `presets/` - Pre-configured setups for various effects
  - `shaders/` - GLSL shader code
  - `utils/` - Utility functions
- `docs/` - Static HTML documentation and demos
- `tests/` - Unit, integration, and e2e tests
- `dist/` - Compiled library output

## Development Commands
- `pnpm run build` - Compile TypeScript to dist/
- `pnpm run dev` - Watch mode for development
- `pnpm run test` - Run all tests
- `pnpm run lint` - Run ESLint
- `pnpm run format` - Format code with Prettier

## Running the Project
The documentation server runs on port 5000 serving static HTML files from the `docs/` directory.

## Technology Stack
- TypeScript
- React Three Fiber
- Three.js
- Vitest for testing
- Playwright for e2e tests
- pnpm package manager
