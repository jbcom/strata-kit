# Agent Instructions for Strata

## Overview

**@jbcom/strata** is evolving from a procedural 3D graphics library into a **complete game framework** for React Three Fiber.

### Current Capabilities (Toolkit)
- Terrain, water, sky, vegetation, volumetrics
- ECS, physics, AI, animation, pathfinding
- State management with save/load

### In Development (Framework)
- Game orchestration (scenes, modes, triggers)
- World topology (regions, connections)
- Compositional objects (materials, skeletons, props)
- Declarative game definition (`createGame()`)

**See:** [Architecture Documentation](docs/architecture/README.md)

**Epic Tracking:** [#50 - Strata Game Framework](https://github.com/jbcom/nodejs-strata/issues/50)

## Quick Start

```bash
# Read current context
cat memory-bank/activeContext.md

# Install and verify
pnpm install
pnpm run build
pnpm run test
```

## Agent-Specific Instructions

| Agent | Config | Strengths |
|-------|--------|-----------|
| **Test Runner** | [.github/agents/test-runner.md](.github/agents/test-runner.md) | Unit/Integration/E2E tests |
| **Project Manager** | [.github/agents/project-manager.md](.github/agents/project-manager.md) | Issues, PRs, EPICs |
| **Code Reviewer** | [.github/agents/code-reviewer.md](.github/agents/code-reviewer.md) | Quality, security, bugs |

## Development Commands

```bash
# Install dependencies
pnpm install

# Build
pnpm run build

# Test (all)
pnpm run test

# Test (specific file)
pnpm run test -- src/__tests__/camera.test.ts

# Test (E2E with Playwright)
pnpm run test:e2e

# Lint
pnpm run lint

# Format
pnpm run format

# Type check
pnpm run typecheck

# Generate docs
pnpm run docs
```

## Architecture

### Current Structure (Modularized)
```
src/
├── core/           # Pure TypeScript (NO React imports!)
│   ├── ai/         # AI logic and pathfinding
│   ├── animation/  # Animation and IK solvers
│   ├── audio/      # Audio system core
│   ├── camera/     # Camera math and utilities
│   ├── debug/      # Debug tools
│   ├── decals/     # Decals and billboards logic
│   ├── ecs/        # Entity component system
│   ├── math/       # General math, noise, vectors
│   ├── state/      # State management core
│   └── ...         # (Physics, Shaders, etc.)
├── components/     # Modular React Three Fiber components
│   ├── ai/         # AI components
│   ├── animation/  # Animation components
│   ├── audio/      # Audio components
│   ├── camera/     # Camera components
│   ├── ...         # (Physics, Sky, UI, etc.)
├── shaders/        # GLSL shaders
├── presets/        # Pre-configured modular logic
│   ├── ai/         # AI behavior presets
│   ├── physics/    # Physical presets
│   └── ...
├── hooks/          # React hooks
└── api/            # High-level API
```

### Planned Framework Layers (Epic #50)
```
src/
├── game/           # Layer 1: Orchestration (NEW)
│   ├── SceneManager.ts
│   ├── ModeManager.ts
│   └── TriggerSystem.ts
├── world/          # Layer 2: Topology (NEW)
│   ├── WorldGraph.ts
│   └── RegionSystem.ts
├── compose/        # Layer 3: Composition (NEW)
│   ├── materials/
│   ├── skeletons/
│   ├── props/
│   └── creatures/
└── framework/      # Layer 4: Definition (NEW)
    ├── createGame.ts
    └── StrataGame.tsx
```

### Key RFCs
| RFC | Status | Focus |
|-----|--------|-------|
| [RFC-001](./docs/architecture/rfc/RFC-001-GAME-ORCHESTRATION.md) | Proposed | Game Orchestration |
| [RFC-002](./docs/architecture/rfc/RFC-002-COMPOSITIONAL-OBJECTS.md) | Proposed | Compositional Objects |
| [RFC-003](./docs/architecture/rfc/RFC-003-WORLD-TOPOLOGY.md) | Proposed | World Topology |
| [RFC-004](./docs/architecture/rfc/RFC-004-DECLARATIVE-GAMES.md) | Proposed | Declarative Games |

## Testing

### Unit Tests
```bash
pnpm run test
```
- Located in `src/__tests__/` and `src/core/**/__tests__/`
- Use Vitest

### E2E Tests
```bash
pnpm run test:e2e
```
- Located in `tests/e2e/`
- Use Playwright

### Using Playwright MCP
```
playwright_navigate → Load page
playwright_screenshot → Visual capture
playwright_click → User interaction
playwright_evaluate → Run assertions
```

## GitHub Workflow

### Authentication
```bash
export GH_TOKEN="$GITHUB_TOKEN"
gh issue list
```

### Review Requests (each agent needs SEPARATE comment!)
```bash
# Request reviews from all agents (SEPARATE comments!)
gh pr comment <PR_NUMBER> --body "@claude Please review"
gh pr comment <PR_NUMBER> --body "/q review"
gh pr comment <PR_NUMBER> --body "/gemini review"
gh pr comment <PR_NUMBER> --body "@cursor review"
```

### Issue/PR Linking
```
Closes #123
Fixes #123
Part of #74
```

## Commit Messages

```
feat(terrain): add erosion simulation → minor
fix(water): correct reflection angle → patch
refactor(shaders): optimize loops → patch
docs: update API docs → no release
test: add pathfinding tests → no release
```

## Code Standards

### TypeScript
- Strict mode enabled
- All public APIs need JSDoc
- No `any` types

### React Components
- Functional only
- forwardRef when needed
- Cleanup in useEffect

### Shaders
```typescript
const vertexShader = /* glsl */ `
  void main() {
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;
```

### Core Algorithms
- NO React imports
- Pure functions
- Full TypeScript types

## Common Issues

### Division by Zero
```typescript
// BAD
result = a / b;
// GOOD
result = b !== 0 ? a / b : 0;
```

### Race Conditions
```typescript
// BAD - event may be recycled
setTimeout(() => console.log(e.target), 100);
// GOOD - capture first
const target = e.target;
setTimeout(() => console.log(target), 100);
```

### Memory Leaks
```typescript
// React: cleanup subscriptions
useEffect(() => {
  const sub = subscribe();
  return () => sub.unsubscribe();
}, []);
```

## Current EPICs

- **#50** - Strata Game Framework (Active - Phase 1)
- **#74** - Archive Triage & Extraction Map
- **#35** - Main Integration

## Architecture Documentation

Full documentation for the game framework evolution:
- [Architecture README](docs/architecture/README.md)
- [Game Framework Vision](docs/architecture/GAME_FRAMEWORK_VISION.md)
- [Roadmap](docs/architecture/ROADMAP.md)
- [Agent Instructions](docs/architecture/guides/AGENTS.md)
- [Migration Guide](docs/architecture/guides/MIGRATION.md)

## Merge Priority

1. CI fixes, Docs (infrastructure)
2. Math, Shared, Shaders (pure utilities)
3. State, Debug, ECS, Physics (core systems)
4. Audio, Animation, Rendering (features)
5. Components, Presets, Index (integration)
