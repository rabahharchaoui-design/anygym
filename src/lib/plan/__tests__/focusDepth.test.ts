// PLAN 3.6g on the pure module: the chosen minutes are used before anything is traded, a pick's
// extra goes on its own days, a full day trades for focus, the 12 set floor, and the fill.
import { describe, expect, it } from 'vitest';
import { countHardSets, curateFocus, type FocusMove } from '../focus';
import type { FocusPickId } from '../../intake/options';

const PICK: Record<string, FocusPickId[]> = { back: ['back'], biceps: ['biceps'], quads: ['quads', 'legs'], calves: ['calves', 'legs'], 'side delts': ['side_delts'], chest: [], hamstrings: [], triceps: [] };
const move = (id: string, muscle: string, sets = 3, compound = false): FocusMove => ({ id, key: id, sets, compound, hard: true, muscles: [muscle], picks: PICK[muscle] ?? [] });
const mins = (d: FocusMove[]) => d.reduce((n, m) => n + m.sets * 2, 0);
const ids = (d: FocusMove[]) => d.map((m) => `${m.id}x${m.sets}`);

describe('1. the chosen minutes are used (PLAN 3.6g)', () => {
  const day = () => [move('bench', 'chest', 3, true), move('fly', 'chest'), move('curl', 'biceps')];
  const candidates = [[move('hammer', 'biceps'), move('raise', 'side delts')]];
  it('free time goes to the pick first: a set on its move, then a new move; nothing is traded away while there is time', () => {
    const out = curateFocus({ picks: ['biceps'], days: [day()], candidates, cap: 4, budgetMinutes: 30, minutes: mins });
    expect(ids(out.days[0]!)).toEqual(['benchx3', 'flyx3', 'curlx4', 'hammerx4']);
    expect(out.report.priorities[0]).toMatchObject({ extra: 5, total: 8, state: 'extra' });
    // Two minutes fewer: the free time is used first, and only the last set comes from the fly.
    const tight = curateFocus({ picks: ['biceps'], days: [day()], candidates, cap: 4, budgetMinutes: 26, minutes: mins });
    expect(ids(tight.days[0]!)).toEqual(['benchx3', 'flyx2', 'curlx4', 'hammerx4']);
    expect(mins(tight.days[0]!)).toBe(26);
  });
  it('more minutes buy a pick more: the same pick at 18, 22 and 26 minutes', () => {
    const at = (budgetMinutes: number) => curateFocus({ picks: ['biceps'], days: [day()], candidates, cap: 4, budgetMinutes, minutes: mins });
    const extras = [18, 22, 26].map((m) => at(m).report.priorities[0]!.extra);
    expect(extras).toEqual([...extras].sort((x, y) => x - y));
    expect(extras[2]!).toBeGreaterThan(extras[0]!);
    for (const budget of [18, 22, 26]) expect(mins(at(budget).days[0]!)).toBeLessThanOrEqual(budget);
  });
  it('fill: a day still short of the choice is built up with work no pick asks for, on muscles no pick trains; the focus numbers stay what they were', () => {
    const input = { picks: ['biceps'], days: [[move('bench', 'chest', 3, true), move('curl', 'biceps', 3), move('pushdown', 'triceps', 2)]], candidates: [[move('legcurl', 'hamstrings'), move('hammer', 'biceps')]], cap: 3, budgetMinutes: 40, minutes: mins };
    const plain = curateFocus(input), filled = curateFocus({ ...input, fill: true });
    expect(filled.report.priorities).toEqual(plain.report.priorities);
    expect(filled.report.spent).toBe(plain.report.spent);
    // The pick took what it could (both its moves are at the ceiling of 3). The time left goes to the triceps move and a new hamstring move; then there is nothing sure left to add, and nothing is invented.
    expect(ids(plain.days[0]!)).toEqual(['benchx3', 'curlx3', 'pushdownx2', 'hammerx3']);
    expect(ids(filled.days[0]!)).toEqual(['benchx3', 'curlx3', 'pushdownx3', 'hammerx3', 'legcurlx3']);
    expect(mins(filled.days[0]!)).toBeLessThanOrEqual(40);
    expect(countHardSets(filled.days, 'biceps')).toBe(countHardSets(plain.days, 'biceps'));
  });
  it('no fill unless asked, and never over the minutes', () => {
    const input = { picks: ['biceps'], days: [[move('bench', 'chest', 3, true), move('curl', 'biceps', 3), move('pushdown', 'triceps', 3)]], candidates: [[move('legcurl', 'hamstrings')]], cap: 3, budgetMinutes: 21, minutes: mins };
    expect(ids(curateFocus(input).days[0]!)).toEqual(['benchx3', 'curlx3', 'pushdownx3']);
    // 3 minutes free: a 2 set move (4 minutes) does not fit, so nothing is added.
    expect(ids(curateFocus({ ...input, fill: true }).days[0]!)).toEqual(['benchx3', 'curlx3', 'pushdownx3']);
  });
});

