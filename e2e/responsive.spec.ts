import { expect, test } from '@playwright/test';
import { openSanitizer, runScan, typePrompt } from './helpers';

test.describe('responsive layout', () => {
  test('mobile viewport stacks panels and mobile nav works', async ({ page }) => {
    await openSanitizer(page);
    // Hamburger menu visible on narrow screens
    const menu = page.getByRole('button', { name: 'Open menu' });
    await expect(menu).toBeVisible();
    await menu.click();
    await expect(page.getByRole('navigation', { name: 'Primary mobile' })).toBeVisible();
    await page.getByRole('link', { name: 'Privacy' }).first().click();
    await expect(page.getByRole('heading', { name: 'Privacy center' })).toBeVisible();
    // The mobile nav closes after navigation (by design); reopen it.
    await page.getByRole('button', { name: 'Open menu' }).click();
    await page
      .getByRole('navigation', { name: 'Primary mobile' })
      .getByRole('link', { name: 'Sanitizer' })
      .click();
    await typePrompt(page, 'email jane@x.example');
    await runScan(page);
    const finding = page.locator('li').filter({ hasText: 'email' }).first();
    await finding.getByRole('button', { name: 'Choose action' }).click();
    await page.getByRole('menuitem', { name: /Mask as \[EMAIL_REDACTED\]/ }).click();
    const diff = page.locator('section').filter({ hasText: 'Before / after' });
    await expect(diff.locator('del').locator('visible=true').first()).toBeVisible();
  });
});
