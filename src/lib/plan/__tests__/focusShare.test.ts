// PLAN 3.6f round 3 (critic 5): how overlapping picks share sets, decided in one place.
import { describe, expect, it } from 'vitest';
import { curateFocus, type FocusMove } from '../focus';
import { focusShare, RIDERS } from '../focusShare';
import { readFocusReport } from '../focusMetadata';

const move = (id: string, sets: number, picks: FocusMove['picks'], muscles: string[] = ['back']): FocusMove => ({ id, key: id, sets, hard: true, compound: false, muscles, picks });
const row = move('row', 4, ['back', 'upper_back', 'posture']);
const pulldown = move('pulldown', 3, ['back', 'lats']);
const fly = move('rear fly', 3, ['shoulders', 'rear_delts', 'posture'], ['rear delts']);
const curl = move('wrist curl', 2, ['arms', 'forearms', 'grip'], ['forearms']);

describe('focusShare: a goal that rides on other muscles never counts their sets twice', () => {
  it('only posture and grip ride; a muscle pick always shows its own sets', () => {
    expect([...RIDERS]).toEqual(['posture', 'grip']);
    expect(focusShare('back', ['back', 'posture'], [[row, pulldown]])).toBeNull();
    expect(focusShare('lats', ['lats', 'upper_back'], [[row, pulldown]])).toBeNull();
  });
  it('posture with Back picked: the rows are shared, the rear shoulder work is its own', () => {
    expect(focusShare('posture', ['back', 'posture'], [[row, pulldown], [fly]])).toEqual({ coveredBy: ['back'], shared: 4 });
    // Back and Rear shoulders both picked: every posture set is shown under one of them.
    expect(focusShare('posture', ['posture', 'rear_delts', 'back'], [[row, pulldown], [fly]])).toEqual({ coveredBy: ['rear_delts', 'back'], shared: 7 });
    // Nothing it rides on is picked: nothing is shared.
    expect(focusShare('posture', ['posture', 'quads'], [[row], [fly]])).toBeNull();
    // Another rider is never an owner; mobility neither.
    expect(focusShare('grip', ['posture', 'grip', 'mobility'], [[curl]])).toBeNull();
    expect(focusShare('grip', ['grip', 'forearms'], [[curl]])).toEqual({ coveredBy: ['forearms'], shared: 2 });
  });
  it('the report carries it, a set shared by two picks is charged once, and a saved report reads back', () => {
    const days = [[row, pulldown], [move('squat', 3, [], ['quads']), move('calf', 3, [], ['calves'])]];
    const out = curateFocus({ picks: ['back', 'posture'], days, candidates: [[move('face pull', 3, ['posture', 'rear_delts', 'shoulders'], ['rear delts'])], []], cap: 4, budgetMinutes: 60, minutes: (d) => d.reduce((n, m) => n + m.sets * 2, 0) });
    const [back, posture] = out.report.priorities;
    expect(posture!.coveredBy).toEqual(['back']);
    expect(posture!.shared).toBe(out.days.flat().filter((m) => m.picks.includes('posture') && m.picks.includes('back')).reduce((n, m) => n + m.sets, 0));
    expect(back!.coveredBy).toBeUndefined();
    // Each physical set once: the budget spent is the focused sets above the same days with no picks.
    const focused = (ds: FocusMove[][]) => ds.flat().reduce((n, m) => n + (m.picks.some((p) => p === 'back' || p === 'posture') ? m.sets : 0), 0);
    expect(out.report.spent).toBe(focused(out.days) - focused(days));
    expect(out.report.spent).toBeLessThanOrEqual(8);
    expect(readFocusReport(JSON.parse(JSON.stringify({ ...out.report, dayLead: ['back', null] })))).toEqual({ ...out.report, dayLead: ['back', null] });
    // Junk in the new fields is refused, and a report from before round 3 (no dayLead, no coveredBy) still reads.
    expect(readFocusReport({ ...out.report, dayLead: ['nope'] })).toBeUndefined();
    expect(readFocusReport({ ...out.report, priorities: [{ ...posture, coveredBy: ['x'] }] })).toBeUndefined();
    const old = { budget: 8, spent: 3, days: [[]], priorities: [{ id: 'back', requested: 4, extra: 3, total: 12, shortfall: false }] };
    expect(readFocusReport(old)).toEqual(old);
  });
});
