import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['src/**/*.test.ts', 'src/**/*.test.tsx', 'workers/*/src/**/*.test.ts'],
    exclude: ['**/node_modules/**'],
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
        'src/lib/timer.ts': { lines: 100, branches: 100 },
        'src/lib/equipmentPrompt.ts': { lines: 100, branches: 100 },
        'src/db/equipment.ts': { lines: 100, branches: 100 },
        'src/db/workouts.ts': { lines: 100 },
        'src/db/tombstones.ts': { lines: 100 },
        'src/db/exerciseSettings.ts': { lines: 100 },
        'src/lib/rest.ts': { lines: 100 },
        'src/lib/undoQueue.ts': { lines: 100, branches: 100 },
        'src/lib/deleteUndo.ts': { lines: 100, branches: 100 },
        'src/lib/pwaUpdate.ts': { lines: 100, branches: 100 },
        'src/lib/loadTypeRule.ts': { lines: 100, branches: 100 },
        // SPEC 6: every progression rule is tested.
        'src/lib/progression.ts': { lines: 100 },
        'src/db/history.ts': { lines: 100 },
        // PLAN 1.10: curated plans, plan day workouts and the plan pointer.
        'src/lib/plans.ts': { lines: 100 },
        'src/lib/planWorkout.ts': { lines: 100 },
        'src/db/planState.ts': { lines: 100 },
      },
    },
  },
});
