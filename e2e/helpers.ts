import type { Page } from '@playwright/test';

/**
 * Shared E2E helpers. Tests run against the production build served by
 * `vite preview` (configured in playwright.config.ts).
 */
export const CANARY = 'CANARY_PROMPT_7f3a91be42d9c0e5a6b8d4e2f1c3b9a7';

export async function openSanitizer(page: Page): Promise<void> {
  await page.goto('/#/sanitizer');
  await page.waitForLoadState('domcontentloaded');
  await expectEditorVisible(page);
}

export async function expectEditorVisible(page: Page): Promise<void> {
  await page.getByRole('heading', { name: 'Sanitize a prompt' }).waitFor({ timeout: 10_000 });
}

export async function loadSample(page: Page, sampleName: string | RegExp): Promise<void> {
  await page.getByRole('button', { name: 'Samples' }).click();
  await page.getByRole('menuitem', { name: sampleName }).click();
  await page
    .getByRole('status')
    .filter({ hasText: 'Loaded sample' })
    .last()
    .waitFor({ timeout: 5000 });
}

export async function runScan(page: Page): Promise<void> {
  await page.getByRole('button', { name: 'Scan prompt' }).click();
  await page.getByRole('status').filter({ hasText: 'Scan complete' }).waitFor({ timeout: 20_000 });
}

export async function clearEditor(page: Page): Promise<void> {
  const clearButton = page.getByRole('button', { name: /Clear/ });
  if (await clearButton.isEnabled()) {
    await clearButton.click();
    await page.getByRole('button', { name: 'Clear prompt' }).click();
  }
}

export async function typePrompt(page: Page, text: string): Promise<void> {
  await page.getByLabel('Prompt text to inspect').fill(text);
}
