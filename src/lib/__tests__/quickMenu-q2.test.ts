// PLAN Q2 (SPEC 20.3): the Quick target menu's order and tags from fixture logs: legs today, chest
// yesterday, a push and pull week, an empty log. Pinned local clock.
import { describe, expect, it } from 'vitest';
import type { Muscle } from '../order';
import type { LoggedSet, LoggedWorkout } from '../recovery';
import { ABS_FINISHER, BUILD_MY_OWN, NO_HISTORY_LINE, QUICK_TARGETS, TARGET_TITLE, targetMenu, type TargetEntry } from '../quickCards';

const H = 3_600_000;
/** Thursday 19 Nov 2026, 6 pm local. */
const NOW = new Date(2026, 10, 19, 18, 0).getTime();

const sets = (n: number, primary: Muscle[], secondary: Muscle[] = []): LoggedSet[] => Array.from({ length: n }, () => ({ kind: 'work', primary, secondary }));
const at = (hoursAgo: number, ...s: LoggedSet[][]): LoggedWorkout => ({ at: NOW - hoursAgo * H, sets: s.flat() });
const pushDay = (h: number) => at(h, sets(4, ['chest'], ['triceps', 'front delts']), sets(3, ['front delts', 'side delts'], ['triceps']), sets(3, ['triceps']));
const pullDay = (h: number) => at(h, sets(4, ['back'], ['biceps', 'rear delts']), sets(3, ['back']), sets(3, ['biceps']));

const ids = (t: readonly TargetEntry[]) => t.map((e) => e.id);
const tagged = (t: readonly TargetEntry[]) => t.filter((e) => e.recommended).map((e) => e.id);
const get = (t: readonly TargetEntry[], id: string) => t.find((e) => e.id === id)!;

describe('the menu', () => {
  it('has the eight targets with their names and the Build my own link', () => {
    expect(QUICK_TARGETS).toEqual(['best', 'push', 'pull', 'legs', 'chest', 'back', 'full', 'abs']);
    const m = targetMenu([], NOW);
    expect(m.targets.map((e) => e.title)).toEqual(['Best for today', 'Push', 'Pull', 'Legs', 'Chest', 'Back', 'Full body', 'Abs']);
    expect(m.targets.map((e) => e.title)).toEqual(QUICK_TARGETS.map((t) => TARGET_TITLE[t]));
    expect(m.buildMyOwn).toBe('Build my own');
    expect(BUILD_MY_OWN).toBe('Build my own');
  });
  it('Abs is a target and a 5 minute "Add abs finisher" toggle on every other one', () => {
    expect(ABS_FINISHER).toEqual({ label: 'Add abs finisher', minutes: 5 });
    for (const log of [[], [at(2, sets(3, ['quads']))]]) {
      const t = targetMenu(log, NOW).targets;
      expect(get(t, 'abs').absFinisher).toBe(false);
      for (const e of t.filter((x) => x.id !== 'abs')) expect(e.absFinisher).toBe(true);
    }
  });
});

describe('empty log', () => {
  const t = targetMenu([], NOW).targets;
  it('keeps the base order with no tags and no facts', () => {
    expect(ids(t)).toEqual([...QUICK_TARGETS]);
    expect(tagged(t)).toEqual([]);
    for (const e of t) {
      expect(e.fact).toBeNull();
      expect(e.dimmed).toBe(false);
      expect(e.state).toBe('unknown');
    }
  });
  it('Best for today becomes Full body with its line', () => {
    expect(get(t, 'best')).toMatchObject({ builds: 'full', line: NO_HISTORY_LINE });
    expect(NO_HISTORY_LINE).toBe('Log a workout and I will steer you.');
  });
  it('warmups only is still no history', () => {
    const w = targetMenu([{ at: NOW - 2 * H, sets: Array.from({ length: 6 }, () => ({ kind: 'warmup' as const, primary: ['chest' as Muscle] })) }], NOW).targets;
    expect(ids(w)).toEqual([...QUICK_TARGETS]);
    expect(tagged(w)).toEqual([]);
    expect(get(w, 'best').line).toBe(NO_HISTORY_LINE);
  });
});

