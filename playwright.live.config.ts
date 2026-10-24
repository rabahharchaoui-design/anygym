import { defineConfig, devices } from '@playwright/test';

// Checks the deployed site. Not part of `npx playwright test`; run with `npm run test:live`.
export const LIVE_URL = 'https://rabahharchaoui-design.github.io/anygym/';

export default defineConfig({
  testDir: 'tests',
  testMatch: 'live_check.spec.ts',
  retries: 1,
  reporter: process.env.CI ? 'github' : 'list',
  use: {
    baseURL: LIVE_URL,
    trace: 'retain-on-failure',
  },
  projects: [
    {
      name: 'iPhone 15 Pro',
      use: { ...devices['iPhone 15 Pro'], browserName: 'webkit' as const },
    },
  ],
});
