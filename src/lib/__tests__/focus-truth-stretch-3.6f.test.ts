// PLAN 3.6f truth pass, point 3 (third critique, item 3): Mobility says a true, useful thing or
// nothing. Words only: the stretch minutes in the data are the real ones and are not changed here.
import { describe, expect, it } from 'vitest';
import { generate } from '../../data/generator';
import { definitionPlan } from '../../data/plans';
import { focusFit } from '../intake/focusFit';
import type { IntakeAnswers } from '../intake/funnel';
import { generatorInputOf } from '../intake/yourPlan';
import { focusStateOf, stretchBlock } from '../plan/focus';
import { profileFor } from '../../data/order';
import { isCompound } from '../order';
import { estimateDayMinutes, stretchMinutes } from '../plans';
import { focusDayLine, focusLine, focusRow, stretchBlockLabel } from '../plan/focusWords';

const base: IntakeAnswers = { goals: ['muscle'], experience: '3y', place: 'full', style: 'mix', cardio: 'little', scheduleStyle: 'flexible' };
function reveal(a: IntakeAnswers) {
  const r = generate(generatorInputOf(a));
  if (!r.ok) throw new Error(r.reason);
  const report = r.applied.focusReport!;
  const fit = focusFit(a, report, (x) => { const y = generate(generatorInputOf(x)); return y.ok ? y.applied.focusReport : undefined; });
  return { r, report, fit, plan: definitionPlan(r.plan)!, mobility: report.priorities.find((p) => p.id === 'mobility')! };
}

