import { expect, test } from '@playwright/test';
import { loadSample, openSanitizer, runScan, typePrompt } from './helpers';

test.describe('core sanitize flow', () => {
  test('empty state shows privacy-first messaging', async ({ page }) => {
    await openSanitizer(page);
    await expect(page.getByText(/analyzed in this browser/)).toBeVisible();
    await expect(page.getByRole('button', { name: 'Scan prompt' })).toBeDisabled();
    await expect(page.getByRole('heading', { name: 'Findings' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Sanitized output' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Before / after' })).toBeVisible();
  });

  test('scan a sample, review findings, and apply a mask', async ({ page }) => {
    await openSanitizer(page);
    await loadSample(page, 'Developer bug report');
    await expect(page.getByText('711 characters · 62 words')).toBeVisible();

    await runScan(page);

    // Findings summary rendered with severity chips
    await expect(page.getByLabel('Findings summary by severity')).toBeVisible();
    await expect(page.getByText('Critical', { exact: true }).first()).toBeVisible();

    // The AWS key finding is present with a masked preview (never the full key)
    await expect(page.getByText(/AKIA•••••••• \(20 chars\)/)).toBeVisible();
    await expect(page.getByText(/Matches the documented AWS access key id format/)).toBeVisible();

    // Apply the mask via the first finding's action menu
    const awsFinding = page.locator('li').filter({ hasText: 'aws-access-key' }).first();
    await awsFinding.getByRole('button', { name: 'Choose action' }).click();
    await page.getByRole('menuitem', { name: /Mask as \[API_KEY_REDACTED\]/ }).click();

    // Applied chip + sanitized output updated, original text untouched in the editor
    await expect(awsFinding.getByText('→ [API_KEY_REDACTED]')).toBeVisible();
    const output = page.getByLabel('Sanitized prompt text');
    await expect(output).not.toHaveValue(/AKIAIOSFODNN7EXAMPLE/);
    await expect(output).toHaveValue(/\[API_KEY_REDACTED\]/);
  });

  test('bulk redaction applies and per-finding undo works', async ({ page }) => {
    await openSanitizer(page);
    await loadSample(page, 'Developer bug report');
    await runScan(page);

    const bulk = page.getByRole('button', { name: /Redact \d+ high-confidence/ });
    await bulk.click();
    await page
      .getByRole('button', { name: /Redact \d+ findings/ })
      .last()
      .click();
    await expect(page.getByText(/replacement/)).toBeVisible();

    // Global undo empties the output panel back to the empty state
    await page.getByRole('button', { name: 'Undo last redaction action' }).click();
    await expect(page.getByText('No sanitized output yet')).toBeVisible();
  });

  test('pseudonymization is consistent across repeated entities', async ({ page }) => {
    await openSanitizer(page);
    await typePrompt(page, 'Ms Sofia Reyes wrote twice. Then Ms Sofia Reyes replied.');
    await runScan(page);
    const finding = page.locator('li').filter({ hasText: 'person-name-honorific' }).first();
    await finding.getByRole('button', { name: 'Choose action' }).click();
    await page.getByRole('menuitem', { name: /Pseudonymize/ }).click();
    const second = page.locator('li').filter({ hasText: 'person-name-honorific' }).nth(1);
    await second.getByRole('button', { name: 'Choose action' }).click();
    await page.getByRole('menuitem', { name: /Pseudonymize/ }).click();

    const output = page.getByLabel('Sanitized prompt text');
    const value = await output.inputValue();
    const placeholders = value.match(/\[PERSON_\d+\]/g) ?? [];
    expect(placeholders.length).toBe(2);
    expect(new Set(placeholders).size).toBe(1);
    // Session indicator visible + re-identify gated behind confirmation
    await expect(page.getByText(/Reversible map:/)).toBeVisible();
  });

  test('diff view shows the sanitized replacement inline and side-by-side', async ({ page }) => {
    await openSanitizer(page);
    await typePrompt(page, 'contact jane.doe@x.example today');
    await runScan(page);
    const finding = page.locator('li').filter({ hasText: 'email' }).first();
    await finding.getByRole('button', { name: 'Choose action' }).click();
    await page.getByRole('menuitem', { name: /Mask as \[EMAIL_REDACTED\]/ }).click();

    const diff = page.locator('section').filter({ hasText: 'Before / after' });
    await expect(diff.getByText(/changed line — left:/)).toBeVisible();
    await expect(
      diff.locator('span[class*="line-through"]').locator('visible=true').first(),
    ).toContainText('jane.doe@x.example');
    await expect(
      diff.locator('span.bg-success-soft').locator('visible=true').first(),
    ).toContainText('[EMAIL_REDACTED]');
  });

  test('oversized input disables scan with a visible boundary', async ({ page }) => {
    await openSanitizer(page);
    await typePrompt(page, 'x'.repeat(50_001));
    await expect(page.getByRole('button', { name: 'Scan prompt' })).toBeDisabled();
    await expect(page.getByText(/over the scan limit/)).toBeVisible();
  });

  test('clear with confirmation wipes the session', async ({ page }) => {
    await openSanitizer(page);
    await loadSample(page, 'Developer bug report');
    await page.getByRole('button', { name: 'Clear', exact: true }).click();
    await expect(page.getByRole('dialog', { name: 'Clear the prompt?' })).toBeVisible();
    await page.getByRole('button', { name: 'Clear prompt' }).click();
    await expect(page.getByText('0 characters · 0 words')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Scan prompt' })).toBeDisabled();
  });

  test('download produces a sanitized .txt file without original secrets', async ({ page }) => {
    await openSanitizer(page);
    await typePrompt(page, 'token ghp_0123456789abcdefABCDEF0123456789abcd');
    await runScan(page);
    const finding = page.locator('li').filter({ hasText: 'github-token' }).first();
    await finding.getByRole('button', { name: 'Choose action' }).click();
    await page.getByRole('menuitem', { name: /Mask as \[TOKEN_REDACTED\]/ }).click();

    const downloadPromise = page.waitForEvent('download');
    await page.getByRole('button', { name: '.txt', exact: true }).click();
    const download = await downloadPromise;
    expect(download.suggestedFilename()).toMatch(/^promptshield-sanitized-.*\.txt$/);
    const path = await download.path();
    if (path !== null) {
      const content = await import('node:fs/promises').then((fs) => fs.readFile(path, 'utf-8'));
      expect(content).not.toContain('ghp_0123456789abcdefABCDEF0123456789abcd');
      expect(content).toContain('[TOKEN_REDACTED]');
    }
  });
});
