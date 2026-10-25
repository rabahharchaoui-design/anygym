import { describe, expect, it } from 'vitest';
import type { Session } from '../../../db/types';
import { importNumbers } from '../historyWords';

const imported = (id: string, seq: number, exerciseId: string): Session => ({ id, gymId: 'g', startedAt: seq, importSeq: seq, imported: true, exerciseIds: [exerciseId] });

describe('importNumbers', () => {
  it('numbers imported workouts of the same exercise in file order, only groups of two or more', () => {
    const list: Session[] = [
      imported('b', 2, 'barbell-back-squat'),
      imported('a', 1, 'barbell-back-squat'),
      imported('c', 3, 'deadlift'),
      { id: 'live', gymId: 'g', startedAt: Date.UTC(2026, 9, 1), endedAt: Date.UTC(2026, 9, 1, 1), imported: false },
    ];
    const n = importNumbers(list);
    expect(n.get('a')).toEqual({ n: 1, of: 2 });
    expect(n.get('b')).toEqual({ n: 2, of: 2 });
    expect(n.has('c')).toBe(false);
    expect(n.has('live')).toBe(false);
  });
});
