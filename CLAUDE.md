# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

> **See also:** `AGENTS.md` for comprehensive agent instructions.

## Project Overview

**@jbcom/strata** - Procedural 3D graphics library for React Three Fiber providing terrain, water, vegetation, sky, volumetrics, and character animation.

## Quick Start

```bash
pnpm install        # Install dependencies
pnpm run build      # Build the library
pnpm run test       # Run all tests
pnpm run lint       # Lint with Biome
pnpm run typecheck  # Type checking
```

## Development Commands

```bash
# Testing
pnpm run test              # Run all tests
pnpm run test:unit         # Unit tests only
pnpm run test:integration  # Integration tests only
pnpm run test:e2e          # Playwright E2E tests
pnpm run test:coverage     # Tests with coverage

# Code Quality
pnpm run lint              # Biome lint
pnpm run lint:fix          # Auto-fix lint issues
pnpm run format            # Biome format
pnpm run typecheck         # TypeScript type checking

# Documentation
pnpm run docs              # Generate TypeDoc
pnpm run demo              # Serve demo files
```

## Architecture

```
src/
├── core/           # Pure TypeScript (NO React imports!)
│   ├── math/       # Math utilities, noise, vectors
│   ├── state/      # State management
│   ├── ecs/        # Entity component system
│   ├── pathfinding/# A* and navigation
│   ├── audio/      # Audio system
│   └── debug/      # Debug tools
├── components/     # React Three Fiber components
├── shaders/        # GLSL shaders
├── presets/        # Ready-to-use configurations
├── hooks/          # React hooks
└── api/            # High-level API
```

**Key Rule**: `src/core/` must have NO React imports - pure TypeScript only.

## Code Standards

- **TypeScript**: Strict mode, no `any` types, JSDoc for public APIs
- **React**: Functional components only, forwardRef when needed
- **Shaders**: Use `/* glsl */` template literals
- **Testing**: Vitest for unit/integration, Playwright for E2E

## Commit Messages

```bash
# Conventional commits format
git commit -m "feat(terrain): add erosion simulation"   # → minor release
git commit -m "fix(water): correct reflection angle"    # → patch release
git commit -m "docs: update API docs"                   # → no release
git commit -m "test: add pathfinding tests"             # → no release
```

## Quality Checklist

Before completing work:
- [ ] All tests pass (`pnpm run test`)
- [ ] Linting passes (`pnpm run lint`)
- [ ] Type checking passes (`pnpm run typecheck`)
- [ ] Conventional commit message format
- [ ] Documentation updated if needed

## Project Structure

```
.
├── src/                 # Source code
├── tests/               # Test files
├── docs/                # Documentation & TypeDoc output
├── examples/            # Working example projects
├── memory-bank/         # AI context files
├── .github/
│   ├── workflows/       # CI/CD (SHA-pinned actions)
│   └── agents/          # Agent-specific instructions
├── CLAUDE.md            # This file
└── AGENTS.md            # Agent instructions
```

## Key Documentation

- `PUBLIC_API.md` - Stable, versioned API reference
- `API.md` - Complete API documentation
- `CONTRACT.md` - Stability guarantees and versioning
- `AGENTS.md` - Agent-specific instructions

