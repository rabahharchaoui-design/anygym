// Regenerates the three generated curated plans (SPEC 7.5 items 3 to 5, PLAN 3.5) into data/plans/.
// Run: node scripts/freeze-plans.mts. Vite loads the app's TypeScript and JSON as the app does; a
// Vitest (generator-frozen-3.5) fails when a committed file differs from this output.
import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';

const root = fileURLToPath(new URL('..', import.meta.url));
const server = await createServer({ root, configFile: false, logLevel: 'error', server: { middlewareMode: true, hmr: false, ws: false }, appType: 'custom', optimizeDeps: { noDiscovery: true } });
try {
  const mod = await server.ssrLoadModule('/src/data/frozenPlans.ts');
  for (const p of mod.FROZEN_PLANS) {
    writeFileSync(new URL(`../data/plans/${p.file}`, import.meta.url), mod.frozenPlanText(p));
    console.log(`data/plans/${p.file}`);
  }
} finally {
  await server.close();
}
