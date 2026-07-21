import { test, expect } from '@playwright/test';

test.describe('Authentication & Login Flow', () => {
  test('should display login page elements correctly', async ({ page }) => {
    await page.goto('/login');

    await expect(page.locator('.login-brand-text')).toHaveText('ecelon');
    await expect(page.locator('#loginUsername')).toBeVisible();
    await expect(page.locator('#loginPassword')).toBeVisible();
    await expect(page.locator('.login-submit-btn')).toBeVisible();
  });

  test('should show error toast on invalid credentials', async ({ page }) => {
    await page.goto('/login');

    await page.fill('#loginUsername', 'invalid_user');
    await page.fill('#loginPassword', 'wrong_password');
    await page.click('.login-submit-btn');

    // Toast or error notification should pop up
    const toast = page.locator('.toast-error');
    await expect(toast).toBeVisible({ timeout: 5000 });
  });
});
