// `pnpm perf` (P2-S3-T7): the chart performance budgets, separate from `pnpm e2e` so the PR suite
// stays fast. CI runs it in the e2e workflow on pushes to phase-* only. One worker: frame times
// measured in parallel would compete for the CPU.
import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: '.',
  testMatch: '*.spec.ts',
  globalSetup: './global-setup.ts',
  workers: 1,
  fullyParallel: false,
  retries: 0,
  timeout: 120_000,
  reporter: process.env.CI
    ? [['list'], ['html', { open: 'never', outputFolder: '../../playwright-report/perf' }]]
    : 'list',
  use: { trace: 'off' },
  projects: [
    {
      name: 'desktop',
      use: { ...devices['Desktop Chrome'], viewport: { width: 1440, height: 900 } },
    },
    { name: 'mobile', use: { ...devices['Pixel 7'] } },
  ],
});
