import { defineConfig, devices } from '@playwright/test';

/**
 * E2E tests run against the production build served by `vite preview`.
 * Chromium is the required minimum engine; additional engines are enabled
 * locally where installed.
 */
export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: process.env.CI ? [['html', { open: 'never' }], ['list']] : 'list',
  use: {
    baseURL: 'http://localhost:4173/PromptShield/',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [
    {
      name: 'chromium-desktop',
      use: { ...devices['Desktop Chrome'], channel: 'chrome' },
    },
    {
      name: 'chromium-mobile',
      use: { ...devices['iPhone 13'], channel: 'chrome' },
    },
  ],
  webServer: {
    command: 'pnpm preview --port 4173 --strictPort',
    url: 'http://localhost:4173/PromptShield/',
    reuseExistingServer: !process.env.CI,
    timeout: 30_000,
  },
});
