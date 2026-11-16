// PLAN 3.6f round 2 (critic BLOCKER 3, MAJOR 5): which work counts for the 48 hour rule, the kept
// day, "Train anyway" and the recovery words. Written from the PLAN and the critic's cases.
import { describe, expect, it } from 'vitest';
import { countedTraining, RECOVERY_MIN_SETS, type TrainingEntry } from '../recovery';
import { asksWeeklySchedule, resolveNextDay, restDayOf, weekChoice, weekdaysLeft } from '../schedule';
import { weekKey } from '../../coach/time';
import { readyWords, restDayWords, restingWords, weekPickWords } from '../scheduleWords';
import { TIRED_MS } from '../../quickWhy';

const HOUR = 3_600_000;
const now = new Date(2026, 10, 14, 18).getTime(); // Saturday 6 PM
const days = [['chest', 'front delts'], ['quads', 'hamstrings'], ['back', 'biceps']];
const state = { nextDayIndex: 0, doneDays: [], pendingDayIndices: [0, 1, 2] };

describe('what counts as trained', () => {
  it('the threshold is 3 hard sets on a muscle inside 48 hours, written in one place', () => {
    expect(RECOVERY_MIN_SETS).toBe(3);
    expect(countedTraining([{ at: now - HOUR, sets: { chest: 1 } }], now)).toEqual({});
    expect(countedTraining([{ at: now - HOUR, sets: { chest: 2, quads: 3 } }], now)).toEqual({ quads: now - HOUR });
  });
  it('adds up workouts inside the window and takes the latest time; old and future work never counts', () => {
    expect(countedTraining([{ at: now - 30 * HOUR, sets: { chest: 2 } }, { at: now - HOUR, sets: { chest: 1 } }], now)).toEqual({ chest: now - HOUR });
    expect(countedTraining([{ at: now - TIRED_MS, sets: { chest: 9 } }, { at: now + 1, sets: { chest: 9 } }], now)).toEqual({});
    expect(countedTraining([{ at: now - TIRED_MS, sets: { chest: 2 } }, { at: now - HOUR, sets: { chest: 2 } }], now)).toEqual({});
  });
  it('leaves out the workouts it is told to skip', () => {
    const log: TrainingEntry[] = [{ at: now - HOUR, planId: 'p', dayId: '1', sets: { chest: 4 } }, { at: now - 2 * HOUR, sets: { quads: 3 } }];
    expect(countedTraining(log, now, (e) => e.dayId === '1')).toEqual({ quads: now - 2 * HOUR });
  });
});

describe('the one next day rule', () => {
  it('one empty bar set on each of two days never asks for a rest day (critic MAJOR 5)', () => {
    const log: TrainingEntry[] = [{ at: now - 24 * HOUR, sets: { chest: 1 } }, { at: now - HOUR, sets: { hamstrings: 1, back: 1 } }];
    expect(resolveNextDay({ state, days, trained: countedTraining(log, now), now })).toEqual({ dayIndex: 0, pendingDayIndices: [0, 1, 2], deferred: [] });
  });
  it('a kept day is never moved away by its own part done workout, however many sets it had', () => {
    const log = [{ at: now - HOUR, planId: 'p', dayId: '1', sets: { chest: 5, 'front delts': 5 } }];
    const trained = countedTraining(log, now);
    // Without the kept day's own view the rule would move Day 1 behind Day 2.
    expect(resolveNextDay({ state, days, trained, now }).dayIndex).toBe(1);
    const kept = { dayIndex: 0, trained: countedTraining(log, now, (e) => e.dayId === '1') };
    expect(resolveNextDay({ state, days, trained, now, kept })).toEqual({ dayIndex: 0, pendingDayIndices: [0, 1, 2], deferred: [] });
  });
  it('a kept day still waits for muscles another counted workout trained', () => {
    const log = [{ at: now - HOUR, planId: 'p', dayId: '1', sets: { chest: 2 } }, { at: now - 3 * HOUR, sets: { chest: 4 } }];
    const kept = { dayIndex: 0, trained: countedTraining(log, now, (e) => e.dayId === '1') };
    expect(resolveNextDay({ state, days, trained: countedTraining(log, now), now, kept })).toMatchObject({ dayIndex: 1, deferred: [0] });
  });
  it('every day resting: Train anyway offers the most rested day, never the one just trained, and names the muscles', () => {
    const trained = { chest: now - 40 * HOUR, quads: now - HOUR, back: now - 20 * HOUR };
    const r = resolveNextDay({ state: { ...state, pendingDayIndices: [1, 0, 2] }, days, trained, now });
    expect(r).toMatchObject({ dayIndex: null, pendingDayIndices: [1, 0, 2], anywayIndex: 0, eligibleAt: now + 8 * HOUR, resting: { muscles: ['chest'], trainedAt: now - 40 * HOUR } });
    // Same rest everywhere: the next day in order.
    const even = resolveNextDay({ state, days, trained: { chest: now - HOUR, quads: now - HOUR, back: now - HOUR }, now });
    expect(even.anywayIndex).toBe(0);
  });
});

