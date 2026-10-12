---
title: "Plans Documentation Index"
description: "Agent guide for implementation plans in the Strata game framework"
area: plans
last_updated: 2026-03-01
---

# Plans Documentation

## Overview

This directory now contains three kinds of planning documents:

- historical implementation plans from the February 2026 monorepo migration and renderer-agnostic restructure
- a superseded April 2026 framework PRD, retained for history only
- the active October 2026 plan to trim the framework into the one `strata-kit` procedural-content package

## Documents

| File | Date | Status | Description |
|------|------|--------|-------------|
| [2026-10-11-trim-to-procedural-kit.md](2026-10-11-trim-to-procedural-kit.md) | 2026-10-11 | Active | Canonical trim, rebrand, and publication plan for `strata-kit` |
| [2026-10-12-procedural-layering-boundary.md](2026-10-12-procedural-layering-boundary.md) | 2026-10-12 | Approved follow-on | Ownership boundary for model-neutral construction and layers after the initial release |
| [2026-04-16-remaining-work-prd.md](2026-04-16-remaining-work-prd.md) | 2026-04-16 | Superseded | Historical framework backlog; do not execute it |
| [2026-02-24-monorepo-migration-design.md](2026-02-24-monorepo-migration-design.md) | 2026-02-24 | Complete | Design doc: consolidate 11 repos into Nx + pnpm monorepo |
| [2026-02-24-monorepo-migration-plan.md](2026-02-24-monorepo-migration-plan.md) | 2026-02-24 | Complete | Step-by-step implementation: 9 phases, 30+ tasks |
| [2026-02-24-renderer-agnostic-restructure-design.md](2026-02-24-renderer-agnostic-restructure-design.md) | 2026-02-24 | Complete | Design doc: extract R3F, create adapters/, plugins/, workflows |
| [2026-02-24-renderer-agnostic-restructure-plan.md](2026-02-24-renderer-agnostic-restructure-plan.md) | 2026-02-24 | Complete | Step-by-step implementation: 5 phases, 15 tasks |

## Active Planning Doc

### Trim to Procedural Kit (Current)

**Problem:** The repository bundles procedural-content utilities with an unconsumed game framework. The framework is not a viable package boundary and overlaps the fleet's published kits.

**Current reference:** [2026-10-11-trim-to-procedural-kit.md](2026-10-11-trim-to-procedural-kit.md)

**Use this document for:**

- all implementation sequencing, package-boundary decisions, and rebrand work
- the `strata-kit` publish gate and consumer migration
- recording contested-symbol comparisons before deleting framework code

## Plan Details

### Monorepo Migration (Design + Plan)

**Problem:** 11 separate repos with fragmented CI/CD, duplicated configs, three-tier sync cascade.

**Solution:** Single Nx 22.5 + pnpm monorepo with `packages/`, `apps/` structure.

**Key decisions:**

- Nx over Turborepo/Moon/Bazel for task orchestration
- pnpm workspaces with `workspace:*` protocol
- tsup for all package builds (ESM-only)
- Biome for lint/format (replaced ESLint/Prettier)
- Vitest for testing (replaced Jest)
- Shared tsconfig.base.json with strict mode

**9-phase migration order:**

1. Root config (nx.json, tsconfig, biome, pnpm-workspace)
2. Core package (move src/, update imports)
3. Shaders package (standalone repo wins 1:1 comparisons)
4. Presets package (update workspace deps)
5. Audio-synth + model-synth
6. Native plugins (capacitor + react-native)
7. Apps (docs site + examples)
8. CI/CD (unified workflows)
9. Cleanup (archive source repos)

**Produced:** The current monorepo structure at `packages/core`, `packages/shaders`, `packages/presets`, plus plugins and apps.

### Renderer-Agnostic Restructure (Design + Plan)

**Problem:** Core package contained React/R3F components mixed with pure algorithms.

**Solution:** Extract R3F to dedicated adapter, create plugin directories, add release automation.

**Key decisions:**

- `packages/core/` becomes pure TypeScript (NO React imports)
- R3F components extracted to `adapters/r3f/`
- New `adapters/reactylon/` for Babylon.js support
- New `plugins/astro/` integration, dogfooded in docs site
- Plugins moved from `packages/` to `plugins/` directory
- 3-workflow CI/CD: ci.yml (PRs) -> cd.yml (release-please) -> release.yml (npm publish via OIDC)

**5-phase implementation:**

1. Release workflow automation (release.yml, cd.yml refactor, automerge.yml)
2. Directory restructuring (adapters/, plugins/, R3F extraction)
3. Astro plugin creation and dogfooding
4. Reactylon adapter scaffold
5. Configuration updates and verification

**Produced:** The current `adapters/r3f/`, `adapters/reactylon/`, `plugins/astro/`, release workflows.

## Key Context

- The October 2026 trim plan is ACTIVE and is the current backlog contract
- The April 2026 PRD is SUPERSEDED and is historical evidence only
- The February 2026 plans are HISTORICAL -- the work they describe is complete
- The actual implementation may differ slightly from the plans (iteration during execution)
- The monorepo migration plan is very detailed (~1000 lines) with exact file changes
- Both plans reference commit messages in conventional format
- The renderer-agnostic plan required ~500 import path updates across R3F components
- Post-migration CI/CD uses release-please (not Nx Release as originally planned)

## Related

- [Architecture docs](../architecture/) - Current architecture documentation
- [ROADMAP.md](../architecture/ROADMAP.md) - Framework implementation timeline (ongoing)
- [AGENTS.md](../../AGENTS.md) - Current monorepo structure and commands
