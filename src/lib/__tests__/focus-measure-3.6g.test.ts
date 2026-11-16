// PLAN 3.6g: prints the depth table (by served picks and by minutes) for the session report.
import { expect, it, vi as viTimeout } from 'vitest';
import { printTable, table } from './focusMeasure36g';
// A heavy test file (about 400 plans built); an explicit limit sized for the GitHub runner, never a retry.
// PLAN 3.6p: the build is fast again; about four times the slowest test here on a laptop under load, never under 30 s.
viTimeout.setConfig({ testTimeout: 40_000 });

it('prints the 3.6g depth table (seeded intakes, full gym, 45 minutes and up, 3 to 6 days)', () => {
  const rows = table();
  console.log(printTable(rows));
  expect(rows.length).toBe(19);
});