describe('legs today', () => {
  const t = targetMenu([at(3, sets(4, ['quads', 'glutes']), sets(3, ['hamstrings']), sets(3, ['calves']))], NOW).targets;
  it('sorts Legs and Full body down, dimmed, with the fact', () => {
    expect(ids(t)).toEqual(['best', 'push', 'pull', 'chest', 'back', 'abs', 'legs', 'full']);
    for (const id of ['legs', 'full']) expect(get(t, id)).toMatchObject({ state: 'recent', dimmed: true, fact: 'Trained today', recommended: false });
  });
  it('tags the first two rested ones and Best for today builds Push', () => {
    expect(tagged(t)).toEqual(['push', 'pull']);
    expect(get(t, 'best')).toMatchObject({ builds: 'push', recommended: false, line: null, dimmed: false });
  });
});

describe('chest yesterday', () => {
  // 20 hours before 6 pm: 10 pm yesterday.
  const t = targetMenu([at(20, sets(4, ['chest'], ['triceps']), sets(3, ['chest']))], NOW).targets;
  it('sorts Push, Chest and Full body down with "Trained yesterday"', () => {
    expect(ids(t)).toEqual(['best', 'pull', 'legs', 'back', 'abs', 'push', 'chest', 'full']);
    for (const id of ['push', 'chest', 'full']) expect(get(t, id)).toMatchObject({ state: 'recent', dimmed: true, fact: 'Trained yesterday' });
  });
  it('triceps as a secondary muscle leave nothing else recent', () => {
    for (const id of ['pull', 'legs', 'back', 'abs']) expect(get(t, id)).toMatchObject({ state: 'fresh', dimmed: false, fact: null });
  });
  it('tags Pull and Legs; Best for today builds Pull', () => {
    expect(tagged(t)).toEqual(['pull', 'legs']);
    expect(get(t, 'best').builds).toBe('pull');
  });
});

describe('push and pull week', () => {
  // Push Saturday and Tuesday, pull Sunday and Wednesday; nothing for legs or abs all week.
  const log = [pushDay(5 * 24 + 2), pullDay(4 * 24 + 1), pushDay(3 * 24 - 1), pullDay(30)];
  const t = targetMenu(log, NOW).targets;
  it('sorts Pull, Back and Full body down; Push and Chest are rested again', () => {
    expect(ids(t)).toEqual(['best', 'push', 'legs', 'chest', 'abs', 'pull', 'back', 'full']);
    for (const id of ['pull', 'back', 'full']) expect(get(t, id)).toMatchObject({ state: 'recent', fact: 'Trained yesterday', dimmed: true });
    for (const id of ['push', 'chest']) expect(get(t, id)).toMatchObject({ state: 'fresh', fact: null, dimmed: false });
  });
  it('tags the two never trained this week, the longest rested; Best for today builds Legs (never Abs alone)', () => {
    expect(tagged(t)).toEqual(['legs', 'abs']);
    expect(get(t, 'best').builds).toBe('legs');
  });
  it('never more than 2 tags, and Best for today never carries one', () => {
    expect(tagged(t).length).toBeLessThanOrEqual(2);
    expect(get(t, 'best').recommended).toBe(false);
  });
});

describe('everything recent', () => {
  it('Best for today builds the target rested longest, with its true fact', () => {
    const t = targetMenu([pushDay(2), pullDay(26), at(40, sets(3, ['quads'])), at(1, sets(3, ['abs']))], NOW).targets;
    expect(tagged(t)).toEqual([]);
    expect(get(t, 'best')).toMatchObject({ builds: 'legs', fact: 'Trained yesterday', dimmed: false });
    expect(ids(t)).toEqual([...QUICK_TARGETS]);
  });
});
