# TypeScript Development Guidelines

## Core Philosophy

Write clean, tested, production-ready TypeScript code. No shortcuts, no placeholders.

## Development Flow

1. **Read the requirements** from specs or issues
2. **Write tests first** (TDD approach)
3. **Implement the feature** completely
4. **Run tests**: `pnpm test`
5. **Run build**: `pnpm build`
6. **Commit** with conventional commits

## Testing Commands

```bash
# Install dependencies
pnpm install

# Run all tests
pnpm test

# Run with coverage
pnpm test:coverage

# Run in watch mode
pnpm test:watch

# E2E tests
pnpm test:e2e

# Build
pnpm build

# Dev mode
pnpm dev
```

## Docs Development

```bash
# Serve docs locally
pnpm docs:dev
```

## Commit Messages

Use conventional commits:
- `feat(scope): description` → minor bump
- `fix(scope): description` → patch bump
- `feat!: breaking change` → major bump

## Quality Standards

- ✅ All tests passing
- ✅ No TypeScript errors
- ✅ Proper type annotations
- ✅ Complete documentation
- ❌ No TODOs or placeholders
- ❌ No `any` types
