import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: 'e2e',
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [['html', { open: 'never' }], ['list']] : 'list',
  use: {
    baseURL: 'http://localhost:4321',
    trace: 'on-first-retry',
  },
  projects: [
    {
      name: 'desktop',
      use: { ...devices['Desktop Chrome'], viewport: { width: 1440, height: 900 } },
    },
    { name: 'mobile', use: { ...devices['Pixel 7'] } },
  ],
  webServer: {
    // --ignore-lock keeps `astro preview` in the foreground (Astro 7 backgrounds it when an AI
    // agent runs it), so Playwright owns the server and stops it afterwards.
    command: 'pnpm build && pnpm preview --port 4321 --ignore-lock',
    url: 'http://localhost:4321',
    reuseExistingServer: !process.env.CI,
    timeout: 180_000,
  },
});