describe('critic 3: Mobility only, 3 days, every minutes choice', () => {
  // PLAN 3.6g: Mobility is a block or nothing. At 45 and 60 min the lifts take the minutes chosen, so
  // work no pick asks for makes the room (sets first, then a small move's place); at 75 the time is free.
  for (const minutes of [45, 60] as const) it(`${minutes} min: every session ends with a real stretch block, traded for sets no pick asks for: never "2 min · Stretches", never "no room", never over the minutes`, () => {
    const x = reveal({ ...base, days: 3, minutes, focusPicks: ['mobility'] });
    const none = generate(generatorInputOf({ ...base, days: 3, minutes, focusPicks: [] }));
    if (!none.ok) throw new Error(none.reason);
    expect(x.mobility.session).toBeGreaterThanOrEqual(5);
    expect(x.mobility.session).toBeLessThanOrEqual(8);
    expect(x.mobility).toMatchObject({ state: 'extra', shortfall: false });
    expect(stretchBlock(x.mobility)).toBe(true);
    expect(x.mobility.minutes).toBe(x.report.dayExtra!.flat().reduce((n, e) => n + (e.minutes ?? 0), 0));
    expect(focusRow(x.mobility)).toEqual({ name: 'Mobility', amount: `${x.mobility.minutes} min`, tag: null, detail: 'Stretches' });
    for (const [i, d] of x.plan.days.entries()) {
      const last = d.blocks.at(-1)!;
      expect(last.mobility).toBe(true);
      expect(d.blocks.filter((b) => b.mobility)).toHaveLength(1);
      expect(last.items.map((it) => it.exerciseId)).toEqual(['static-quadricep-stretch', 'static-proximal-hamstring-stretch', 'static-pigeon-stretch']);
      const held = stretchMinutes(last);
      expect([5, 6, 8]).toContain(held);
      expect(d.focusWhy).toEqual([`Extra today: ${held} min of stretches`]);
      expect(estimateDayMinutes(d)).toBeLessThanOrEqual(minutes);
      // What made the room: sets from moves of the same day (every big lift is still there, the first two with 3 sets or more, no move under 2), at most one small move gone, never under 4 lifts.
      const setsOf = (blocks: typeof none.plan.days[number]['blocks']) => new Map(blocks.flatMap((b) => (b.type === 'superset' ? b.items : [b]).map((it) => [it.id, b.sets!] as const)));
      const was = setsOf(none.plan.days[i]!.blocks), now = setsOf(x.r.plan.days[i]!.blocks.filter((b) => !(b.type === 'superset' && b.items.some((it) => it.id.includes('stretch')))));
      const gone = [...was.keys()].filter((id) => !now.has(id));
      expect(gone.length).toBeLessThanOrEqual(1);
      for (const id of gone) expect(isCompound(profileFor(id)), id).toBe(false);
      expect(now.size).toBeGreaterThanOrEqual(4);
      for (const [id, sets] of now) { expect(sets, id).toBeGreaterThanOrEqual(2); expect(sets, id).toBeLessThanOrEqual(was.get(id) ?? 0); }
      const given = [...now].reduce((n, [id, sets]) => n + was.get(id)! - sets, 0);
      expect(given).toBeLessThanOrEqual(4);
      const big = [...now.keys()].filter((id) => isCompound(profileFor(id)));
      for (const id of big.slice(0, 2)) expect(now.get(id)!, id).toBeGreaterThanOrEqual(3);
    }
    // Nothing more is asked for.
    expect(x.fit).toBeNull();
  });
  it('20 and 30 min: a short session never trades lifting for stretches; the row says so and the one step offered really brings the block', () => {
    for (const minutes of [20, 30] as const) {
      const x = reveal({ ...base, days: 3, minutes, focusPicks: ['mobility'] });
      expect(x.mobility.session).toBe(0);
      expect(x.plan.days.flatMap((d) => d.blocks).some((b) => b.mobility || b.items.some((it) => it.exerciseId.includes('stretch')))).toBe(false);
      expect(focusRow(x.mobility)).toEqual({ name: 'Mobility', amount: null, tag: null, detail: 'No room for a stretch block in these sessions yet' });
      expect(focusLine(x.mobility, 'every 3 workouts')).toEqual(['Mobility', 'no room for a stretch block in these sessions yet']);
      for (const d of x.plan.days) expect(d.focusWhy ?? []).toEqual([]);
      // No box blames the minutes ("too short"). The one step offered is the one that really brings the block.
      expect(x.fit?.line).toMatch(/^Mobility fits best with \d+ min\.$/);
      const after = reveal({ ...base, days: 3, minutes: x.fit!.minutes!, focusPicks: ['mobility'] });
      expect(stretchBlock(after.mobility)).toBe(true);
      expect(after.fit).toBeNull();
    }
  });
  it('75 min: every session ends with a real stretch block, counted in its minutes and said as minutes', () => {
    const x = reveal({ ...base, days: 3, minutes: 75, focusPicks: ['mobility'] });
    expect(x.mobility).toMatchObject({ session: 8, minutes: 24, state: 'extra', shortfall: false });
    expect(x.mobility.minutes).toBe(x.report.dayExtra!.flat().reduce((n, e) => n + (e.minutes ?? 0), 0));
    expect(focusRow(x.mobility)).toEqual({ name: 'Mobility', amount: '24 min', tag: null, detail: 'Stretches' });
    expect(focusLine(x.mobility, 'every 3 workouts')).toEqual(['Mobility', '24 min of stretches every 3 workouts']);
    const none = generate(generatorInputOf({ ...base, days: 3, minutes: 75, focusPicks: [] }));
    if (!none.ok) throw new Error(none.reason);
    for (const [i, d] of x.plan.days.entries()) {
      expect(d.focusWhy).toEqual(['Extra today: 8 min of stretches']);
      // The block is the last thing in the session: the three sure floor stretches, each held twice, back to back.
      const last = d.blocks.at(-1)!;
      expect(last.mobility).toBe(true);
      expect(last.items.map((it) => it.exerciseId)).toEqual(['static-quadricep-stretch', 'static-proximal-hamstring-stretch', 'static-pigeon-stretch']);
      expect([last.sets, last.restSec, ...last.items.map((it) => it.seconds)]).toEqual([2, 0, [80, 80], [80, 80], [80, 80]]);
      expect(d.blocks.filter((b) => b.mobility)).toHaveLength(1);
      // The plan day's card for it says the minutes (the holds, without the change to it).
      expect(stretchBlockLabel(stretchMinutes(last))).toBe('Stretches · 8 min, back to back');
      // Counted by the one time estimate, inside the minutes chosen: 8 minutes of holds and the change to the block.
      const minutes = estimateDayMinutes(d);
      expect(minutes).toBe(x.r.applied.minutes[i]);
      expect(minutes).toBeLessThanOrEqual(75);
      expect(minutes - estimateDayMinutes({ ...d, blocks: d.blocks.slice(0, -1) })).toBe(9);
      // The stretches took free time only: every move the same answers get with no picks is still there, with no fewer sets.
      const setsOf = (blocks: typeof none.plan.days[number]['blocks']) => new Map(blocks.flatMap((b) => (b.type === 'superset' ? b.items : [b]).map((it) => [it.id, b.sets] as const)));
      const now = setsOf(x.r.plan.days[i]!.blocks);
      for (const [id, sets] of setsOf(none.plan.days[i]!.blocks)) expect(now.get(id) ?? 0, id).toBeGreaterThanOrEqual(sets);
    }
    expect(x.fit).toBeNull();
  });
  it('with other picks the day line keeps the sets and drops the token minute; Mobility never blocks the fix for the others', () => {
    const x = reveal({ ...base, days: 4, minutes: 45, focusPicks: ['lats', 'side_delts', 'mobility'] });
    // A day line names stretches only from a real block (5 minutes or more), on the days that end with one.
    for (const d of x.plan.days) {
      const said = /(\d+) min of stretches/.exec((d.focusWhy ?? []).join(' '));
      expect(!!said).toBe(d.blocks.some((b) => b.mobility));
      if (said) expect(Number(said[1])).toBeGreaterThanOrEqual(5);
    }
    expect(x.plan.days.some((d) => d.focusWhy?.length)).toBe(true);
    // The ranked picks had their call first: the block never costs them a set.
    const alone = reveal({ ...base, days: 4, minutes: 45, focusPicks: ['lats', 'side_delts'] });
    for (const p of alone.report.priorities) expect(x.report.priorities.find((q) => q.id === p.id)!.extra, p.id).toBe(p.extra);
    // Lats and Side shoulders are still offered their real fix, and after it nothing is asked for Mobility.
    if (x.fit) {
      expect(x.fit.line).not.toMatch(/Mobility|stretch/);
      const tap = { ...(x.fit.days ? { days: x.fit.days } : {}), ...(x.fit.minutes && (x.fit.both || !x.fit.days) ? { minutes: x.fit.minutes } : {}) };
      if (x.fit.days || x.fit.minutes) { const after = reveal({ ...base, days: 4, minutes: 45, focusPicks: ['lats', 'side_delts', 'mobility'], ...tap }); expect(after.fit?.days ?? after.fit?.minutes).toBeUndefined(); }
    }
  });
});

