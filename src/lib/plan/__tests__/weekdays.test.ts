import { describe, expect, it } from 'vitest';
import { addWeekday, cleanWeekdays, fixedDaysAsk, fixedDaysOf, fixedPickWords, fixedScheduleHolds, freeWeekdays } from '../weekdays';
import { canContinue } from '../../intake/funnel';

describe('a fixed schedule has one weekday for each plan day (critic 2)', () => {
  it('the invariant: only a fixed schedule is counted, and only the exact number holds', () => {
    expect(fixedScheduleHolds('fixed', ['mon', 'thu'], 2)).toBe(true);
    expect(fixedScheduleHolds('fixed', ['mon', 'thu'], 3)).toBe(false);
    expect(fixedScheduleHolds('fixed', ['mon', 'thu', 'sat', 'sun'], 3)).toBe(false);
    expect(fixedScheduleHolds('fixed', undefined, 3)).toBe(false);
    expect(fixedScheduleHolds('flexible', ['mon'], 3)).toBe(true);
    expect(fixedScheduleHolds('weekly', [], 3)).toBe(true);
    // Repeats and junk are not days.
    expect(fixedScheduleHolds('fixed', ['mon', 'mon', 'x'], 2)).toBe(false);
  });
  it('repair on read: says what is off, changes and guesses nothing', () => {
    expect(fixedDaysOf('fixed', ['thu', 'mon'], 2)).toBeNull();
    expect(fixedDaysOf('flexible', ['mon'], 4)).toBeNull();
    expect(fixedDaysOf('fixed', ['thu', 'mon'], 3)).toEqual({ weekdays: ['mon', 'thu'], planDays: 3, missing: 1, extra: 0 });
    expect(fixedDaysOf('fixed', ['mon', 'tue', 'wed', 'thu'], 3)).toEqual({ weekdays: ['mon', 'tue', 'wed', 'thu'], planDays: 3, missing: 0, extra: 1 });
    expect(fixedDaysOf('fixed', [], 3)).toMatchObject({ missing: 3 });
  });
  it('adding a day keeps Monday first and never repeats; the free days are the rest', () => {
    expect(addWeekday(['mon', 'thu'], 'tue')).toEqual(['mon', 'tue', 'thu']);
    expect(addWeekday(['mon', 'thu'], 'mon')).toEqual(['mon', 'thu']);
    expect(freeWeekdays(['mon', 'thu'])).toEqual(['tue', 'wed', 'fri', 'sat', 'sun']);
    expect(cleanWeekdays(['sun', 'nope', 'mon', 'sun'])).toEqual(['mon', 'sun']);
  });
  it('the words', () => {
    expect(fixedDaysAsk(fixedDaysOf('fixed', ['mon', 'thu'], 3)!)).toBe('Pick 1 more day');
    expect(fixedDaysAsk(fixedDaysOf('fixed', ['mon'], 3)!)).toBe('Pick 2 more days');
    expect(fixedDaysAsk(fixedDaysOf('fixed', [], 3)!)).toBe('Pick 3 days');
    expect(fixedDaysAsk(fixedDaysOf('fixed', ['mon', 'tue', 'wed'], 2)!)).toBe('Take 1 day away');
    expect(fixedPickWords(3, 2)).toBe('Your plan has 3 days. Pick 1 more.');
    expect(fixedPickWords(3, 0)).toBe('Your plan has 3 days. Pick 3.');
    expect(fixedPickWords(3, 3)).toBe('Your plan has 3 days. You picked all 3.');
    expect(fixedPickWords(3, 4)).toBe('Your plan has 3 days. Take 1 away.');
  });
  it('the intake never continues on a fixed schedule with another number of weekdays than days', () => {
    expect(canContinue('weekdays', { scheduleStyle: 'fixed', days: 3, weekdays: ['mon', 'thu'] })).toBe(false);
    expect(canContinue('weekdays', { scheduleStyle: 'fixed', days: 3, weekdays: ['mon', 'thu', 'sat'] })).toBe(true);
    expect(canContinue('weekdays', { scheduleStyle: 'fixed', days: 3, weekdays: ['mon', 'tue', 'thu', 'sat'] })).toBe(false);
    expect(canContinue('weekdays', { scheduleStyle: 'flexible', days: 3 })).toBe(true);
  });
});
