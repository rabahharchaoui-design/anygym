import { describe, expect, it } from 'vitest';
import { countHardSets, curateFocus, focusBudget, focusUnplaced, normalizeFocusPicks, type FocusMove } from '../focus';
import { readFocusReport } from '../focusMetadata';
const move = (id: string, muscle: string, sets = 3, compound = false): FocusMove => ({ id, key: id, sets, compound, hard: true, muscles: [muscle], picks: muscle === 'back' ? ['back'] : muscle === 'biceps' ? ['biceps', 'arms'] : [] });
const run = (days: FocusMove[][], picks: string[], candidates: FocusMove[][] = days, cap = 4, budgetMinutes = 60) => curateFocus({ days, picks, candidates, cap, budgetMinutes, minutes: (d) => d.reduce((n, m) => n + m.sets * 2, 0) });

describe('one priority budget', () => {
  it('has four sets each for one or two, three each for three or four, and at most twelve for any count', () => {
    const picks = ['chest', 'back', 'arms', 'shoulders', 'legs', 'glutes', 'core', 'posture', 'grip', 'mobility'];
    expect(focusBudget(picks.slice(0, 1)).targets.map((p) => p.sets)).toEqual([4]);
    expect(focusBudget(picks.slice(0, 2)).total).toBe(8);
    expect(focusBudget(picks.slice(0, 4)).targets.map((p) => p.sets)).toEqual([3, 3, 3, 3]);
    const all = focusBudget(picks);
    expect(all.total).toBe(12);
    expect(all.targets.slice(0, 2).map((p) => p.sets)).toEqual([3, 3]);
    expect(all.targets.reduce((n, p) => n + p.sets, 0)).toBeLessThanOrEqual(12);
    expect(all.targets.at(-1)!.sets).toBe(0);
  });
  it('keeps balance exclusive, drops invalid ids, and never buys a parent and its child twice', () => {
    expect(normalizeFocusPicks(['back', 'balance', 'biceps'])).toEqual(['balance']);
    expect(normalizeFocusPicks(['biceps', 'arms', 'lats', 'back', 'arms', 'bad'])).toEqual(['arms', 'back']);
    expect(normalizeFocusPicks(['side_delts', 'quads', 'abs'])).toEqual(['side_delts', 'quads', 'abs']);
  });
  it('replaces a low priority accessory before growth; protects compounds and the experience ceiling', () => {
    const days = [[move('squat', 'quads', 3, true), move('curl', 'biceps')]];
    const before = structuredClone(days);
    const out = run(days, ['back'], [[move('row', 'back')]], 3, 12);
    expect(out.days[0]!.map((m) => m.id)).toEqual(['squat', 'row']);
    expect(out.days[0]!.map((m) => m.sets)).toEqual([3, 3]);
    expect(out.report.priorities[0]).toMatchObject({ extra: 3, total: 3, state: 'extra', shortfall: false });
    expect(days).toEqual(before);
    expect(run(days, ['back'], [[move('row', 'back')]], 3, 12)).toEqual(out);
  });
  it('caps retained focused muscle work at twenty and reports an unattainable twelve-set target honestly', () => {
    const days = Array.from({ length: 6 }, (_, i) => [move(`back-${i}`, 'back', 4)]);
    const out = run(days, ['back']);
    expect(countHardSets(out.days, 'back')).toBeLessThanOrEqual(20);
    const short = run([[move('curl', 'biceps', 2)]], ['back'], [[]], 3, 4);
    expect(short.report.priorities[0]).toMatchObject({ total: 0, extra: 0, state: 'no_move', noMove: true });
  });
  it('does not charge helpers, warmups or stretches as hard sets', () => {
    const stretch = { ...move('stretch', 'back', 20), hard: false };
    expect(countHardSets([[stretch, move('row', 'back', 3)]], 'back')).toBe(3);
    const out = run([[move('row', 'back', 3)]], ['back'], [], 3, 6);
    expect(out.report.priorities[0]!.total).toBe(3);
    expect(out.report.spent).toBe(0);
  });
  it('counts an added physical set once even with multiple verified targets', () => {
    const both = { ...move('both', 'back', 2), muscles: ['back', 'biceps'], picks: ['back', 'biceps'] as const };
    const out = run([[both]], ['back', 'biceps'], [], 4, 8);
    expect(out.report.spent).toBe(2);
    expect(countHardSets(out.days, 'back')).toBe(4);
    expect(countHardSets(out.days, 'biceps')).toBe(4);
    expect(out.report.priorities.map((p) => p.extra)).toEqual([2, 2]);
  });
  it('gives mobility time, never hard sets, and checks the same duration callback', () => {
    const mobility: FocusMove = { id: 'stretch', key: 'stretch', hard: false, compound: false, muscles: [], picks: ['mobility'], sets: 1, seconds: 60 };
    const result = curateFocus({ picks: ['mobility'], days: [[], []], candidates: [[mobility], [mobility]], cap: 3, budgetMinutes: 1, minutes: (d) => d.reduce((n, m) => n + (m.seconds ?? 0) / 60, 0) });
    // Truth pass: the minutes are the real ones (1 a day, 2 in all), and a minute a day is not a stretch block, so the pick is not marked delivered.
    expect(result.report.priorities).toEqual([{ id: 'mobility', requested: 0, extra: 0, total: 0, minutes: 2, session: 1, shortfall: true, state: 'short' }]);
    // A real block (5 minutes in one session) is.
    const block = curateFocus({ picks: ['mobility'], days: [[], []], candidates: [[{ ...mobility, seconds: 300 }], []], cap: 3, budgetMinutes: 5, minutes: (d) => d.reduce((n, m) => n + (m.seconds ?? 0) / 60, 0) });
    expect(block.report.priorities).toEqual([{ id: 'mobility', requested: 0, extra: 0, total: 0, minutes: 5, session: 5, shortfall: false, state: 'extra' }]);
    expect(result.report.spent).toBe(0);
  });
  it('shares 12 by rank from five picks up: top two 3, then 2s, then 1s, then nothing; mobility takes no share', () => {
    const hard = ['lats', 'side_delts', 'quads', 'biceps', 'abs', 'glutes', 'calves', 'triceps', 'hamstrings', 'rear_delts'];
    const shares = (n: number) => focusBudget(hard.slice(0, n)).targets.map((t) => t.sets);
    expect(shares(3)).toEqual([3, 3, 3]);
    expect(shares(5)).toEqual([3, 3, 2, 2, 2]);
    expect(shares(6)).toEqual([3, 3, 2, 2, 1, 1]);
    expect(shares(7)).toEqual([3, 3, 2, 1, 1, 1, 1]);
    expect(shares(8)).toEqual([3, 3, 1, 1, 1, 1, 1, 1]);
    expect(shares(10)).toEqual([3, 3, 1, 1, 1, 1, 1, 1, 0, 0]);
    for (let n = 5; n <= 10; n++) expect(focusBudget(hard.slice(0, n)).total).toBe(12);
    // Mobility is minutes, so four hard picks beside it still get 3 each.
    expect(focusBudget(['mobility', ...hard.slice(0, 4)]).targets.map((t) => t.sets)).toEqual([0, 3, 3, 3, 3]);
    expect(focusBudget(['lats', 'mobility']).targets.map((t) => t.sets)).toEqual([4, 0]);
    expect(focusBudget(['balance']).total).toBe(0);
  });
  it('48 hour rule: a new move never joins a day next to one that trains its muscle', () => {
    const push = [move('bench', 'chest', 3, true), move('fly', 'chest'), move('pushdown', 'triceps')];
    const pull = [move('row', 'back', 3, true), move('curl', 'biceps')];
    const legs = [move('squat', 'quads', 3, true), move('calf', 'calves'), move('ext', 'quads')];
    const pulldown = move('pulldown', 'back');
    const out = run([push, pull, legs], ['back'], [[pulldown], [pulldown], [pulldown]], 4, 60);
    expect(out.days[0]!.map((m) => m.id)).toEqual(push.map((m) => m.id));
    expect(out.days[2]!.map((m) => m.id)).toEqual(legs.map((m) => m.id));
    expect(out.days[1]!.some((m) => m.id === 'pulldown')).toBe(true);
    // The scheduler's own muscle words decide, when the adapter gives them.
    const wide = { ...pulldown, recovery: ['back', 'quads'] };
    const two = run([pull, [move('press', 'chest', 3, true), move('raise', 'side delts')], [move('squat', 'quads', 3, true), move('calf', 'calves')]], ['back'], [[], [wide], [wide]], 4, 60);
    expect(two.days[1]!.some((m) => m.id === 'pulldown')).toBe(false);
    expect(two.days[2]!.some((m) => m.id === 'pulldown')).toBe(false);
  });
  it('never swaps out a loved move, and spares the accessory whose muscles the day trains twice', () => {
    const day = [move('row', 'back', 3, true), move('fly', 'chest'), move('press', 'chest'), { ...move('raise', 'side delts'), keep: true }];
    const out = run([day], ['biceps'], [[move('curl', 'biceps')]], 4, 24);
    expect(out.days[0]!.map((m) => m.id)).toEqual(['row', 'fly', 'curl', 'raise']);
    const only = run([[move('row', 'back', 3, true), { ...move('raise', 'side delts'), keep: true }]], ['biceps'], [[move('curl', 'biceps')]], 4, 12);
    expect(only.days[0]!.map((m) => m.id)).toEqual(['row', 'raise']);
    expect(only.report.priorities[0]).toMatchObject({ extra: 0, shortfall: true });
  });
  it('tries the next accessory when sparing the first would break the 20 set limit', () => {
    const chest = Array.from({ length: 5 }, (_, i) => [move(`press-${i}`, 'chest', 4, true)]);
    const incline: FocusMove = { ...move('incline', 'chest'), picks: ['upper_chest'] };
    const last = [move('fly', 'chest', 4), move('pushdown', 'triceps', 3), move('dip', 'triceps', 3)];
    const out = run([...chest.slice(0, 4), last], ['upper_chest'], [[], [], [], [], [incline]], 4, 60);
    // 20 chest sets already: the incline move can only take the fly's place, never a triceps move's.
    expect(out.days[4]!.map((m) => m.id)).toEqual(['incline', 'pushdown', 'dip']);
    expect(countHardSets(out.days, 'chest')).toBe(20);
  });
  it('an option only big lifts train takes one in place of an accessory, never as a finisher', () => {
    const row: FocusMove = { ...move('row-2', 'back', 3, true), picks: ['upper_back'] };
    const out = run([[move('bench', 'chest', 3, true), move('curl', 'biceps')]], ['upper_back'], [[row]], 4, 60);
    expect(out.days[0]!.map((m) => m.id)).toEqual(['bench', 'row-2']);
    const none = run([[move('bench', 'chest', 3, true)]], ['upper_back'], [[row]], 4, 60);
    expect(none.days[0]!.map((m) => m.id)).toEqual(['bench']);
  });
  it('at the limit is said, kept in a saved report, and is not a miss; one set short is still a fit', () => {
    const days = Array.from({ length: 5 }, (_, i) => [move(`back-${i}`, 'back', 4)]);
    const out = run(days, ['back']);
    expect(countHardSets(out.days, 'back')).toBe(20);
    expect(out.report.priorities[0]).toMatchObject({ extra: 0, total: 20, atLimit: true, state: 'plenty' });
    expect(focusUnplaced(out.report)).toEqual([]);
    expect(readFocusReport(structuredClone(out.report))).toEqual(out.report);
    expect(readFocusReport({ ...out.report, priorities: [{ ...out.report.priorities[0], atLimit: 'yes' }] })).toBeUndefined();
    const p = { id: 'biceps' as const, total: 6, shortfall: true };
    const report = (extra: number, requested: number) => ({ budget: 12, spent: extra, days: [], priorities: [{ ...p, extra, requested }] });
    expect(focusUnplaced(report(3, 4))).toEqual([]);
    expect(focusUnplaced(report(2, 4))).toHaveLength(1);
    expect(focusUnplaced(report(1, 2))).toEqual([]);
    expect(focusUnplaced(report(0, 1))).toHaveLength(1);
    expect(focusUnplaced(report(0, 0))).toEqual([]);
    expect(focusUnplaced(undefined)).toEqual([]);
  });
  it('round 2, ranking is a promise: a pick never gets more extra than one ranked above it', () => {
    // One 12 minute day: room for the curls, none for more quad work (no spare accessory, no time).
    const day = [move('squat', 'quads', 3, true), move('fly', 'chest'), move('press', 'chest')];
    const leg: FocusMove = { ...move('ext', 'quads'), picks: ['quads'] };
    const curl = move('curl', 'biceps');
    const squat: FocusMove = { ...day[0]!, picks: ['quads'] };
    const tight = (picks: string[]) => curateFocus({ picks, days: [[squat, day[1]!, day[2]!]], candidates: [[leg, curl]], cap: 3, budgetMinutes: 18, minutes: (d) => d.reduce((n, m) => n + m.sets * 2, 0) });
    // Biceps first: it takes an accessory's place. Quads after it: the other accessory.
    expect(tight(['biceps', 'quads']).report.priorities.map((p) => p.extra)).toEqual([3, 3]);
    // Quads first, capped by the squat's set ceiling and one swap; biceps then gets no more than quads got.
    const out = tight(['quads', 'biceps']);
    const [quads, biceps] = out.report.priorities;
    expect(biceps!.extra).toBeLessThanOrEqual(quads!.extra);
  });
  it('round 2: a higher pick that got nothing for lack of room holds the lower picks back; one at the limit does not, and says plenty', () => {
    const mins = (d: FocusMove[]) => d.reduce((n, m) => n + m.sets * 2, 0);
    // Back has no candidate that may join (its only day is full of protected lifts): nothing extra for anyone below it.
    const locked = [[{ ...move('row', 'back', 3, true) }, { ...move('raise', 'side delts'), keep: true }]];
    const none = curateFocus({ picks: ['back', 'biceps'], days: locked, candidates: [[move('curl', 'biceps')]], cap: 3, budgetMinutes: 12, minutes: mins });
    expect(none.report.priorities.map((p) => [p.id, p.extra, p.state])).toEqual([['back', 0, 'short'], ['biceps', 0, 'short']]);
    // Back at 20 sets already: it says plenty, and biceps still gets its extra.
    const full = [...Array.from({ length: 5 }, (_, i) => [move(`back-${i}`, 'back', 4)]), [move('fly', 'chest'), move('press', 'chest')]];
    const out = curateFocus({ picks: ['back', 'biceps'], days: full, candidates: full.map(() => [move('curl', 'biceps')]), cap: 4, budgetMinutes: 60, minutes: mins });
    expect(out.report.priorities.map((p) => [p.id, p.state])).toEqual([['back', 'plenty'], ['biceps', 'extra']]);
    expect(out.report.priorities[1]!.extra).toBe(4);
  });
  it('round 2: extra is the real difference to the same days with no picks, and each day says what it adds', () => {
    const days = [[move('row', 'back', 3, true), move('fly', 'chest')], [move('squat', 'quads', 3, true), move('calf', 'calves')]];
    const out = run(days, ['back'], [[move('pulldown', 'back')], []], 4, 60);
    const back = out.report.priorities[0]!;
    expect(back.total - 3).toBe(back.extra);
    expect(out.report.dayExtra).toEqual([[{ id: 'back', extra: back.extra }], []]);
    // An area of several muscles carries each muscle's own count.
    const arms: FocusMove[][] = [[{ ...move('curl', 'biceps'), picks: ['arms'] }, { ...move('pushdown', 'triceps'), picks: ['arms'] }]];
    const both = run(arms, ['arms'], [[]], 4, 60).report.priorities[0]!;
    expect(both.parts).toEqual([{ muscle: 'biceps', sets: countHardSets(run(arms, ['arms'], [[]], 4, 60).days, 'biceps') }, { muscle: 'triceps', sets: countHardSets(run(arms, ['arms'], [[]], 4, 60).days, 'triceps') }]);
    expect(both.total).toBe(both.parts!.reduce((n, x) => n + x.sets, 0));
  });
});
