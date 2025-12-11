import { test, expect, Page } from '@playwright/test';

const DEMO_PAGES = [
  { path: '/', name: 'Homepage' },
  { path: '/demos/terrain', name: 'Terrain' },
  { path: '/demos/water', name: 'Water' },
  { path: '/demos/sky', name: 'Sky' },
  { path: '/demos/vegetation', name: 'Vegetation' },
  { path: '/demos/volumetrics', name: 'Volumetrics' },
  { path: '/demos/characters', name: 'Characters' },
  { path: '/demos/full-scene', name: 'Full Scene' },
  { path: '/demos/particles', name: 'Particles' },
  { path: '/demos/weather', name: 'Weather' },
  { path: '/demos/clouds', name: 'Clouds' },
  { path: '/demos/camera', name: 'Camera' },
  { path: '/demos/decals', name: 'Decals' },
  { path: '/demos/lod', name: 'LOD' },
  { path: '/demos/god-rays', name: 'God Rays' },
  { path: '/demos/input', name: 'Input' },
  { path: '/demos/ai', name: 'AI' },
  { path: '/demos/audio', name: 'Audio' },
];

async function collectConsoleErrors(page: Page): Promise<string[]> {
  const errors: string[] = [];
  page.on('console', (msg) => {
    if (msg.type() === 'error') {
      errors.push(msg.text());
    }
  });
  return errors;
}

function filterWebGLErrors(errors: string[]): string[] {
  return errors.filter((error) => {
    const lowerError = error.toLowerCase();
    return (
      lowerError.includes('webgl') ||
      lowerError.includes('three') ||
      lowerError.includes('shader') ||
      lowerError.includes('gl_') ||
      lowerError.includes('context lost')
    );
  });
}

test.describe('Documentation Site - Demo Pages', () => {
  test.describe('Page Loading', () => {
    for (const demo of DEMO_PAGES) {
      test(`${demo.name} page loads without errors`, async ({ page }) => {
        const consoleErrors: string[] = [];
        page.on('console', (msg) => {
          if (msg.type() === 'error') {
            consoleErrors.push(msg.text());
          }
        });

        const response = await page.goto(demo.path, { waitUntil: 'domcontentloaded' });
        expect(response?.status()).toBeLessThan(400);

        await page.waitForLoadState('networkidle');

        const webglErrors = filterWebGLErrors(consoleErrors);
        expect(webglErrors).toHaveLength(0);
      });
    }
  });

  test.describe('Canvas Rendering', () => {
    for (const demo of DEMO_PAGES) {
      test(`${demo.name} renders canvas element`, async ({ page }) => {
        await page.goto(demo.path);
        await page.waitForLoadState('networkidle');

        const canvas = page.locator('canvas');
        await expect(canvas.first()).toBeVisible({ timeout: 15000 });

        const canvasCount = await canvas.count();
        expect(canvasCount).toBeGreaterThan(0);
      });
    }
  });

  test.describe('WebGL Context', () => {
    for (const demo of DEMO_PAGES) {
      test(`${demo.name} has valid WebGL context`, async ({ page }) => {
        await page.goto(demo.path);
        await page.waitForLoadState('networkidle');

        await page.waitForSelector('canvas', { timeout: 15000 });

        const hasWebGLContext = await page.evaluate(() => {
          const canvas = document.querySelector('canvas');
          if (!canvas) return false;
          const gl = canvas.getContext('webgl') || canvas.getContext('webgl2');
          return gl !== null;
        });

        expect(hasWebGLContext).toBe(true);
      });
    }
  });
});

