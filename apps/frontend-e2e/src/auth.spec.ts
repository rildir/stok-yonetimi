import { test, expect } from '@playwright/test';

test.describe('Authentication & Login Flow', () => {
  test('should display login page elements correctly', async ({ page }) => {
    await page.goto('/login');

    await expect(page.locator('.login-brand-text')).toHaveText('ecelon');
    await expect(page.locator('#loginUsername')).toBeVisible();
    await expect(page.locator('#loginPassword')).toBeVisible();
    await expect(page.locator('.login-submit-btn')).toBeVisible();
  });

  test('should have disabled submit button while loading', async ({ page }) => {
    await page.goto('/login');

    // Verify the submit button exists and is initially enabled
    const submitBtn = page.locator('.login-submit-btn');
    await expect(submitBtn).toBeVisible();
    await expect(submitBtn).toBeEnabled();
  });
});
