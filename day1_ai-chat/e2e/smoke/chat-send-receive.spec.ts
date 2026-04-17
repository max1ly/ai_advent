import { test, expect } from '@playwright/test';

test('chat send and receive — user message appears and assistant responds', async ({ page }) => {
  await page.goto('/');

  const newChatBtn = page.getByRole('button', { name: /new chat/i });
  if (await newChatBtn.isVisible({ timeout: 2_000 }).catch(() => false)) {
    await newChatBtn.click();
    await page.waitForTimeout(500);
  }

  const textarea = page.getByRole('textbox');
  await expect(textarea).toBeVisible();

  await textarea.fill('Say hello in exactly 3 words');
  await textarea.press('Enter');

  // User message should appear
  await expect(page.locator('text=Say hello in exactly 3 words')).toBeVisible({ timeout: 5_000 });

  // Assistant response in .prose container
  const assistantMessage = page.locator('.prose').first();
  await expect(assistantMessage).toBeVisible({ timeout: 20_000 });
  await expect(assistantMessage).not.toBeEmpty({ timeout: 20_000 });

  const text = await assistantMessage.textContent();
  expect(text!.length).toBeGreaterThan(0);
});
