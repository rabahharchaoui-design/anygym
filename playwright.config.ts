import { defineConfig, devices, type Project } from '@playwright/test';

// PW_PORT, PW_NO_BUILD and PW_DIST (a copied dist folder) let several runs share one build on their own ports.
const PORT = Number(process.env.PW_PORT ?? 4173);

// SPEC 13.3 / 13.4 device matrix. WebKit for iPhones, Chromium for Android.
// The three iPhone projects run every spec. The Android projects and the 320 floor run the
// curated "matrix" subset: tests with @matrix in their title (logging, picker, sheets, History,
// plan flows, edge cases, double taps, and the layout checks of every main screen).
type Device = (typeof devices)[string];
const IPHONES: Array<[string, Device]> = [
  // SPEC 13.4: iPhone SE is the 375 x 667 home button phone (Playwright's plain 'iPhone SE' is the 320 x 568 first gen).
  ['iPhone SE', devices['iPhone SE (3rd gen)']],
  ['iPhone 15', devices['iPhone 15'] ?? devices['iPhone 15 Pro']],
  ['iPhone 17 Pro Max', devices['iPhone 17 Pro Max']],
];
const galaxy = devices['Galaxy S24']; // 360 x 780, Chromium, mobile, touch
const MATRIX: Array<[string, NonNullable<Project['use']>]> = [
  ['Pixel 7', { ...devices['Pixel 7'], browserName: 'chromium' }], // 412 wide (915 screen)
  ['Galaxy compact', { ...galaxy, viewport: { width: 360, height: 780 }, screen: { width: 360, height: 780 }, browserName: 'chromium' }],
  ['Small Android', { ...galaxy, viewport: { width: 360, height: 640 }, screen: { width: 360, height: 640 }, browserName: 'chromium' }],
  // The smallest supported width (foldable cover screens), WebKit.
  ['320 floor', { ...devices['iPhone SE'], browserName: 'webkit' }],
];

export default defineConfig({
  testDir: 'tests',
  // The live site check runs only via `npm run test:live`.
  testIgnore: 'live_check.spec.ts',
  fullyParallel: true,
  // Most of a UI test is waiting on springs and IndexedDB, so more workers than half the cores
  // keeps the whole matrix (with the 90 s monkey tests) well under 15 minutes on a laptop.
  workers: process.env.CI ? undefined : '75%',
  // Under that load an IndexedDB write or a spring can take longer than the 5 s default.
  expect: { timeout: 10_000 },
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? 'github' : 'list',
  use: {
    baseURL: `http://localhost:${PORT}/anygym/`,
    trace: 'retain-on-failure',
  },
  projects: [
    ...IPHONES.map(([name, device]) => ({ name, use: { ...device, browserName: 'webkit' as const } })),
    // PW_FULL_MATRIX=1: every spec on all seven phones (SPEC 13.3). By default the Android
    // projects and the 320 floor run the @matrix subset, for fast per item checkpoints.
    ...MATRIX.map(([name, device]) => ({ name, ...(process.env.PW_FULL_MATRIX ? {} : { grep: /@matrix/ }), use: device })),
  ],
  webServer: {
    command: `${process.env.PW_NO_BUILD ? '' : 'npm run build && '}npx vite preview --port ${PORT} --strictPort${process.env.PW_DIST ? ` --outDir ${process.env.PW_DIST}` : ''}`,
    url: `http://localhost:${PORT}/anygym/`,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});
