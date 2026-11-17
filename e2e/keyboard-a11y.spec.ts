import { expect, test } from '@playwright/test';
import { AxeBuilder } from '@axe-core/playwright';
import { openSanitizer, runScan, typePrompt } from './helpers';

test.describe('keyboard-only operation', () => {
  test('skip link, keyboard scan, and full redaction flow work without a mouse', async ({
    page,
  }) => {
    await openSanitizer(page);

    // Skip link receives focus first and jumps to main content.
    await page.keyboard.press('Tab');
    await expect(page.getByRole('link', { name: 'Skip to content' })).toBeFocused();

    // Type the prompt (keyboard-only path) and run a scan with Ctrl/Cmd+Enter.
    await typePrompt(page, 'email jane.doe@x.example today');
    await page.keyboard.press('ControlOrMeta+Enter');
    await page
      .getByRole('status')
      .filter({ hasText: 'Scan complete' })
      .waitFor({ timeout: 20_000 });

    // Open the finding action menu via keyboard and apply a mask.
    const finding = page.locator('li').filter({ hasText: 'email' }).first();
    const chooseAction = finding.getByRole('button', { name: 'Choose action' });
    await chooseAction.focus();
    await expect(chooseAction).toBeFocused();
    await page.keyboard.press('Enter');
    await page
      .getByRole('menuitem', { name: /Mask as \[EMAIL_REDACTED\]/ })
      .waitFor({ timeout: 3000 });
    await page.keyboard.press('Enter');

    // Output updated; keyboard undo via toolbar buttons (focus + Enter).
    const output = page.getByLabel('Sanitized prompt text');
    await expect(output).toHaveValue(/\[EMAIL_REDACTED\]/);
    const undoButton = page.getByRole('button', { name: 'Undo last redaction action' });
    await undoButton.focus();
    await page.keyboard.press('Enter');
    await expect(page.getByText('No sanitized output yet')).toBeVisible();
  });

  test('theme toggle and navigation are keyboard reachable', async ({ page }) => {
    await openSanitizer(page);
    await page.getByRole('button', { name: /Theme:/ }).focus();
    await page.keyboard.press('Enter');
    await page.keyboard.press('Enter'); // toggle dark → light → back
    await page
      .getByRole('navigation', { name: 'Primary' })
      .getByRole('link', { name: 'Guides' })
      .focus();
    await page.keyboard.press('Enter');
    await expect(page.getByRole('heading', { name: 'Guides' })).toBeVisible();
  });
});

test.describe('accessibility scans (axe)', () => {
  const scanPage = async (page: import('@playwright/test').Page, path: string): Promise<void> => {
    await page.goto(path);
    await page.waitForLoadState('domcontentloaded');
    await page.waitForTimeout(500);
    const results = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
      .analyze();
    // Filter known-acceptable violations: none expected — fail on any real one.
    const serious = results.violations.filter(
      (v) => v.impact === 'serious' || v.impact === 'critical',
    );
    if (serious.length > 0) {
      const summary = serious
        .map(
          (v) =>
            `${v.id} (${v.impact}): ${v.nodes
              .slice(0, 3)
              .map((n) => n.target.join(' '))
              .join('; ')}`,
        )
        .join('\n');
      throw new Error(`axe found serious/critical violations on ${path}:\n${summary}`);
    }
  };

  test('sanitizer workspace (light)', async ({ page }) => {
    await scanPage(page, '/#/sanitizer');
  });

  test('sanitizer with findings', async ({ page }) => {
    await openSanitizer(page);
    await typePrompt(page, 'email jane.doe@x.example, card 4111 1111 1111 1111');
    await runScan(page);
    const results = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
      .analyze();
    const serious = results.violations.filter(
      (v) => v.impact === 'serious' || v.impact === 'critical',
    );
    expect(serious, JSON.stringify(serious.map((v) => v.id))).toHaveLength(0);
  });

  test('privacy view (dark theme)', async ({ page }) => {
    await page.emulateMedia({ colorScheme: 'dark' });
    await scanPage(page, '/#/privacy');
  });

  test('rules, guides, about, settings', async ({ page }) => {
    await scanPage(page, '/#/rules');
    await scanPage(page, '/#/guides');
    await scanPage(page, '/#/about');
    await scanPage(page, '/#/settings');
  });
});
