import { test, expect } from '@playwright/test';

test('copy button appears on assistant message and shows feedback on click', async ({ page }) => {
  // Grant clipboard permissions
  await page.context().grantPermissions(['clipboard-read', 'clipboard-write']);

  await page.goto('/');

  const newChatBtn = page.getByRole('button', { name: /new chat/i });
  if (await newChatBtn.isVisible({ timeout: 2_000 }).catch(() => false)) {
    await newChatBtn.click();
    await page.waitForTimeout(500);
  }

  const textarea = page.getByRole('textbox');
  await expect(textarea).toBeVisible();

  await textarea.fill('Reply with the word "pineapple"');
  await textarea.press('Enter');

  // Wait for assistant response
  const assistantMessage = page.locator('.prose').first();
  await expect(assistantMessage).toBeVisible({ timeout: 20_000 });
  await expect(assistantMessage).not.toBeEmpty({ timeout: 20_000 });

  // Find and click the copy button
  const copyButton = page.getByRole('button', { name: /copy message/i });
  await expect(copyButton).toBeVisible({ timeout: 5_000 });
  await copyButton.click();

  // Should show "Copied!" feedback
  await expect(page.getByRole('button', { name: /copied/i })).toBeVisible({ timeout: 5_000 });
});
