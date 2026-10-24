// Builds data/plan-exercises.json from data/plans/*.json (PLAN 1.7, temporary exercise list until
// the catalog lands in Session 2). Run: npm run plan-exercises (Node 22.6+ runs TypeScript).
// A Vitest checks the committed JSON matches this output, so it never goes stale.
import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { buildPlanExercises } from '../src/lib/loadTypeRule.ts';

const plansDir = new URL('../data/plans/', import.meta.url);
const plans = readdirSync(plansDir)
  .filter((f) => f.endsWith('.json'))
  .sort()
  .map((f) => JSON.parse(readFileSync(new URL(f, plansDir), 'utf8')));

const list = buildPlanExercises(plans);
writeFileSync(new URL('../data/plan-exercises.json', import.meta.url), JSON.stringify(list, null, 1) + '\n');
console.log(`plan-exercises.json: ${list.length} exercises`);
