import { test, expect } from '@playwright/test';

test('sends a message and receives a response within 20s', async ({ page }) => {
  await page.goto('/');

  const textarea = page.getByRole('textbox');
  await expect(textarea).toBeVisible();

  await textarea.fill('What model is this chat based on?');
  await textarea.press('Enter');

  // Assistant messages render inside a div with class "prose"
  // Wait for at least one prose block with non-empty text content
  const assistantMessage = page.locator('.prose').first();
  await expect(assistantMessage).toBeVisible({ timeout: 20_000 });

  // Wait for actual text content (not just the container appearing)
  await expect(assistantMessage).not.toBeEmpty({ timeout: 20_000 });

  const text = await assistantMessage.textContent();
  console.log('Assistant response:', text?.slice(0, 300));
  expect(text?.length).toBeGreaterThan(0);
});
