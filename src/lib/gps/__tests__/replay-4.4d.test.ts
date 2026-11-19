// PLAN 4.4d (4): the replay matrix. Every combination of walk, jog and run; fixes every 1 s and
// every 5 s; accuracy 5, 15, 30 and 50 m; and the scenarios surge (a speed change), cold start (60 m
// for the first 90 s), tunnel (40 s without a fix), light (a 30 s stop) and still (a phone lying
// still for 5 minutes), over three seeds, through the live run exactly as the app feeds it
// (tests/fixtures/gps). The pass rules are PLAN 4.4d's, unchanged (fixtures/gps/rules.ts). A
// combination that cannot meet them is listed in fixtures/gps/expected.ts with its honest numbers
// and runs as an expected failure, so it shows here by name and the day it passes the test says so.
// These are simulated traces, not G's phone; his diagnostics export replays in diag-4.4d.test.ts.
import { describe, expect, it } from 'vitest';
import { EXPECTED_FAIL } from '../../../../tests/fixtures/gps/expected';
import { measure } from '../../../../tests/fixtures/gps/replay';
import { comboKey, priority, ruleFailures } from '../../../../tests/fixtures/gps/rules';
import { makeTrace, matrix, type TraceSpec } from '../../../../tests/fixtures/gps/traces';

const SEEDS = [1, 2, 3];

const combos = new Map<string, TraceSpec[]>();
for (const spec of matrix(SEEDS)) combos.set(comboKey(spec), [...(combos.get(comboKey(spec)) ?? []), spec]);

const failuresOf = (specs: TraceSpec[]) =>
  specs.flatMap((spec) => ruleFailures(spec, measure(makeTrace(spec))).map((f) => `seed ${spec.seed}: ${f.rule} ${f.value}`));

for (const group of [1, 2, 3] as const) {
  describe(`4.4d replay, priority group ${group}`, () => {
    for (const [key, specs] of combos) {
      if (priority(specs[0]!) !== group) continue;
      const expected = EXPECTED_FAIL[key];
      // Expected failure: the combination misses a pass rule; its reason and numbers are in the name.
      if (expected) it.fails(`${key} EXPECTED FAIL: ${expected}`, () => expect(failuresOf(specs)).toEqual([]));
      else it(`${key} meets every rule on seeds ${SEEDS.join(', ')}`, () => expect(failuresOf(specs)).toEqual([]));
    }
  });
}

describe('4.4d replay, the list is honest', () => {
  it('every expected failure names a combination of the matrix', () => {
    for (const key of Object.keys(EXPECTED_FAIL)) expect(combos.has(key)).toBe(true);
  });
});
