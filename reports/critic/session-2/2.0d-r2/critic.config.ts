import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: '.',
  testMatch: 'critic-r2.spec.ts',
  workers: 3,
  timeout: 240_000,
  reporter: 'list',
  outputDir: '/tmp/anygym-critic-r2-results',
  use: { baseURL: 'http://localhost:4173/anygym/' },
  projects: [
    { name: 'iPhone 15', use: { ...devices['iPhone 15'], browserName: 'webkit' } },
    { name: 'iPhone SE', use: { ...devices['iPhone SE (3rd gen)'], browserName: 'webkit' } },
    { name: '320', use: { ...devices['iPhone SE'], browserName: 'webkit' } },
  ],
  webServer: {
    command: 'npx vite preview --port 4173 --strictPort',
    cwd: '/Users/rabah/projects/anygym',
    url: 'http://localhost:4173/anygym/',
    reuseExistingServer: false,
    timeout: 120_000,
  },
});
