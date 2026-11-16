import { defineConfig } from 'vitest/config';

// PLAN 3.6p: the speed measurement and snapshot scripts (never part of `npm run test`).
export default defineConfig({ test: { include: ['scripts/perf/*.perf.ts'], environment: 'node', testTimeout: 900_000 } });
