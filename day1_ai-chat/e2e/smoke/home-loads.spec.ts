import { test, expect } from '@playwright/test';

test('home page loads and renders the chat shell', async ({ page }) => {
  await page.goto('/');
  await expect(page).toHaveTitle(/chat/i);
  const textarea = page.getByRole('textbox');
  await expect(textarea).toBeVisible();
});
