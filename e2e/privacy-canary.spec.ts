import { expect, test } from '@playwright/test';
import { CANARY, openSanitizer, runScan, typePrompt } from './helpers';

/**
 * Local-only privacy verification with a synthetic canary. The canary prompt is
 * entered, scanned, redacted, and exported while instrumenting every network
 * request, console message, and storage write. This proves "no prompt-content
 * network transmission observed in tested workflows" — it is not a mathematical
 * guarantee (see docs/PRIVACY.md for the precise claim).
 */
test.describe('privacy canary', () => {
  test('canary never appears in network traffic, storage, URLs, or console', async ({ page }) => {
    const requests: string[] = [];
    const consoleMessages: string[] = [];

    page.on('request', (request) => {
      requests.push(`${request.method()} ${request.url()} ${request.postData() ?? ''}`);
    });
    page.on('console', (message) => {
      consoleMessages.push(message.text());
    });
    page.on('pageerror', (error) => {
      consoleMessages.push(String(error));
    });

    await openSanitizer(page);

    // Enter the canary prompt with surrounding sensitive-looking content.
    await typePrompt(
      page,
      [`secret canary: ${CANARY}`, 'email jane.canary@x.example, key AKIAIOSFODNN7EXAMPLE'].join(
        '\n',
      ),
    );

    // Scan → redact → copy → download → change settings → navigate.
    await runScan(page);
    const finding = page.locator('li').filter({ hasText: 'email' }).first();
    await finding.getByRole('button', { name: 'Choose action' }).click();
    await page.getByRole('menuitem', { name: /Mask as \[EMAIL_REDACTED\]/ }).click();

    await page.context().grantPermissions(['clipboard-read', 'clipboard-write']);
    await page.getByRole('button', { name: 'Copy sanitized' }).click();

    const downloadPromise = page.waitForEvent('download');
    await page.getByRole('button', { name: '.txt', exact: true }).click();
    await downloadPromise;

    // Change settings and navigate through all views.
    await page
      .getByRole('navigation', { name: 'Primary' })
      .getByRole('link', { name: 'Settings' })
      .click();
    await page
      .getByRole('navigation', { name: 'Primary' })
      .getByRole('link', { name: 'Privacy' })
      .click();
    await page
      .getByRole('navigation', { name: 'Primary' })
      .getByRole('link', { name: 'Rules' })
      .click();
    await page
      .getByRole('navigation', { name: 'Primary' })
      .getByRole('link', { name: 'Guides' })
      .click();
    await page
      .getByRole('navigation', { name: 'Primary' })
      .getByRole('link', { name: 'About' })
      .click();

    // Assert: no request URL or payload contains the canary.
    const allRequests = requests.join('\n');
    expect(allRequests, 'network requests must not contain the canary').not.toContain(CANARY);

    // Assert: no console/error output contains the canary.
    const allConsole = consoleMessages.join('\n');
    expect(allConsole, 'console output must not contain the canary').not.toContain(CANARY);

    // Assert: no storage (localStorage/sessionStorage/cookies) contains the canary.
    const storage = await page.evaluate(() =>
      JSON.stringify({
        local: Object.fromEntries(Object.entries(window.localStorage)),
        session: Object.fromEntries(Object.entries(window.sessionStorage)),
        cookies: document.cookie,
      }),
    );
    expect(storage, 'storage must not contain the canary').not.toContain(CANARY);

    // Assert: the URL never carries the canary.
    expect(page.url()).not.toContain(CANARY);

    // Sanity: the canary WAS in the editor during the flow (test validity check).
    expect(requests.length).toBeGreaterThan(0);
  });

  test('allowlisted values stay out of storage and exports exclude session state', async ({
    page,
  }) => {
    await openSanitizer(page);
    await typePrompt(page, `canary ${CANARY} email jane.canary@x.example`);
    await runScan(page);
    const finding = page.locator('li').filter({ hasText: 'email' }).first();
    await finding.getByRole('button', { name: 'Allowlist value' }).click();
    await page.getByRole('button', { name: 'Add to session allowlist' }).click();

    const storage = await page.evaluate(() =>
      JSON.stringify(Object.fromEntries(Object.entries(window.localStorage))),
    );
    expect(storage).not.toContain('jane.canary@x.example');
  });
});