describe('at or above the minimum the minutes are said; a plan saved before the truth pass reads the same way', () => {
  it('a five minute block in a session is delivered and named', () => {
    const block = { id: 'mobility' as const, requested: 0, extra: 0, total: 0, minutes: 10, session: 5, shortfall: false };
    expect(focusStateOf(block)).toBe('extra');
    expect(focusRow(block)).toEqual({ name: 'Mobility', amount: '10 min', tag: null, detail: 'Stretches' });
    expect(focusDayLine([{ id: 'mobility', extra: 0, minutes: 5 }])).toBe('Extra today: 5 min of stretches');
  });
  it('a saved report that called 2 minutes "extra" is read as no stretch block, and its saved day line is recomposed without the minute', () => {
    const old = { id: 'mobility' as const, requested: 0, extra: 0, total: 0, minutes: 2, shortfall: false, state: 'extra' as const };
    expect(focusStateOf(old)).toBe('short');
    expect(focusRow(old).detail).toBe('No room for a stretch block in these sessions yet');
    // The plan as it was saved: the day lines were written into the days at build time.
    // (Built at 75 min, where the plan has stretches; then set back to what such a plan held before the truth pass: a minute a day.)
    const r = generate(generatorInputOf({ ...base, days: 3, minutes: 75, focusPicks: ['lats', 'mobility'] }));
    if (!r.ok) throw new Error(r.reason);
    const saved = structuredClone(r.plan) as unknown as { days: Array<{ focusWhy?: string[] }>; focusReport: { priorities: Array<Record<string, unknown>>; dayExtra: Array<Array<{ id: string; minutes?: number }>> } };
    const at = saved.focusReport.dayExtra.findIndex((d) => d.some((e) => e.id === 'mobility'));
    expect(at).toBeGreaterThanOrEqual(0);
    saved.days[at]!.focusWhy = ['Extra today: 1 min of stretches'];
    for (const d of saved.focusReport.dayExtra) for (const e of d) if (e.id === 'mobility') e.minutes = 1;
    for (const p of saved.focusReport.priorities) if (p.id === 'mobility') { delete p.session; p.minutes = 2; p.state = 'extra'; p.shortfall = false; }
    const plan = definitionPlan(saved as never)!;
    expect(plan.focusReport).toBeDefined();
    expect((plan.days[at]!.focusWhy ?? []).join(' ')).not.toContain('stretch');
    expect(focusRow(plan.focusReport!.priorities.find((p) => p.id === 'mobility')!).amount).toBeNull();
  });
});
