import { describe, expect, it } from 'vitest';
import { advanceRotation, needsWeeklySchedule, remindersEligible, resolveNextDay, scheduleStyleOf } from '../schedule';
import { weekKey } from '../../coach/time';
import { TIRED_MS } from '../../quickWhy';
import { finishPlanPosition } from '../../finishPlan';
import { coachToday } from '../../coach/today';

const state = { nextDayIndex: 0, doneDays: [], pendingDayIndices: [0, 1, 2] };
const now = new Date(2026, 10, 10, 12).getTime();
const days = [['chest'], ['back'], ['legs']];
describe('stable rotation with elapsed recovery', () => {
  it('defers a blocked day without losing or scrambling it', () => {
    const next = resolveNextDay({ state, days, trained: { chest: now - 1000 }, now });
    expect(next).toEqual({ dayIndex: 1, deferred: [0], pendingDayIndices: [1, 2, 0] });
    const after = advanceRotation({ ...state, pendingDayIndices: next.pendingDayIndices }, 3, 1);
    expect(after).toEqual({ nextDayIndex: 2, pendingDayIndices: [2, 0], wrapped: false });
    const lastNumeric = advanceRotation({ ...state, ...after }, 3, 2);
    expect(lastNumeric).toEqual({ nextDayIndex: 0, pendingDayIndices: [0], wrapped: false });
    expect(advanceRotation({ ...state, ...lastNumeric }, 3, 0).wrapped).toBe(true);
  });
  it('does not pick a conflicting day at 47:59 and picks it at exactly 48 hours', () => {
    const only = { nextDayIndex: 0, doneDays: [], pendingDayIndices: [0] };
    expect(resolveNextDay({ state: only, days: [['chest']], trained: { chest: now - TIRED_MS + 60_000 }, now })).toMatchObject({ dayIndex: null, eligibleAt: now + 60_000 });
    expect(resolveNextDay({ state: only, days: [['chest']], trained: { chest: now - TIRED_MS }, now }).dayIndex).toBe(0);
  });
  it('returns the first eligible time when all remaining days need recovery; future facts do not count', () => {
    expect(resolveNextDay({ state, days, trained: { chest: now, back: now - 1000, legs: now - 2000 }, now })).toMatchObject({ dayIndex: null, eligibleAt: now - 2000 + TIRED_MS, pendingDayIndices: [0, 1, 2] });
    expect(resolveNextDay({ state, days, trained: { chest: now + 1000 }, now }).dayIndex).toBe(0);
  });
  it('never starves a day across repeated deferrals and wraps', () => {
    let s = state;
    const visited: number[] = [];
    for (let i = 0; i < 15; i++) {
      const t = now + i * TIRED_MS;
      const next = resolveNextDay({ state: s, days, trained: i === 0 ? { chest: t } : {}, now: t });
      visited.push(next.dayIndex!);
      const advanced = advanceRotation({ ...s, pendingDayIndices: next.pendingDayIndices }, 3, next.dayIndex!);
      s = { nextDayIndex: advanced.nextDayIndex, doneDays: [], pendingDayIndices: advanced.pendingDayIndices };
    }
    for (let i = 0; i < visited.length; i += 3) expect([...visited.slice(i, i + 3)].sort()).toEqual([0, 1, 2]);
  });
  it('never moves a day the person chose themselves, even with every day resting; a stale choice is ignored', () => {
    const all = { chest: now - 1000, back: now - 1000, legs: now - 1000 };
    expect(resolveNextDay({ state, days, trained: all, now })).toMatchObject({ dayIndex: null, pendingDayIndices: [0, 1, 2] });
    expect(resolveNextDay({ state: { ...state, chosenDayIndex: 0 }, days, trained: all, now })).toEqual({ dayIndex: 0, pendingDayIndices: [0, 1, 2], deferred: [] });
    expect(resolveNextDay({ state: { ...state, chosenDayIndex: 2 }, days, trained: { legs: now - 1000 }, now })).toEqual({ dayIndex: 2, pendingDayIndices: [2, 0, 1], deferred: [] });
    // Day 1 is already done in this pass: the choice no longer applies, the order does.
    expect(resolveNextDay({ state: { nextDayIndex: 1, doneDays: [], pendingDayIndices: [1, 2], chosenDayIndex: 0 }, days, trained: {}, now })).toEqual({ dayIndex: 1, pendingDayIndices: [1, 2], deferred: [] });
  });
  it('a blocked day comes back as soon as it is rested, before the pass ends, and a pass never repeats or drops a day', () => {
    // Full body days: each one tires everything, so training daily is always "all blocked" and waits.
    const same = [['legs', 'chest'], ['legs', 'back'], ['legs', 'chest', 'back']];
    let s: { nextDayIndex: number; doneDays: number[]; pendingDayIndices?: number[] } = { nextDayIndex: 0, doneDays: [] };
    const trained: Record<string, number> = {};
    const visited: number[] = [];
    let t = now;
    for (let i = 0; i < 9; i++) {
      let next = resolveNextDay({ state: s, days: same, trained, now: t });
      if (next.dayIndex === null) { expect(next.eligibleAt).toBe(t - 3_600_000 + TIRED_MS); t = next.eligibleAt!; next = resolveNextDay({ state: s, days: same, trained, now: t }); }
      // After the wait it is the next day in order, never a later one.
      expect(next.dayIndex).toBe(next.pendingDayIndices[0]);
      expect(next.deferred).toEqual([]);
      for (const m of same[next.dayIndex!]!) trained[m] = t;
      visited.push(next.dayIndex!);
      const a = advanceRotation({ ...s, pendingDayIndices: next.pendingDayIndices }, 3, next.dayIndex!);
      s = { nextDayIndex: a.nextDayIndex, doneDays: [], pendingDayIndices: a.pendingDayIndices };
      t += 3_600_000;
    }
    expect(visited).toEqual([0, 1, 2, 0, 1, 2, 0, 1, 2]);
  });
  it('keeps the 60% threshold and only wraps after the last pending day, preserving partial rings', () => {
    const s = { ...state, weekIndex: 0, pendingDayIndices: [2, 0, 1] };
    const plan = { days: [0, 1, 2].map((n) => ({ n, name: 'Day', blocks: [] })), progressionMode: 'double' as const };
    expect(finishPlanPosition(s, plan, 2, { share: .59, complete: false })).toMatchObject({ nextDayIndex: 2, pendingDayIndices: [2, 0, 1], partial: { 2: .59 } });
    expect(finishPlanPosition(s, plan, 2, { share: .6, complete: false })).toMatchObject({ nextDayIndex: 0, pendingDayIndices: [0, 1], partial: { 2: .6 }, doneDays: [] });
  });
});
describe('local schedule choices', () => {
  it('infers old weekdays as fixed, defaults unspecified to flexible, and enables reminders only for fixed', () => {
    expect(scheduleStyleOf({ weekdays: ['mon'] })).toBe('fixed');
    expect(scheduleStyleOf()).toBe('flexible');
    expect(scheduleStyleOf({ scheduleStyle: 'weekly', weekdays: ['mon'] })).toBe('weekly');
    expect(remindersEligible({ scheduleStyle: 'weekly' })).toBe(false);
    expect(remindersEligible({ weekdays: ['mon'] })).toBe(true);
  });
  it('asks once in the Monday week, including the first open on Tuesday', () => {
    const a = { scheduleStyle: 'weekly' as const };
    expect(needsWeeklySchedule(a, undefined, now)).toBe(true);
    const saved = { weekKey: weekKey(now), weekdays: [], answeredAt: now };
    expect(needsWeeklySchedule(a, saved, now + 86_400_000)).toBe(false);
    expect(needsWeeklySchedule(a, saved, now + 7 * 86_400_000)).toBe(true);
    expect(needsWeeklySchedule({ scheduleStyle: 'flexible' }, undefined, now)).toBe(false);
  });
  it('uses elapsed hours across DST and local Monday boundaries across time zones', () => {
    const before = process.env.TZ;
    try {
      for (const zone of ['America/New_York', 'Pacific/Guam', 'Europe/Paris']) {
        process.env.TZ = zone;
        const tue = new Date(2026, 2, 10, 0, 5).getTime();
        expect(weekKey(tue)).toBe('2026-03-09');
        const at = new Date(2026, 2, 7, 12).getTime();
        expect(resolveNextDay({ state: { nextDayIndex: 0, doneDays: [] }, days: [['chest']], trained: { chest: at }, now: at + TIRED_MS - 1 }).dayIndex).toBeNull();
        expect(resolveNextDay({ state: { nextDayIndex: 0, doneDays: [] }, days: [['chest']], trained: { chest: at }, now: at + TIRED_MS }).dayIndex).toBe(0);
      }
    } finally { process.env.TZ = before; }
  });
  it('never suggests a missed-workouts card for flexible training', () => {
    const today = coachToday({ now, lifts: [], dates: [now - 6 * 86_400_000], changes: [], closed: new Set(), activeWorkout: false, autoLevelUp: false, plan: { daysPerWeek: 6, scheduleStyle: 'flexible' } });
    expect(today.card?.kind).not.toBe('missed_days');
  });
});
