// PLAN 3.6j (audit A9): on a week to week schedule only this week's chosen days are known, so
// "Missed N workouts" counts only days of this week. Last week's days are not stored: nothing is
// said about them.
import { describe, expect, it } from 'vitest';
import { candidates, missedWorkouts } from '../../coach';

const at = (d: number, h = 9) => new Date(2026, 10, d, h).getTime();
const base = { lifts: [], changes: [], closed: new Set<string>(), autoLevelUp: false, activeWorkout: false };

describe('A9: missed workouts on a week to week schedule', () => {
  it('the audit case: last workout Thu Nov 12, now Wed Nov 18, picks Fri, Sat, Sun: nothing missed', () => {
    const now = at(18);
    const weekly = { scheduleStyle: 'weekly' as const, daysPerWeek: 3, weekdays: ['fri', 'sat', 'sun'] };
    const { cards } = candidates({ ...base, now, dates: [at(12, 18)], plan: weekly });
    expect(cards.find((c) => c.kind === 'missed_days')).toBeUndefined();
  });
  it('counts this week\'s chosen days that went by, never last week\'s', () => {
    const now = at(20); // Fri Nov 20; this week Mon 16 .. Sun 22
    const weekly = { scheduleStyle: 'weekly' as const, daysPerWeek: 3, weekdays: ['mon', 'tue', 'wed'] };
    const { cards } = candidates({ ...base, now, dates: [at(10, 18)], plan: weekly });
    // Mon, Tue, Wed of this week went by; Mon 9 .. Sun 15 of last week are not known.
    expect(cards.find((c) => c.kind === 'missed_days')).toMatchObject({ missed: 3, title: 'Missed 3 workouts' });
  });
  it('missedWorkouts leaves out days before `from`', () => {
    const now = at(18);
    expect(missedWorkouts({ last: at(9, 18), now, weekdays: ['mon', 'tue'], daysPerWeek: 2 })).toBe(3); // Tue 10, Mon 16, Tue 17
    expect(missedWorkouts({ last: at(9, 18), now, weekdays: ['mon', 'tue'], daysPerWeek: 2, from: new Date(2026, 10, 16).getTime() })).toBe(2);
  });
  it('the same days each week still counts every week (their days are known)', () => {
    const now = at(18);
    const fixed = { scheduleStyle: 'fixed' as const, daysPerWeek: 3, weekdays: ['mon', 'wed', 'fri'] };
    const { cards } = candidates({ ...base, now, dates: [at(9, 18)], plan: fixed });
    // Wed 11, Fri 13, Mon 16.
    expect(cards.find((c) => c.kind === 'missed_days')).toMatchObject({ missed: 3 });
  });
});