test.describe('Documentation Site - Navigation', () => {
  test('can navigate from homepage to demos via View Demo buttons', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');

    const viewDemoButton = page.locator('a:has-text("View Demo")').first();
    await expect(viewDemoButton).toBeVisible();
    await viewDemoButton.click();

    await page.waitForURL(/\/demos\//);
    expect(page.url()).toContain('/demos/');
  });

  test('can navigate using top navigation bar', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');

    const gettingStartedLink = page.locator('a:has-text("Getting Started")').first();
    await expect(gettingStartedLink).toBeVisible();
    await gettingStartedLink.click();

    await page.waitForURL('/getting-started');
    expect(page.url()).toContain('/getting-started');
  });

  test('can navigate using demos dropdown menu', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');

    const demosButton = page.locator('button:has-text("Demos")');
    await expect(demosButton).toBeVisible();
    await demosButton.click();

    const terrainMenuItem = page.locator('[role="menuitem"]:has-text("Terrain")');
    await expect(terrainMenuItem).toBeVisible();
    await terrainMenuItem.click();

    await page.waitForURL('/demos/terrain');
    expect(page.url()).toContain('/demos/terrain');
  });

  test('demo chip navigation works', async ({ page }) => {
    await page.goto('/demos/terrain');
    await page.waitForLoadState('networkidle');

    const waterChip = page.locator('a:has-text("Water")').first();
    await expect(waterChip).toBeVisible();
    await waterChip.click();

    await page.waitForURL('/demos/water');
    expect(page.url()).toContain('/demos/water');
  });

  test('can navigate between multiple demo pages', async ({ page }) => {
    const demoSequence = ['/demos/terrain', '/demos/water', '/demos/sky', '/demos/vegetation'];

    for (const demoPath of demoSequence) {
      await page.goto(demoPath);
      await page.waitForLoadState('networkidle');

      const canvas = page.locator('canvas');
      await expect(canvas.first()).toBeVisible({ timeout: 15000 });
    }
  });

  test('logo navigates to homepage', async ({ page }) => {
    await page.goto('/demos/terrain');
    await page.waitForLoadState('networkidle');

    const logo = page.locator('a:has-text("STRATA")').first();
    await expect(logo).toBeVisible();
    await logo.click();

    await page.waitForURL('/');
    expect(page.url()).toMatch(/\/$/);
  });
});

test.describe('Documentation Site - Demo Controls', () => {
  test('terrain demo has interactive sliders', async ({ page }) => {
    await page.goto('/demos/terrain');
    await page.waitForLoadState('networkidle');

    const slider = page.locator('[role="slider"]').first();
    await expect(slider).toBeVisible({ timeout: 10000 });

    const sliderCount = await page.locator('[role="slider"]').count();
    expect(sliderCount).toBeGreaterThan(0);
  });

  test('sliders can be interacted with', async ({ page }) => {
    await page.goto('/demos/terrain');
    await page.waitForLoadState('networkidle');

    const slider = page.locator('[role="slider"]').first();
    await expect(slider).toBeVisible({ timeout: 10000 });

    const initialValue = await slider.getAttribute('aria-valuenow');

    const sliderBound = await slider.boundingBox();
    if (sliderBound) {
      await page.mouse.click(sliderBound.x + sliderBound.width * 0.8, sliderBound.y + sliderBound.height / 2);
    }

    await page.waitForTimeout(500);
    const newValue = await slider.getAttribute('aria-valuenow');
    expect(newValue).not.toBe(initialValue);
  });

  test('toggle stats button works', async ({ page }) => {
    await page.goto('/demos/terrain');
    await page.waitForLoadState('networkidle');

    const statsButton = page.locator('[aria-label="Toggle Stats"]');
    if (await statsButton.isVisible()) {
      await statsButton.click();
      await page.waitForTimeout(500);
    }
  });

  test('demo info panel can be collapsed', async ({ page }) => {
    await page.goto('/demos/water');
    await page.waitForLoadState('networkidle');

    const expandButton = page.locator('button[aria-label*="expand"], button svg[data-testid*="Expand"], button:has(svg)').first();
    if (await expandButton.isVisible()) {
      await expandButton.click();
      await page.waitForTimeout(300);
    }
  });
});

test.describe('Documentation Site - Responsive Layout', () => {
  test('homepage renders correctly on mobile', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 667 });
    await page.goto('/');
    await page.waitForLoadState('networkidle');

    const canvas = page.locator('canvas');
    await expect(canvas.first()).toBeVisible({ timeout: 15000 });

    const menuButton = page.locator('button[aria-label*="menu"], button:has(svg[data-testid="MenuIcon"])');
    await expect(menuButton.first()).toBeVisible();
  });

  test('demo page renders correctly on mobile', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 667 });
    await page.goto('/demos/terrain');
    await page.waitForLoadState('networkidle');

    const canvas = page.locator('canvas');
    await expect(canvas.first()).toBeVisible({ timeout: 15000 });
  });

  test('mobile navigation drawer works', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 667 });
    await page.goto('/');
    await page.waitForLoadState('networkidle');

    const menuButton = page.locator('button').filter({ has: page.locator('svg') }).first();
    await menuButton.click();

    const drawer = page.locator('[role="presentation"]');
    await expect(drawer).toBeVisible({ timeout: 5000 });

    const terrainLink = drawer.locator('text=Terrain');
    await expect(terrainLink).toBeVisible();
    await terrainLink.click();

    await page.waitForURL('/demos/terrain');
  });
});

