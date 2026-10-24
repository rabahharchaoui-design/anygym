import { defineConfig, devices } from '@playwright/test';

// PW_PORT, PW_NO_BUILD and PW_DIST (a copied dist folder) let several runs share one build on their own ports.
const PORT = Number(process.env.PW_PORT ?? 4173);

// Add a profile with one line, e.g. ['iPhone SE', devices['iPhone SE']].
const PROFILES: Array<[string, (typeof devices)[string]]> = [
  // SPEC 13.4: iPhone SE is the 375 x 667 home button phone (Playwright's plain 'iPhone SE' is the 320 x 568 first gen).
  ['iPhone SE', devices['iPhone SE (3rd gen)']],
  ['iPhone 15 Pro', devices['iPhone 15 Pro']],
  ['iPhone 17 Pro Max', devices['iPhone 17 Pro Max']],
];

export default defineConfig({
  testDir: 'tests',
  // The live site check runs only via `npm run test:live`.
  testIgnore: 'live_check.spec.ts',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? 'github' : 'list',
  use: {
    baseURL: `http://localhost:${PORT}/anygym/`,
    trace: 'retain-on-failure',
  },
  projects: PROFILES.map(([name, device]) => ({
    name,
    use: { ...device, browserName: 'webkit' as const },
  })),
  webServer: {
    command: `${process.env.PW_NO_BUILD ? '' : 'npm run build && '}npx vite preview --port ${PORT} --strictPort${process.env.PW_DIST ? ` --outDir ${process.env.PW_DIST}` : ''}`,
    url: `http://localhost:${PORT}/anygym/`,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});
