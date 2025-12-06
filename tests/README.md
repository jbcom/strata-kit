# Strata Test Suite

This directory contains all automated tests for Strata, organized by test type.

## Test Structure

```
tests/
├── unit/           # Unit tests for core algorithms (pure TypeScript)
├── integration/    # Integration tests for React components
└── e2e/           # End-to-end Playwright tests with visual regression
```

## Running Tests

```bash
# Unit tests only
npm test

# Unit tests with coverage
npm run test:coverage

# Integration tests (when implemented)
npm run test:integration

# E2E tests
npm run test:e2e

# E2E tests with UI
npm run test:e2e:ui

# All tests
npm run test && npm run test:e2e
```

## Test Types

### Unit Tests (`tests/unit/`)

**Purpose**: Test individual functions in isolation

**Scope**:
- Core algorithms (SDF, marching cubes, instancing, etc.)
- Pure TypeScript functions (no React, no Three.js scene)
- Input validation
- Edge cases
- Mathematical correctness

**Example**:
```ts
// tests/unit/sdf.test.ts
import { sdSphere } from '@jbcom/strata/core';

test('sdSphere returns correct distance', () => {
  const result = sdSphere(
    new Vector3(0, 0, 0),
    new Vector3(0, 0, 0),
    1.0
  );
  expect(result).toBe(-1.0); // Inside sphere
});
```

**Tools**: Vitest

### Integration Tests (`tests/integration/`)

**Purpose**: Test React components with Three.js scene

**Scope**:
- Component rendering
- Props handling
- State management
- Material/geometry creation
- Resource disposal

**Example**:
```tsx
// tests/integration/Water.test.tsx
import { render } from '@testing-library/react';
import { Canvas } from '@react-three/fiber';
import { Water } from '@jbcom/strata/components';

test('Water component renders', () => {
  render(
    <Canvas>
      <Water size={10} />
    </Canvas>
  );
  // Assert material created, uniforms set, etc.
});
```

**Tools**: Vitest + @testing-library/react + @react-three/test-renderer

### E2E Tests (`tests/e2e/`)

**Purpose**: Test complete rendering pipeline in real browsers

**Scope**:
- Visual regression testing
- Cross-browser compatibility
- Performance metrics
- User interactions
- Complete examples

**Example**:
```ts
// tests/e2e/rendering.spec.ts
test('should render terrain', async ({ page }) => {
  await page.goto('/examples/comprehensive');
  const terrain = page.locator('[data-testid="terrain"]');
  await expect(terrain).toBeVisible();
  await expect(page).toHaveScreenshot('terrain.png');
});
```

**Tools**: Playwright

## Test Data

- Use deterministic seeds for random functions
- Mock Three.js WebGL context for unit tests
- Use test fixtures for complex geometries
- Keep test data minimal and focused

## Coverage Goals

- **Unit tests**: 90%+ coverage of core functions
- **Integration tests**: 80%+ coverage of components
- **E2E tests**: All major features and examples

## Continuous Integration

All tests run in CI:
- Unit tests: Fast, run on every commit
- Integration tests: Medium speed, run on PRs
- E2E tests: Slower, run on main branch and releases

## Writing Tests

### Unit Test Guidelines

1. Test one thing at a time
2. Use descriptive test names
3. Test edge cases (null, empty arrays, negative numbers)
4. Test input validation
5. Use fixtures for complex data

### Integration Test Guidelines

1. Test component props
2. Test material/geometry creation
3. Test resource cleanup
4. Mock external dependencies
5. Test error boundaries

### E2E Test Guidelines

1. Test user-visible features
2. Use data-testid attributes
3. Take screenshots for visual regression
4. Test performance metrics
5. Test across multiple browsers/devices

## Examples vs Tests

**Examples** (`examples/`) are for:
- Documentation
- Learning
- Demonstrating features
- Not for automated verification

**Tests** (`tests/`) are for:
- Automated verification
- Regression prevention
- CI/CD integration
- Not for human reading

Keep them separate!
