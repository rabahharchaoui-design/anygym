import { describe, expect, it } from 'vitest';
import { barbellLoad, bodyweightLoad, dumbbellLoad, stackLoad, timedLoad } from '../load';
import { cellWords, formatSession, formatSet, formatTarget } from '../setWords';

// Session 2 gate B1: one wording for sets everywhere, weight first.
const b185 = barbellLoad(45, [45, 25], 'none', 'lb')!;

describe('setWords', () => {
  it('one set: weight first', () => {
    expect(formatSet({ reps: 6, load: b185 })).toBe('185 lb × 6');
    expect(formatSet({ reps: 12, load: dumbbellLoad(30, 'lb') })).toBe('30 lb each × 12');
    expect(formatSet({ reps: 8, load: bodyweightLoad('lb', 25) })).toBe('+25 lb × 8');
    expect(formatSet({ reps: 12, load: bodyweightLoad('lb') })).toBe('12 reps');
    expect(formatSet({ reps: 1, load: bodyweightLoad('lb') })).toBe('1 rep');
    expect(formatSet({ seconds: 45, load: timedLoad('lb') })).toBe('45 s');
    expect(formatSet({ reps: 10, load: stackLoad(100, 'kg') })).toBe('100 kg × 10');
  });
  it('a session: "4 sets × 5 at 185 lb", reps only when the weight is the same', () => {
    expect(formatSession([5, 5, 5, 5].map((reps) => ({ reps, load: b185 })))).toBe('4 sets × 5 at 185 lb');
    expect(formatSession([12, 12, 12].map((reps) => ({ reps, load: dumbbellLoad(30, 'lb') })))).toBe('3 sets × 12 at 30 lb each');
    expect(formatSession([12, 12].map((reps) => ({ reps, load: bodyweightLoad('lb') })))).toBe('2 sets × 12 reps');
    expect(formatSession([45, 45].map((seconds) => ({ seconds, load: timedLoad('lb') })))).toBe('2 sets × 45 s');
    expect(formatSession([12, 12, 10].map((reps) => ({ reps, load: b185 })))).toBe('185 lb × 12, 12, 10');
    expect(formatSession([{ reps: 8, load: b185 }, { reps: 6, load: barbellLoad(45, [45, 30], 'none', 'lb')! }])).toBe('185 lb × 8 · 195 lb × 6');
    expect(formatSession([{ reps: 8, load: b185 }])).toBe('185 lb × 8');
    expect(formatSession([])).toBe('');
  });
  it('a target and a table cell', () => {
    expect(formatTarget(b185, [8, 12])).toBe('185 lb × 8 to 12');
    expect(formatTarget(b185, null)).toBeNull();
    expect(cellWords({ reps: 12, load: b185 }, 185)).toBe('185 × 12');
    expect(cellWords({ reps: 12, load: b185 }, 185, 'kg')).toBe('185 lb × 12');
  });
});
