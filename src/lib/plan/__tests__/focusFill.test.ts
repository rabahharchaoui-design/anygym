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

describe('the stretch block on a full day (PLAN 3.6g)', () => {
  const hold: FocusMove[] = ['quad', 'ham', 'pigeon'].map((id) => ({ id, key: id, sets: 1, seconds: 60, hard: false, compound: false, muscles: [], picks: ['mobility'] }));
  /** Two minutes a set, the stretches by their holds, and `base` minutes of warm up. */
  const time = (base: number) => (d: FocusMove[]) => base + d.reduce((n, m) => n + (m.hard ? m.sets * 2 : (m.seconds ?? 0) * m.sets / 60), 0);
  const day = () => [move('bench', 'chest', 4, true), move('row', 'back', 4, true), move('press', 'chest', 3, true), move('fly', 'chest'), move('curl', 'biceps')];
  const block = (out: ReturnType<typeof curateFocus>) => out.days[0]!.filter((m) => !m.hard).map((m) => `${m.id} ${m.sets}x${m.seconds}`);
  it('Mobility alone, 45 minutes, no time free: moves no pick asks for give sets (small moves first, the first lift last), and the block is 6 minutes', () => {
    const out = curateFocus({ picks: ['mobility'], days: [day()], candidates: [hold], cap: 4, budgetMinutes: 45, minutes: time(11) });
    expect(ids(out.days[0]!.filter((m) => m.hard))).toEqual(['benchx4', 'rowx3', 'pressx3', 'flyx2', 'curlx2']);
    expect(block(out)).toEqual(['quad 2x60', 'ham 2x60', 'pigeon 2x60']);
    expect(out.report.priorities[0]).toMatchObject({ id: 'mobility', session: 6, minutes: 6, state: 'extra' });
    expect(out.report.dayExtra![0]).toEqual([{ id: 'mobility', extra: 0, minutes: 6 }]);
    expect(time(11)(out.days[0]!)).toBeLessThanOrEqual(45);
  });
  it('a ranked pick is served first and its work is never given; a loved move neither', () => {
    const loved = day(); loved[3]!.keep = true;
    const out = curateFocus({ picks: ['biceps', 'mobility'], days: [loved], candidates: [hold], cap: 3, budgetMinutes: 45, minutes: time(11) });
    // The curl (the pick's) and the fly (loved) keep their sets: the row, the press and the bench give.
    expect(ids(out.days[0]!.filter((m) => m.hard))).toEqual(['benchx3', 'rowx3', 'pressx2', 'flyx3', 'curlx3']);
    expect(block(out)).toEqual(['quad 2x60', 'ham 2x60', 'pigeon 2x60']);
  });
  it('when sets are not enough a small move no pick asks for gives its place; never under 4 lifts', () => {
    const tight = () => [move('bench', 'chest', 3, true), move('row', 'back', 3, true), move('raise', 'side delts', 2), move('curl', 'biceps', 2), move('calf', 'calves', 3)];
    const out = curateFocus({ picks: ['mobility'], days: [tight()], candidates: [hold], cap: 3, budgetMinutes: 45, minutes: time(19) });
    expect(ids(out.days[0]!.filter((m) => m.hard))).toEqual(['benchx3', 'rowx3', 'raisex2', 'curlx2']);
    expect(block(out)).toEqual(['quad 2x60', 'ham 2x60', 'pigeon 2x60']);
    // Four lifts: nothing gives its place, and no stray minute is added.
    const four = tight().slice(0, 4);
    const none = curateFocus({ picks: ['mobility'], days: [four], candidates: [hold], cap: 3, budgetMinutes: 45, minutes: time(25) });
    expect(ids(none.days[0]!)).toEqual(['benchx3', 'rowx3', 'raisex2', 'curlx2']);
    expect(none.report.priorities[0]).toMatchObject({ session: 0, state: 'short' });
  });
  it('a 30 minute session never trades lifting for stretches; with free time it still gets its block', () => {
    const full = curateFocus({ picks: ['mobility'], days: [day()], candidates: [hold], cap: 4, budgetMinutes: 30, minutes: time(-4) });
    expect(ids(full.days[0]!)).toEqual(['benchx4', 'rowx4', 'pressx3', 'flyx3', 'curlx3']);
    const free = curateFocus({ picks: ['mobility'], days: [day()], candidates: [hold], cap: 4, budgetMinutes: 30, minutes: time(-10) });
    expect(block(free)).toEqual(['quad 2x60', 'ham 2x60', 'pigeon 2x60']);
    expect(ids(free.days[0]!.filter((m) => m.hard))).toEqual(['benchx4', 'rowx4', 'pressx3', 'flyx3', 'curlx3']);
  });
});
