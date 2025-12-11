import { test, expect } from '@playwright/test';

/**
 * E2E tests for Strata rendering examples
 *
 * These tests verify that all rendering features work correctly
 * across different browsers and devices.
 */

test.describe('Strata Rendering Examples', () => {
    test('should render terrain demo', async ({ page }) => {
        await page.goto('/demos/terrain');
        await page.waitForLoadState('networkidle');

        const canvas = page.locator('canvas');
        await expect(canvas.first()).toBeVisible({ timeout: 15000 });

        await page.waitForTimeout(2000);

        await expect(page).toHaveScreenshot('terrain.png', {
            fullPage: false,
            clip: { x: 0, y: 0, width: 800, height: 600 },
        });
    });

    test('should render water demo', async ({ page }) => {
        await page.goto('/demos/water');
        await page.waitForLoadState('networkidle');

        const canvas = page.locator('canvas');
        await expect(canvas.first()).toBeVisible({ timeout: 15000 });

        await page.waitForTimeout(2000);

        await expect(page).toHaveScreenshot('water.png', {
            fullPage: false,
            clip: { x: 0, y: 0, width: 800, height: 600 },
        });
    });

    test('should render vegetation demo', async ({ page }) => {
        await page.goto('/demos/vegetation');
        await page.waitForLoadState('networkidle');

        const canvas = page.locator('canvas');
        await expect(canvas.first()).toBeVisible({ timeout: 15000 });

        await page.waitForTimeout(2000);

        await expect(page).toHaveScreenshot('vegetation.png', {
            fullPage: false,
            clip: { x: 0, y: 0, width: 800, height: 600 },
        });
    });

    test('should render characters demo', async ({ page }) => {
        await page.goto('/demos/characters');
        await page.waitForLoadState('networkidle');

        const canvas = page.locator('canvas');
        await expect(canvas.first()).toBeVisible({ timeout: 15000 });

        await page.waitForTimeout(2000);

        await expect(page).toHaveScreenshot('character-fur.png', {
            fullPage: false,
            clip: { x: 0, y: 0, width: 800, height: 600 },
        });
    });

    test('should render sky demo', async ({ page }) => {
        await page.goto('/demos/sky');
        await page.waitForLoadState('networkidle');

        const canvas = page.locator('canvas');
        await expect(canvas.first()).toBeVisible({ timeout: 15000 });

        await page.waitForTimeout(2000);

        await expect(page).toHaveScreenshot('sky-volumetrics.png', {
            fullPage: false,
            clip: { x: 0, y: 0, width: 800, height: 600 },
        });
    });

    test('should handle camera movement', async ({ page }) => {
        await page.goto('/demos/camera');
        await page.waitForLoadState('networkidle');

        const canvas = page.locator('canvas');
        await expect(canvas.first()).toBeVisible({ timeout: 15000 });

        await page.mouse.move(400, 300);
        await page.mouse.down();
        await page.mouse.move(500, 400);
        await page.mouse.up();

        await page.waitForTimeout(1000);

        await expect(page).toHaveScreenshot('camera-movement.png', {
            fullPage: false,
            clip: { x: 0, y: 0, width: 800, height: 600 },
        });
    });

    test('should render full scene demo', async ({ page }) => {
        await page.goto('/demos/full-scene');
        await page.waitForLoadState('networkidle');

        const canvas = page.locator('canvas');
        await expect(canvas.first()).toBeVisible({ timeout: 15000 });

        await page.waitForTimeout(3000);

        const hasWebGLContext = await page.evaluate(() => {
            const canvas = document.querySelector('canvas');
            if (!canvas) return false;
            const gl = canvas.getContext('webgl') || canvas.getContext('webgl2');
            return gl !== null;
        });
        expect(hasWebGLContext).toBe(true);
    });
});
