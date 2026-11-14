// PLAN 3.6f round 2 (critic BLOCKER 3, MAJOR 5): which work counts for the 48 hour rule, the kept
// day, "Train anyway" and the recovery words. Written from the PLAN and the critic's cases.
import { describe, expect, it } from 'vitest';
import { countedTraining, RECOVERY_MIN_SETS, type TrainingEntry } from '../recovery';
import { resolveNextDay } from '../schedule';
import { readyWords, restingWords } from '../scheduleWords';
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
    expect(restingWords(r, now)).toEqual({ trained: 'Chest and shoulders trained yesterday.', ready: 'Ready tomorrow morning.' });
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
