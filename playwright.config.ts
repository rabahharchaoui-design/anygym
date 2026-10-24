import { defineConfig, devices } from '@playwright/test';

const PORT = 4173;

// Add a profile with one line, e.g. ['iPhone SE', devices['iPhone SE']].
const PROFILES: Array<[string, (typeof devices)[string]]> = [
  ['iPhone 15 Pro', devices['iPhone 15 Pro']],
];

export default defineConfig({
  testDir: 'tests',
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
    command: `npm run build && npx vite preview --port ${PORT} --strictPort`,
    url: `http://localhost:${PORT}/anygym/`,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});
