# Copilot Instructions for Strata

## Project Overview

Strata is a procedural 3D graphics library for React Three Fiber providing terrain, water, sky, vegetation, and effects.

## Repository Structure

```
src/
├── core/           # Pure TypeScript algorithms (NO React)
├── components/     # React Three Fiber components
├── shaders/        # GLSL shaders (use /* glsl */ template literals)
├── presets/        # Ready-to-use configurations
├── hooks/          # React hooks
├── api/            # High-level API
└── __tests__/      # Unit tests
```

## Development Commands

```bash
# Install dependencies
pnpm install

# Build the library
pnpm run build

# Run all tests
pnpm run test

# Run tests in watch mode
pnpm run test:watch

# Run specific test file
pnpm run test -- src/__tests__/camera.test.ts

# Lint code
pnpm run lint

# Format code
pnpm run format

# Type check
pnpm run typecheck
```

## Testing Architecture

### Unit Tests
- Located in `src/__tests__/` and `src/core/**/__tests__/`
- Use Vitest as the test runner
- Run with `pnpm run test`

### Integration Tests
- Located in `tests/integration/`
- Test component interactions
- Run with `pnpm run test:integration`

### E2E Tests (Playwright)
- Located in `tests/e2e/`
- Use Playwright for browser testing
- Run with `pnpm run test:e2e`

## Code Style

### TypeScript
- Use strict TypeScript
- All public APIs must have JSDoc comments
- Prefer interfaces over types for object shapes
- Use `readonly` for immutable properties

### React Components
- Functional components only
- Use React.forwardRef for ref forwarding
- Props interfaces should be named `{ComponentName}Props`

### Shaders
- Use `/* glsl */` template literal tag
- Export as `{name}VertexShader` and `{name}FragmentShader`

## Commit Messages

Use conventional commits:
- `feat(terrain): add new erosion algorithm` → minor version
- `fix(water): correct reflection calculations` → patch version
- `refactor(shaders): optimize cloud rendering` → patch version
- `docs: update API documentation` → no version change
- `test: add unit tests for pathfinding` → no version change

## Pull Request Guidelines

1. Create focused PRs (one feature/fix per PR)
2. Ensure all tests pass
3. Ensure lint checks pass
4. Update documentation if changing public APIs
5. Request reviews from AI agents:
   - `@claude` for architecture and best practices
   - `/q review` for security and bugs
   - `/gemini review` for code quality
   - `@cursor review` for refactoring suggestions

## Issue Management

### Labels
- `bug` - Something isn't working
- `enhancement` - New feature or request
- `documentation` - Documentation improvements
- `extraction` - Archive extraction work
- `good first issue` - Good for newcomers

### Linking
- Reference issues in commits: `Closes #123`
- Reference PRs in issues: `Fixed in #456`

## MCP Server Usage

### Playwright MCP
For E2E testing automation:
```
Use playwright_navigate to load test pages
Use playwright_screenshot for visual regression
Use playwright_click/fill for interactions
```

### GitHub MCP
For issue/project management:
```
Use github_create_issue for new issues
Use github_update_issue to update status
Use github_add_comment for progress updates
```

## Architecture Principles

1. **Core algorithms are pure TypeScript** - No React dependencies in `src/core/`
2. **Components wrap core** - React components in `src/components/` use core algorithms
3. **Shaders are separate** - GLSL code lives in `src/shaders/`
4. **Presets are configurations** - Pre-built setups in `src/presets/`

## Common Tasks

### Adding a New Effect
1. Create core algorithm in `src/core/{effect}.ts`
2. Create React component in `src/components/{Effect}.tsx`
3. Add shader if needed in `src/shaders/{effect}.ts`
4. Export from `src/index.ts`
5. Add unit tests in `src/__tests__/{effect}.test.ts`

### Fixing a Bug
1. Write a failing test that reproduces the bug
2. Fix the code
3. Verify the test passes
4. Check for related issues that might be affected

### Updating Documentation
1. Update JSDoc comments in source files
2. Run `pnpm run docs` to regenerate API docs
3. Update relevant markdown files
