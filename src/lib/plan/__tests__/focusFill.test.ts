// PLAN 3.6g, the fill on the pure module: a day still short of the minutes chosen is built up with
// work no pick asks for, and more is not better there either.
import { describe, expect, it } from 'vitest';
import { countHardSets, curateFocus, type FocusMove } from '../focus';
import type { FocusPickId } from '../../intake/options';

const PICK: Record<string, FocusPickId[]> = { biceps: ['biceps'] };
const move = (id: string, muscle: string, sets = 3, compound = false): FocusMove => ({ id, key: id, sets, compound, hard: true, muscles: [muscle], picks: PICK[muscle] ?? [] });
const mins = (d: FocusMove[]) => d.reduce((n, m) => n + m.sets * 2, 0);
const ids = (d: FocusMove[]) => d.map((m) => `${m.id}x${m.sets}`);

describe('the fill (PLAN 3.6g)', () => {
  // A rotation of four. Days 1 and 3 have six minutes free and do not sit next to each other; days 2 and 4 are full.
  const days = () => [
    [move('bench', 'chest', 3, true), move('curl', 'biceps')],
    [move('row', 'back', 3, true), move('pulldown', 'back'), move('shrug', 'back')],
    [move('press', 'chest', 3, true), move('curl2', 'biceps')],
    [move('chin', 'back', 3, true), move('pullover', 'back'), move('shrug2', 'back')],
  ];
  const small = () => [move('legcurl', 'hamstrings'), move('calf', 'calves')];
  it('never the same small move on every day: one the other days do not have yet comes first', () => {
    const out = curateFocus({ picks: ['biceps'], days: days(), candidates: days().map(small), cap: 3, budgetMinutes: 18, minutes: mins, fill: true });
    expect(ids(out.days[0]!)).toEqual(['benchx3', 'curlx3', 'legcurlx3']);
    expect(ids(out.days[2]!)).toEqual(['pressx3', 'curl2x3', 'calfx3']);
    for (const d of out.days) expect(mins(d)).toBeLessThanOrEqual(18);
  });
  it('never takes a muscle past 20 sets a week, by a new move or by one more set', () => {
    // Hamstrings stand at 19 on day 3 (not next to day 1): no leg curl joins day 1, whatever time is free.
    const at = (curl: number) => [
      [move('bench', 'chest', 10, true), move('curl', 'biceps', 10)],
      [move('dip', 'triceps', 10, true)],
      [move('rdl', 'hamstrings', 10, true), move('curl3', 'hamstrings', curl)],
      [move('pushdown', 'triceps', 10, true)],
    ];
    const candidates = [[move('legcurl', 'hamstrings')], [], [], []];
    const full = curateFocus({ picks: ['biceps'], days: at(9), candidates, cap: 10, budgetMinutes: 48, minutes: mins, fill: true });
    expect(ids(full.days[0]!)).toEqual(['benchx10', 'curlx10']);
    // (Day 3 has time too: its own leg curl takes the one set that is left to 20.)
    expect(countHardSets(full.days, 'hamstrings')).toBe(20);
    // At 17 there is room for exactly 3 more: the move joins with 3 sets, and stops at 20.
    const room = curateFocus({ picks: ['biceps'], days: at(7), candidates, cap: 10, budgetMinutes: 48, minutes: mins, fill: true });
    expect(ids(room.days[0]!)).toEqual(['benchx10', 'curlx10', 'legcurlx3']);
    expect(countHardSets(room.days, 'hamstrings')).toBe(20);
    // A move already in the day stops at 20 too.
    const grow = [[move('bench', 'chest', 10, true), move('curl', 'biceps', 10), move('legcurl', 'hamstrings', 2)], [move('dip', 'triceps', 10, true)], [move('rdl', 'hamstrings', 10, true), move('curl3', 'hamstrings', 7)], [move('pushdown', 'triceps', 10, true)]];
    const grown = curateFocus({ picks: ['biceps'], days: grow, candidates: [[], [], [], []], cap: 10, budgetMinutes: 60, minutes: mins, fill: true });
    expect(ids(grown.days[0]!)).toEqual(['benchx10', 'curlx10', 'legcurlx3']);
  });
  it('the limit counts what the 48 hour rule tracks too: a move with no muscle on record still counts as the work it is', () => {
    // 18 sets of planks (no muscle on record, tracked as abs) on day 3: a crunch of 3 does not join day 1, one of 2 does.
    const plank = (id: string, sets: number): FocusMove => ({ ...move(id, 'abs', sets), muscles: [], recovery: ['abs'] });
    const week = [[move('bench', 'chest', 10, true), move('curl', 'biceps', 10)], [move('dip', 'triceps', 10, true)], [plank('plank', 10), plank('side', 8)], [move('pushdown', 'triceps', 10, true)]];
    const out = curateFocus({ picks: ['biceps'], days: week, candidates: [[{ ...move('crunch', 'abs'), recovery: ['abs'] }], [], [], []], cap: 10, budgetMinutes: 48, minutes: mins, fill: true });
    expect(ids(out.days[0]!)).toEqual(['benchx10', 'curlx10', 'crunchx2']);
  });
  it('only moves whose muscles are sure: one with no muscle on record is never added or grown', () => {
    const unsure: FocusMove = { ...move('twist', 'abs'), muscles: [], recovery: ['abs'] };
    const week = [[move('bench', 'chest', 3, true), move('curl', 'biceps'), { ...unsure, id: 'plank', key: 'plank', sets: 2 }]];
    const out = curateFocus({ picks: ['biceps'], days: week, candidates: [[unsure]], cap: 3, budgetMinutes: 40, minutes: mins, fill: true });
    expect(ids(out.days[0]!)).toEqual(['benchx3', 'curlx3', 'plankx2']);
  });
});
