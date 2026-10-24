import { describe, expect, it } from 'vitest';
import plan from '../../../data/plans/five-day-split.json';
import before from './fixtures/five-day-split-days.json';

// PLAN 1.10f renamed the plan and dropped its author line. The workout itself must not move: the
// fixture is the days array exactly as it was before the rename (taken from git HEAD then).
describe('Classic 5 Day Split: rename kept every day byte for byte', () => {
  it('has the new id and name, no author, and a neutral source', () => {
    expect(plan.id).toBe('five-day-split');
    expect(plan.name).toBe('Classic 5 Day Split');
    expect('author' in plan).toBe(false);
    expect(plan.source).toBe('Curated 5 day bodybuilding split');
  });

  it('every exercise, set, rep, rest, note, pair and finisher is unchanged', () => {
    expect(JSON.stringify(plan.days, null, 1)).toBe(JSON.stringify(before, null, 1));
  });
});
