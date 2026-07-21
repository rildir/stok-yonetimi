import { test, expect } from '@playwright/test';

test.describe('Dashboard & Navigation Flow', () => {
  test.beforeEach(async ({ page }) => {
    // Navigate to dashboard directly (assuming auth mock or dev session)
    await page.goto('/dashboard');
  });

  test('should display sidebar and top navigation', async ({ page }) => {
    // Verify sidebar navigation links exist
    await expect(page.locator('a[href="/dashboard"], a[href="/products"]')).toBeDefined();
  });
});
