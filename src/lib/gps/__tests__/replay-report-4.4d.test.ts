// PLAN 4.4d (1): writes the replay table for reports/run-lag-4.4d.md. Runs only with
// REPLAY_REPORT=<file> (REPLAY_SEEDS=1,2,3 to choose the seeds); the pass rules live in replay-4.4d.test.ts.
import { writeFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { measure } from '../../../../tests/fixtures/gps/replay';
import { markdownTable, worstBySpec } from '../../../../tests/fixtures/gps/table';
import { makeTrace, matrix } from '../../../../tests/fixtures/gps/traces';

const OUT = process.env.REPLAY_REPORT;

describe('4.4d replay report', () => {
  it.skipIf(!OUT)('writes the table', () => {
    const seeds = (process.env.REPLAY_SEEDS ?? '1,2,3').split(',').map(Number);
    const rows = matrix(seeds).map((spec) => ({ spec, m: measure(makeTrace(spec)) }));
    writeFileSync(OUT!, markdownTable(worstBySpec(rows)) + '\n');
    writeFileSync(OUT! + '.json', JSON.stringify(rows.map((r) => r.m)));
    expect(rows.length).toBe(120 * seeds.length);
  }, 120_000);
});
