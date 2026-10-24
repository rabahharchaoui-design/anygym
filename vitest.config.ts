import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['src/**/*.test.ts', 'src/**/*.test.tsx'],
    environment: 'node',
    coverage: {
      provider: 'v8',
      include: ['src/lib/**/*.ts', 'src/db/**/*.ts'],
      exclude: ['src/**/__tests__/**'],
      reporter: [['text', { skipFull: false }]],
      thresholds: {
        // SPEC 5.4: weight math is fully unit tested.
        'src/lib/load.ts': { lines: 100 },
        'src/lib/plates.ts': { lines: 100 },
        'src/lib/plateLayout.ts': { lines: 100, branches: 100 },
        'src/lib/numpad.ts': { lines: 100, branches: 100 },
      },
    },
  },
});