describe('recovery words', () => {
  it('names the muscles and says when in plain words, never a clock time', () => {
    const at = new Date(2026, 10, 13, 9).getTime(); // Friday 9 AM
    const r = resolveNextDay({ state: { nextDayIndex: 0, doneDays: [], pendingDayIndices: [0] }, days, trained: { chest: at, 'front delts': at }, now });
    expect(restingWords(r, now)).toEqual({ trained: 'Chest and shoulders trained yesterday.', ready: 'Ready tomorrow morning.', title: 'Time to recover', line: 'Chest and shoulders trained yesterday. Rest today, and your next workout keeps its place.' });
    // Truth pass (critic r3 15): right after today's workout nobody is told "Time to recover… Rest today": the day is done, and the next one says when it is ready.
    const today = resolveNextDay({ state: { nextDayIndex: 0, doneDays: [], pendingDayIndices: [0] }, days, trained: { chest: at, 'front delts': at, quads: now - HOUR }, now });
    expect(today.trainedToday).toBe(true);
    expect(r.trainedToday).toBeUndefined();
    expect(restingWords(today, now)).toEqual({ trained: 'Chest and shoulders trained yesterday.', ready: 'Ready tomorrow morning.', title: 'Done for today', line: 'Chest and shoulders trained yesterday. Your next workout keeps its place.' });
    expect(restingWords(today, now)!.line).not.toMatch(/Rest today|recover/i);
    expect(restingWords(resolveNextDay({ state, days, trained: {}, now }), now)).toBeNull();
  });
  it('says later today, tomorrow or the weekday with the part of the day', () => {
    expect(readyWords(now + 2 * HOUR, now)).toBe('this evening');
    expect(readyWords(new Date(2026, 10, 15, 14).getTime(), now)).toBe('tomorrow afternoon');
    expect(readyWords(new Date(2026, 10, 16, 8).getTime(), now)).toBe('Monday morning');
    expect(readyWords(new Date(2026, 10, 14, 11).getTime(), new Date(2026, 10, 14, 7).getTime())).toBe('later this morning');
    expect(/\d/.test(readyWords(now + 30 * HOUR, now))).toBe(false);
  });
});