describe('2. room on a full day, and the right days (PLAN 3.6g)', () => {
  // A rotation of four: legs, push, pull, arms. Push and arms sit next to the leg day; pull does not.
  const days = () => [
    [move('squat', 'quads', 3, true), move('legcurl', 'hamstrings')],
    [move('bench', 'chest', 3, true), move('fly', 'chest')],
    [move('row', 'back', 3, true), move('facepull', 'chest')],
    [move('dip', 'triceps', 3, true), move('pushdown', 'triceps')],
  ];
  const candidates = days().map(() => [move('extension', 'quads')]);
  it('a leg pick gets its extra on the leg day when that has the room, never on the push day', () => {
    const out = curateFocus({ picks: ['quads'], days: days(), candidates, cap: 3, budgetMinutes: 20, minutes: mins });
    expect(ids(out.days[0]!)).toEqual(['squatx3', 'legcurlx3', 'extensionx3']);
    expect(out.report.dayExtra![0]).toEqual([{ id: 'quads', extra: 3 }]);
    // What its own day cannot hold (its moves are at the ceiling) may go to the pull day, which does not sit next to the leg day: never to push or arms.
    expect(out.days.map((d) => d.some((m) => m.muscles.includes('quads')))).toEqual([true, false, true, false]);
  });
  it('the leg day full: an accessory there gives its place first; only then another day, and only one the 48 hour rule allows', () => {
    const full = days();
    const out = curateFocus({ picks: ['quads'], days: full, candidates, cap: 3, budgetMinutes: 12, minutes: mins });
    // Its own day: the leg curl (no pick asks for it) gives its place.
    expect(ids(out.days[0]!)).toEqual(['squatx3', 'extensionx3']);
    // With the leg curl loved, the leg day has nothing to give: the extra goes to the pull day, which does not sit next to the leg day.
    const loved = days(); loved[0]![1]!.keep = true;
    const moved = curateFocus({ picks: ['quads'], days: loved, candidates, cap: 3, budgetMinutes: 12, minutes: mins });
    expect(moved.days.map((d) => d.some((m) => m.id === 'extension'))).toEqual([false, false, true, false]);
  });
  it('a full day trades sets: moves no pick asks for give a set, the first lift only its fourth and last of all', () => {
    const day = [move('bench', 'chest', 4, true), move('press', 'chest', 4, true), move('row', 'back', 2, true), move('fly', 'chest', 3)];
    const out = curateFocus({ picks: ['back'], days: [day], candidates: [[]], cap: 4, budgetMinutes: 26, minutes: mins });
    // The fly (to 2), then the second lift's fourth set: the row is at its ceiling of 4 before the bench is asked.
    expect(ids(out.days[0]!)).toEqual(['benchx4', 'pressx3', 'rowx4', 'flyx2']);
    const tight = [move('bench', 'chest', 4, true), move('row', 'back', 3, true)];
    expect(ids(curateFocus({ picks: ['back'], days: [tight], candidates: [[]], cap: 4, budgetMinutes: 14, minutes: mins }).days[0]!)).toEqual(['benchx3', 'rowx4']);
    // At 3 sets the first lift gives nothing.
    const kept = [move('bench', 'chest', 3, true), move('row', 'back', 3, true)];
    expect(ids(curateFocus({ picks: ['back'], days: [kept], candidates: [[]], cap: 4, budgetMinutes: 12, minutes: mins }).days[0]!)).toEqual(['benchx3', 'rowx3']);
  });
  it('little room is shared: every pick gets to +2 before any pick goes past it', () => {
    // One day with 8 free minutes and two picks with a share of 4 each: 2 and 2, not 4 and 0.
    const day = [move('bench', 'chest', 3, true), move('curl', 'biceps', 2), move('raise', 'side delts', 2)];
    const out = curateFocus({ picks: ['biceps', 'side_delts'], days: [day], candidates: [[]], cap: 4, budgetMinutes: 22, minutes: mins });
    expect(out.report.priorities.map((p) => [p.id, p.extra])).toEqual([['biceps', 2], ['side_delts', 2]]);
    // With 12 free minutes the higher pick is the one that goes on.
    const more = curateFocus({ picks: ['biceps', 'side_delts'], days: [day], candidates: [[]], cap: 5, budgetMinutes: 24, minutes: mins });
    expect(more.report.priorities.map((p) => [p.id, p.extra])).toEqual([['biceps', 3], ['side_delts', 2]]);
  });
});

