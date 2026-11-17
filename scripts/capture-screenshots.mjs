#!/usr/bin/env node
/**
 * Capture genuine screenshots of the running PromptShield app with synthetic
 * data. Every screenshot is a real Playwright capture of the production build;
 * no mockups. Output: docs/screenshots/*.png (checked into the repository).
 *
 * Prerequisites: pnpm build && pnpm preview (port 4173), Chrome installed.
 */
import { chromium } from '@playwright/test';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';

const BASE_URL = process.env.SHOT_BASE_URL ?? 'http://localhost:4173/PromptShield/';
const OUT_DIR = join(new URL('..', import.meta.url).pathname, 'docs', 'screenshots');
mkdirSync(OUT_DIR, { recursive: true });

const VIEWPORT = { width: 1440, height: 900 };

async function newPage(browser, { theme = 'light', mobile = false } = {}) {
  const context = await browser.newContext({
    viewport: mobile ? { width: 390, height: 844 } : VIEWPORT,
    deviceScaleFactor: 2,
    colorScheme: theme === 'dark' ? 'dark' : 'light',
  });
  const page = await context.newPage();
  // Seed non-sensitive preferences deterministically (never prompt data).
  await page.addInitScript(
    (seed) => {
      window.localStorage.setItem('promptshield.settings.v1', JSON.stringify(seed));
    },
    {
      version: 1,
      theme,
      reducedMotion: false,
      maxInputLength: 50000,
      localeHint: 'US',
      presetId: 'general',
      sensitivity: 'medium',
      categories: {
        contact: true,
        personal: true,
        financial: true,
        secrets: true,
        internal: true,
        'prompt-risk': true,
        custom: true,
      },
    },
  );
  await page.goto(BASE_URL);
  await page.waitForLoadState('domcontentloaded');
  return { context, page };
}

async function loadSample(page, name) {
  await page.getByRole('button', { name: 'Samples' }).click();
  await page.getByRole('menuitem', { name: new RegExp(name) }).click();
  await page.waitForTimeout(400);
}

async function scan(page) {
  await page.getByRole('button', { name: 'Scan prompt' }).click();
  await page.getByText('Scan complete — results below are suggestions only.').waitFor({
    timeout: 20000,
  });
}