describe('fixed and weekly days mean something (critic MAJOR 6)', () => {
  const sat = now; // Saturday Nov 14 2026, 6 PM
  const mon = new Date(2026, 10, 16, 9).getTime();
  const tue = new Date(2026, 10, 17, 9).getTime();
  const startOf = (y: number, m: number, d: number) => new Date(y, m, d).getTime();
  it('a fixed Mon/Wed/Fri plan on a Saturday is a rest day, and the next training day is Monday', () => {
    expect(restDayOf('fixed', ['mon', 'wed', 'fri'], sat)).toEqual({ nextAt: startOf(2026, 10, 16) });
    expect(restDayWords(restDayOf('fixed', ['mon', 'wed', 'fri'], sat), 1, sat)).toEqual({ title: 'Rest day', next: 'Next: Mon, Day 1' });
    expect(restDayOf('fixed', ['mon', 'wed', 'fri'], mon)).toBeNull();
    expect(restDayWords(restDayOf('fixed', ['mon', 'wed', 'fri'], tue), 2, tue)).toEqual({ title: 'Rest day', next: 'Next: tomorrow, Day 2' });
  });
  it('PLAN 3.6g2: a training day whose workout is finished is done for today, with the next training day (the same weekday next week when it is the only one)', () => {
    expect(restDayOf('fixed', ['mon', 'wed', 'fri'], mon, true)).toEqual({ nextAt: startOf(2026, 10, 18), done: true });
    expect(restDayWords(restDayOf('fixed', ['mon', 'wed', 'fri'], mon, true), 2, mon)).toEqual({ title: 'Done for today', next: 'Next: Wed, Day 2', start: 'Train again today' });
    expect(restDayWords(restDayOf('fixed', ['mon', 'tue'], mon, true), 2, mon)).toEqual({ title: 'Done for today', next: 'Next: tomorrow, Day 2', start: 'Train again today' });
    expect(restDayOf('fixed', ['mon'], mon, true)).toEqual({ nextAt: startOf(2026, 10, 23), done: true });
    // A rest day stays a rest day whether or not something was trained.
    expect(restDayOf('fixed', ['mon', 'wed', 'fri'], sat, true)).toEqual({ nextAt: startOf(2026, 10, 16) });
    expect(restDayOf('flexible', ['mon'], mon, true)).toBeNull();
  });
  it('no days to go by is never a rest day: flexible, a fixed plan with no weekdays, a weekly week not answered', () => {
    expect(restDayOf('flexible', ['mon'], sat)).toBeNull();
    expect(restDayOf('fixed', [], sat)).toBeNull();
    expect(restDayOf('weekly', undefined, sat)).toBeNull();
    expect(restDayWords(null, 1, sat)).toBeNull();
  });
  it('a weekly schedule only knows this week: after its last day the next one is not claimed', () => {
    expect(restDayOf('weekly', ['mon', 'thu'], tue)).toEqual({ nextAt: startOf(2026, 10, 19) });
    expect(restDayOf('weekly', ['mon', 'thu'], sat)).toEqual({});
    expect(restDayWords({}, 3, sat)).toEqual({ title: 'Rest day', next: 'Day 3 is next' });
  });
  it('only today and the days after it can be picked; days already past stay as they were saved', () => {
    expect(weekdaysLeft(sat)).toEqual(['sat', 'sun']);
    expect(weekdaysLeft(mon)).toEqual(['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun']);
    expect(weekChoice(['mon', 'sun', 'sat'], undefined, sat)).toEqual(['sat', 'sun']);
    const saved = { weekKey: weekKey(sat), weekdays: ['mon', 'wed', 'sat'] as const, answeredAt: 1 };
    expect(weekChoice(['sun'], { ...saved, weekdays: [...saved.weekdays] }, sat)).toEqual(['mon', 'wed', 'sun']);
    // Last week's days are not this week's.
    expect(weekChoice(['sun'], { weekKey: '2026-11-02', weekdays: ['mon'], answeredAt: 1 }, sat)).toEqual(['sun']);
  });
  it('the weekly question does not open by itself straight after the intake late in the week, and does from Monday', () => {
    const answers = { scheduleStyle: 'weekly' as const };
    expect(asksWeeklySchedule({ answers, saved: undefined, now: sat, intakeDoneAt: sat - 60_000, planDays: 4 })).toBe(false);
    expect(asksWeeklySchedule({ answers, saved: undefined, now: mon, intakeDoneAt: sat - 60_000, planDays: 4 })).toBe(true);
    // Early in the week there is room for the plan's days: it asks right away.
    expect(asksWeeklySchedule({ answers, saved: undefined, now: tue, intakeDoneAt: tue - 60_000, planDays: 4 })).toBe(true);
    // Not a fresh intake: it asks whenever the week is not answered. Answered: never again that week.
    expect(asksWeeklySchedule({ answers, saved: undefined, now: sat, intakeDoneAt: sat - 30 * 86_400_000, planDays: 4 })).toBe(true);
    expect(asksWeeklySchedule({ answers, saved: { weekKey: weekKey(sat), weekdays: ['sat'], answeredAt: sat }, now: sat, planDays: 4 })).toBe(false);
    expect(asksWeeklySchedule({ answers: { scheduleStyle: 'flexible' }, saved: undefined, now: mon, planDays: 4 })).toBe(false);
  });
  it('the sheet says the plan\'s number of days and what was picked against it', () => {
    expect(weekPickWords(4, 0)).toBe('Your plan has 4 days. Pick up to 4.');
    expect(weekPickWords(4, 4)).toBe('Your plan has 4 days. You picked all 4.');
    expect(weekPickWords(4, 2)).toBe('Your plan has 4 days. You picked 2: the rest wait for next week.');
    expect(weekPickWords(4, 5)).toBe('Your plan has 4 days. You picked 5: the plan starts over after Day 4.');
  });
});
