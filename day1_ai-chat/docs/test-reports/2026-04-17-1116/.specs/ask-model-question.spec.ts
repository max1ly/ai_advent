import { test, expect } from '@playwright/test';

test('ask what model the chat is based on', async ({ page }) => {
  await page.goto('/');

  // Fill the chat input textarea
  const textarea = page.getByPlaceholder('Type a message...');
  await expect(textarea).toBeVisible();
  await textarea.fill('What model is this chat based on?');

  // Click send
  const sendButton = page.getByRole('button', { name: 'Send' });
  await sendButton.click();

  // Wait for an assistant response to appear (up to 20s)
  // Assistant messages are in a div with justify-start containing prose content
  const assistantMessage = page.locator('.justify-start .prose').last();
  await expect(assistantMessage).toContainText(/\S+/, { timeout: 20000 });

  // Log the response content for the report
  const responseText = await assistantMessage.textContent();
  console.log(`ASSISTANT_RESPONSE: ${responseText}`);
});