async function main() {
  const executablePath = process.env.SHOT_CHROME_PATH ?? undefined;
  const browser = await chromium.launch({ channel: 'chrome', executablePath });

  const shots = [];

  // 01 — landing workspace (empty state, light)
  {
    const { context, page } = await newPage(browser, { theme: 'light' });
    await page.waitForTimeout(400);
    shots.push(['01-landing-workspace.png', page]);
    await page.screenshot({ path: join(OUT_DIR, '01-landing-workspace.png') });
    await context.close();
  }

  // 02 — sample prompt loaded
  {
    const { context, page } = await newPage(browser, { theme: 'light' });
    await loadSample(page, 'Developer bug report');
    await page.waitForTimeout(300);
    await page.screenshot({ path: join(OUT_DIR, '02-sample-prompt-loaded.png') });
    shots.push(['02-sample-prompt-loaded.png', page]);
    await context.close();
  }

  // 03 — detection findings
  {
    const { context, page } = await newPage(browser, { theme: 'light' });
    await loadSample(page, 'Developer bug report');
    await scan(page);
    await page.waitForTimeout(300);
    await page.screenshot({ path: join(OUT_DIR, '03-detection-findings.png') });
    shots.push(['03-detection-findings.png', page]);
    await context.close();
  }

  // 04 — redaction action menu open (redaction preview)
  {
    const { context, page } = await newPage(browser, { theme: 'light' });
    await loadSample(page, 'Developer bug report');
    await scan(page);
    const awsFinding = page.locator('li').filter({ hasText: 'aws-access-key' }).first();
    await awsFinding.getByRole('button', { name: 'Choose action' }).click();
    await page.getByRole('menuitem', { name: /Mask as \[API_KEY_REDACTED\]/ }).waitFor();
    await page.waitForTimeout(200);
    await page.screenshot({ path: join(OUT_DIR, '04-redaction-preview.png') });
    await page.keyboard.press('Escape');
    shots.push(['04-redaction-preview.png', page]);
    await context.close();
  }

  // 05 — sanitized output + diff (mixed actions applied)
  {
    const { context, page } = await newPage(browser, { theme: 'light' });
    await loadSample(page, 'Developer bug report');
    await scan(page);
    // Mask the AWS key, remove the JWT span, redact the email.
    const awsFinding = page.locator('li').filter({ hasText: 'aws-access-key' }).first();
    await awsFinding.getByRole('button', { name: 'Choose action' }).click();
    await page.getByRole('menuitem', { name: /Mask as \[API_KEY_REDACTED\]/ }).click();
    await page.waitForTimeout(200);
    const jwtFinding = page.locator('li').filter({ hasText: 'jwt' }).first();
    await jwtFinding.getByRole('button', { name: 'Choose action' }).click();
    await page.getByRole('menuitem', { name: /Mask as \[TOKEN_REDACTED\]/ }).click();
    await page.waitForTimeout(200);
    const emailFinding = page.locator('li').filter({ hasText: '· email' }).first();
    await emailFinding.getByRole('button', { name: 'Choose action' }).click();
    await page.getByRole('menuitem', { name: /Mask as \[EMAIL_REDACTED\]/ }).click();
    await page.waitForTimeout(300);
    await page.screenshot({ path: join(OUT_DIR, '05-sanitized-output-diff.png') });
    shots.push(['05-sanitized-output-diff.png', page]);
    await context.close();
  }

  // 06 — pseudonymization with reversible map indicator
  {
    const { context, page } = await newPage(browser, { theme: 'light' });
    await page.evaluate(() => {
      const editor = document.getElementById('prompt-editor');
      return editor === null ? null : editor;
    });
    await typePrompt(
      page,
      'Ms Sofia Reyes wrote twice. Then Ms Sofia Reyes replied. Contact sofia.reyes@northwind-travelers.example.',
    );
    await scan(page);
    const findings = page.locator('li').filter({ hasText: 'person-name-honorific' });
    await findings.first().getByRole('button', { name: 'Choose action' }).click();
    await page.getByRole('menuitem', { name: /Pseudonymize/ }).click();
    await page.waitForTimeout(200);
    await findings.nth(1).getByRole('button', { name: 'Choose action' }).click();
    await page.getByRole('menuitem', { name: /Pseudonymize/ }).click();
    await page.waitForTimeout(300);
    await page.screenshot({ path: join(OUT_DIR, '06-pseudonymization.png') });
    shots.push(['06-pseudonymization.png', page]);
    await context.close();
  }

  // 07 — custom rules view with a saved rule
  {
    const { context, page } = await newPage(browser, { theme: 'light' });
    await page.evaluate(() => {
      window.location.hash = '/rules';
    });
    await page.waitForTimeout(400);
    // Seed a rule via localStorage before load for a deterministic view.
    await page.evaluate(() => {
      const now = new Date().toISOString();
      window.localStorage.setItem(
        'promptshield.rules.v1',
        JSON.stringify({
          version: 1,
          rules: [
            {
              id: 'shot-rule-1',
              name: 'Project Saffron',
              description: 'Internal codename for the billing migration',
              enabled: true,
              category: 'custom',
              severity: 'high',
              confidence: 'high',
              matchType: 'literal',
              pattern: 'Project Saffron',
              flags: 'u',
              replacement: '[PROJECT_1]',
              contextKeywords: [],
              tests: [{ text: 'Kickoff for Project Saffron Monday.', shouldMatch: true }],
              createdAt: now,
              updatedAt: now,
            },
          ],
        }),
      );
    });
    await page.reload();
    await page.waitForLoadState('domcontentloaded');
    await page.waitForTimeout(400);
    await page.evaluate(() => {
      window.location.hash = '/rules';
    });
    await page.waitForTimeout(400);
    await page.screenshot({ path: join(OUT_DIR, '07-custom-rules.png') });
    shots.push(['07-custom-rules.png', page]);
    await context.close();
  }

  // 08 — detection settings (presets + categories)
  {
    const { context, page } = await newPage(browser, { theme: 'light' });
    await page.evaluate(() => {
      window.location.hash = '/settings';
    });
    await page.waitForTimeout(400);
    await page.screenshot({ path: join(OUT_DIR, '08-detection-settings.png') });
    shots.push(['08-detection-settings.png', page]);
    await context.close();
  }

  // 09 — privacy center
  {
    const { context, page } = await newPage(browser, { theme: 'light' });
    await page.evaluate(() => {
      window.location.hash = '/privacy';
    });
    await page.waitForTimeout(400);
    await page.screenshot({ path: join(OUT_DIR, '09-privacy-center.png') });
    shots.push(['09-privacy-center.png', page]);
    await context.close();
  }

  // 10 — mobile workspace with findings
  {
    const { context, page } = await newPage(browser, { theme: 'light', mobile: true });
    await loadSample(page, 'Developer bug report');
    await scan(page);
    await page.waitForTimeout(300);
    await page.screenshot({ path: join(OUT_DIR, '10-mobile-workspace.png') });
    shots.push(['10-mobile-workspace.png', page]);
    await context.close();
  }

  // 11 — light theme (post-scan workspace state)
  {
    const { context, page } = await newPage(browser, { theme: 'light' });
    await loadSample(page, 'Confidential project brief');
    await scan(page);
    await page.waitForTimeout(300);
    await page.screenshot({ path: join(OUT_DIR, '11-light-theme.png') });
    shots.push(['11-light-theme.png', page]);
    await context.close();
  }

  // 12 — dark theme (same state)
  {
    const { context, page } = await newPage(browser, { theme: 'dark' });
    await loadSample(page, 'Confidential project brief');
    await scan(page);
    await page.waitForTimeout(300);
    await page.screenshot({ path: join(OUT_DIR, '12-dark-theme.png') });
    shots.push(['12-dark-theme.png', page]);
    await context.close();
  }

  await browser.close();
  console.log(`Captured ${shots.length} screenshots to ${OUT_DIR}`);
}

async function typePrompt(page, text) {
  await page.getByLabel('Prompt text to inspect').fill(text);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