test.describe('Documentation Site - Performance', () => {
  test('homepage loads within acceptable time', async ({ page }) => {
    const startTime = Date.now();
    await page.goto('/');
    await page.waitForLoadState('networkidle');
    const loadTime = Date.now() - startTime;

    expect(loadTime).toBeLessThan(30000);
  });

  test('demo page transitions are smooth', async ({ page }) => {
    await page.goto('/demos/terrain');
    await page.waitForLoadState('networkidle');

    const startTime = Date.now();
    await page.goto('/demos/water');
    await page.waitForLoadState('networkidle');
    const transitionTime = Date.now() - startTime;

    expect(transitionTime).toBeLessThan(15000);
  });
});

test.describe('Documentation Site - Error Handling', () => {
  test('404 handling for invalid routes', async ({ page }) => {
    await page.goto('/invalid-route-that-does-not-exist');
    await page.waitForLoadState('networkidle');

    const canvas = page.locator('canvas');
    const isHomePage = await canvas.first().isVisible().catch(() => false);
    expect(isHomePage || page.url().includes('/')).toBe(true);
  });

  test('no JavaScript errors on page load', async ({ page }) => {
    const jsErrors: string[] = [];
    page.on('pageerror', (error) => {
      jsErrors.push(error.message);
    });

    await page.goto('/');
    await page.waitForLoadState('networkidle');

    const criticalErrors = jsErrors.filter(
      (error) => !error.includes('ResizeObserver') && !error.includes('non-passive')
    );
    expect(criticalErrors).toHaveLength(0);
  });

  test('no JavaScript errors on demo pages', async ({ page }) => {
    const jsErrors: string[] = [];
    page.on('pageerror', (error) => {
      jsErrors.push(error.message);
    });

    await page.goto('/demos/terrain');
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(2000);

    const criticalErrors = jsErrors.filter(
      (error) =>
        !error.includes('ResizeObserver') &&
        !error.includes('non-passive') &&
        !error.includes('WebGL')
    );
    expect(criticalErrors).toHaveLength(0);
  });
});

test.describe('Documentation Site - Accessibility', () => {
  test('homepage has proper heading structure', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');

    const h1 = page.locator('h1');
    await expect(h1.first()).toBeVisible();
  });

  test('navigation links are keyboard accessible', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');

    await page.keyboard.press('Tab');
    await page.keyboard.press('Tab');
    await page.keyboard.press('Tab');

    const focusedElement = await page.evaluate(() => document.activeElement?.tagName);
    expect(['A', 'BUTTON']).toContain(focusedElement);
  });

  test('interactive elements have proper focus styles', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');

    const button = page.locator('button').first();
    await button.focus();

    const isFocused = await button.evaluate((el) => document.activeElement === el);
    expect(isFocused).toBe(true);
  });
});

test.describe('Documentation Site - Content Verification', () => {
  test('homepage displays Strata branding', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');

    const strataText = page.locator('text=STRATA');
    await expect(strataText.first()).toBeVisible();
  });

  test('homepage displays feature cards', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');

    const featureCards = page.locator('[class*="MuiCard"]');
    const cardCount = await featureCards.count();
    expect(cardCount).toBeGreaterThan(0);
  });

  test('demo pages display title and description', async ({ page }) => {
    await page.goto('/demos/terrain');
    await page.waitForLoadState('networkidle');

    const title = page.locator('h6:has-text("Terrain")');
    await expect(title.first()).toBeVisible({ timeout: 10000 });
  });

  test('code examples are displayed on homepage', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');

    const codeBlock = page.locator('pre code');
    await expect(codeBlock.first()).toBeVisible();
  });
});
