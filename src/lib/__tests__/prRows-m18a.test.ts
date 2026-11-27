// PLAN M18a: the PR rows of a finished workout, one per lift, from the existing record rule's output.
import { describe, expect, it } from 'vitest';
import { prRows } from '../prRows';
import type { SetRecord } from '../records';

const rec = (setId: string, gainOverHistory: number): SetRecord => ({ setId, kind: 'most_reps', gain: gainOverHistory, gainOverHistory, text: setId, beat: { text: 'x' }, setText: setId });

describe('prRows', () => {
  it('one row per lift: the record that beat its history by the most; lifts without one have no row', () => {
    const rows = prRows([
      { exerciseId: 'a', name: 'A', records: [rec('a1', 0.1), rec('a2', 0.3), rec('a3', 0.2)] },
      { exerciseId: 'b', name: 'B', records: [] },
      { exerciseId: 'c', name: 'C', records: [rec('c1', Number.POSITIVE_INFINITY), rec('c2', 0.5)] },
    ]);
    expect(rows.map((r) => [r.exerciseId, r.record.setId])).toEqual([['a', 'a2'], ['c', 'c1']]);
  });
  it('a record that did not beat history (gain 0) is not a PR row; ties keep the first', () => {
    expect(prRows([{ exerciseId: 'a', name: 'A', records: [rec('a1', 0)] }])).toEqual([]);
    expect(prRows([{ exerciseId: 'a', name: 'A', records: [rec('a1', 0.2), rec('a2', 0.2)] }])[0]!.record.setId).toBe('a1');
  });
});