describe('3. the 12 to 20 floor (PLAN 3.6g)', () => {
  const week = (curl: number) => Array.from({ length: 3 }, (_, i) => [move(`row${i}`, 'chest', 3, true), move(`curl${i}`, 'biceps', curl)]);
  const candidates = week(2).map((_, i) => [move(`hammer${i}`, 'biceps')]);
  it('a focused muscle under 12 sets is brought to 12 from what is left of the weekly budget, never past it', () => {
    const out = curateFocus({ picks: ['biceps'], days: week(2), candidates, cap: 3, budgetMinutes: 60, minutes: mins });
    expect(out.report.priorities[0]).toMatchObject({ extra: 6, total: 12, state: 'extra' });
    expect(out.report.priorities[0]!.under).toBeUndefined();
    expect(out.report.spent).toBe(6);
  });
  it('when the minutes do not allow it, the report says how many sets it is short', () => {
    const out = curateFocus({ picks: ['biceps'], days: week(2), candidates, cap: 3, budgetMinutes: 12, minutes: mins });
    const p = out.report.priorities[0]!;
    expect(p.total).toBeLessThan(12);
    expect(p.under).toBe(12 - p.total);
    for (const d of out.days) expect(mins(d)).toBeLessThanOrEqual(12);
  });
  it('never above 20, and the weekly budget of 12 holds: a pick with nothing before stops at 12 extra', () => {
    const many = Array.from({ length: 6 }, (_, i) => [move(`row${i}`, 'chest', 3, true), move(`curl${i}`, 'biceps', 3)]);
    const big = curateFocus({ picks: ['biceps'], days: many, candidates: many.map((_, i) => [move(`hammer${i}`, 'biceps')]), cap: 4, budgetMinutes: 60, minutes: mins });
    expect(big.report.priorities[0]).toMatchObject({ extra: 2, total: 20 });
    const none = Array.from({ length: 6 }, (_, i) => [move(`row${i}`, 'chest', 3, true)]);
    const fresh = curateFocus({ picks: ['biceps'], days: none, candidates: none.map((_, i) => [move(`curl${i}`, 'biceps')]), cap: 4, budgetMinutes: 60, minutes: mins });
    expect(fresh.report.priorities[0]).toMatchObject({ extra: 12, total: 12 });
    expect(fresh.report.spent).toBe(12);
  });
  it('an area is brought up by its muscle with the fewest sets, not by more of what it has plenty of', () => {
    // Legs: 14 quad sets, 4 calf sets. Past the share, only the calves are added to.
    const days = [[move('squat', 'quads', 4, true), move('ext', 'quads', 3), move('calf', 'calves', 2)], [move('press', 'quads', 4, true), move('ext2', 'quads', 3), move('calf2', 'calves', 2)]];
    const out = curateFocus({ picks: ['legs'], days, candidates: days.map((_, i) => [move(`raise${i}`, 'calves')]), cap: 4, budgetMinutes: 60, minutes: mins });
    expect(countHardSets(out.days, 'calves')).toBe(12);
    expect(countHardSets(out.days, 'quads')).toBeLessThanOrEqual(14 + 4);
    expect(out.report.priorities[0]!.under).toBeUndefined();
  });
  it('the floor never lifts a pick above one ranked higher that is still under 12 and could use it', () => {
    // Biceps (#1) has no room on its only day; side shoulders (#2) has plenty of free days. Past its share, #2 stops where #1 is.
    const days = [[move('row', 'chest', 3, true), { ...move('curl', 'biceps', 2), keep: true }], [move('squat', 'chest', 3, true), move('raise', 'side delts', 2)], [move('press', 'chest', 3, true), move('raise2', 'side delts', 2)]];
    const candidates = [[], [move('lateral', 'side delts')], [move('lateral2', 'side delts')]];
    const out = curateFocus({ picks: ['biceps', 'side_delts'], days, candidates, cap: 3, budgetMinutes: 30, minutes: (d, i) => mins(d) + (i === 0 ? 20 : 0) });
    const [biceps, delts] = out.report.priorities;
    expect(biceps!.extra).toBe(0);
    expect(delts!.extra).toBe(4);
    expect(delts!.under).toBeGreaterThan(0);
  });
});
