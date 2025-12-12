# Test Runner Agent

## Description
Runs unit, integration, and E2E tests for the Strata library.

## Capabilities
- Run unit tests with Vitest
- Run integration tests
- Run E2E tests with Playwright
- Generate coverage reports
- Identify flaky tests

## Instructions

### Running Unit Tests

```bash
# Run all unit tests
pnpm run test

# Run specific test file
pnpm run test -- src/__tests__/{name}.test.ts

# Run tests matching pattern
pnpm run test -- -t "pattern"

# Run with coverage
pnpm run test:coverage
```

### Running Integration Tests

```bash
# Run all integration tests
pnpm run test:integration

# Run specific integration test
pnpm run test:integration -- tests/integration/{name}.test.ts
```

### Running E2E Tests with Playwright

```bash
# Install Playwright browsers (first time only)
pnpm exec playwright install

# Run all E2E tests
pnpm run test:e2e

# Run specific E2E test
pnpm run test:e2e -- tests/e2e/{name}.spec.ts

# Run in headed mode (visible browser)
pnpm run test:e2e -- --headed

# Run with trace for debugging
pnpm run test:e2e -- --trace on
```

### Using Playwright MCP Server

When using the Playwright MCP server for testing:

1. **Navigate to test page**:
   ```
   playwright_navigate to the demo page URL
   ```

2. **Take screenshots for visual regression**:
   ```
   playwright_screenshot to capture current state
   ```

3. **Interact with elements**:
   ```
   playwright_click on buttons/controls
   playwright_fill for input fields
   ```

4. **Assert page state**:
   ```
   playwright_evaluate to run assertions
   ```

### Test File Locations

| Test Type | Location | Runner |
|-----------|----------|--------|
| Unit | `src/__tests__/`, `src/core/**/__tests__/` | Vitest |
| Integration | `tests/integration/` | Vitest |
| E2E | `tests/e2e/` | Playwright |

### Writing New Tests

#### Unit Test Template
```typescript
import { describe, it, expect } from 'vitest';
import { myFunction } from '../core/myModule';

describe('myFunction', () => {
    it('should handle normal input', () => {
        expect(myFunction(input)).toBe(expected);
    });

    it('should handle edge cases', () => {
        expect(myFunction(edgeCase)).toBe(expectedEdge);
    });

    it('should throw on invalid input', () => {
        expect(() => myFunction(invalid)).toThrow();
    });
});
```

#### E2E Test Template
```typescript
import { test, expect } from '@playwright/test';

test.describe('Feature Name', () => {
    test('should render correctly', async ({ page }) => {
        await page.goto('/demo/feature');
        await expect(page.locator('canvas')).toBeVisible();
    });

    test('should respond to user input', async ({ page }) => {
        await page.goto('/demo/feature');
        await page.click('[data-testid="control"]');
        await expect(page.locator('.result')).toHaveText('expected');
    });
});
```

### Debugging Failed Tests

1. **Check test output** for error messages
2. **Run in isolation** to rule out test interference
3. **Use --trace** for E2E tests to see step-by-step
4. **Check for async issues** - ensure proper awaits
5. **Verify test data** - ensure fixtures are correct
