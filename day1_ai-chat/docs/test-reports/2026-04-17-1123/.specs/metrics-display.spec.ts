import { test, expect } from '@playwright/test';

test('metrics display shows token stats after assistant responds', async ({ page }) => {
  await page.goto('/');

  // Reset session to avoid accumulated context from prior tests
  const newChatBtn = page.getByRole('button', { name: /new chat/i });
  if (await newChatBtn.isVisible({ timeout: 2_000 }).catch(() => false)) {
    await newChatBtn.click();
    await page.waitForTimeout(500);
  }

  const textarea = page.getByRole('textbox');
  await expect(textarea).toBeVisible();

  await textarea.fill('What is 2+2?');
  await textarea.press('Enter');

  // Wait for assistant to finish responding
  const assistantMessage = page.locator('.prose').first();
  await expect(assistantMessage).toBeVisible({ timeout: 20_000 });
  await expect(assistantMessage).not.toBeEmpty({ timeout: 20_000 });

  // Metrics bar shows "Last: Xin/Yout Total: Z" after a response
  const metricsArea = page.locator('text=/Total:/i').first();
  await expect(metricsArea).toBeVisible({ timeout: 10_000 });
});
