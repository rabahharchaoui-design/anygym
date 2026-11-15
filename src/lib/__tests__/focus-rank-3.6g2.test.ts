// PLAN 3.6g2, points 1 and 2 (the fourth critique, reports/critic-3.6g.md): the strict rank and
// "plenty means 16", held over the seeded intakes of the 3.6g targets (a full gym, 45 minutes and
// up, 3 to 6 days; 396 plans with picks) and on the critic's own cases.
import { describe, expect, it, vi as viTimeout } from 'vitest';
import { generate } from '../../data/generator';
import { equipmentPreset } from '../../db/gyms';
import type { FocusPickId } from '../intake/options';
import { focusName, type FocusReport, type FocusResult } from '../plan/focus';
import { focusLine, focusRow } from '../plan/focusWords';
import { samples, type Sample } from './focusMeasure36g';
import { TOP_CORNERS } from './focusCorners36g2';
// A heavy test file (about 800 plans built once, then read); an explicit limit sized for the GitHub runner, never a retry.
viTimeout.setConfig({ testTimeout: 180_000 });

const full = equipmentPreset('full', 'lb');
const critic = (focusPicks: FocusPickId[], days: number, minutes: number): FocusReport => {
  const r = generate({ goals: ['muscle'], experience: '3y', days, minutes, focusPicks, scheduleStyle: 'flexible', gym: full });
  if (!r.ok) throw new Error(r.reason);
  return r.applied.focusReport!;
};
/** The sets the 20 set limit looks at: an area's muscles each, else the pick's own count. */
const counts = (p: FocusResult): number[] => (p.parts?.length ? p.parts.map((x) => x.sets) : [p.total]);
const hardOf = (r: FocusReport) => r.priorities.filter((p) => p.id !== 'mobility');
/** Why a pick is left out of the rank: no exercise, at the 20 set limit, or every exercise for it at its most sets. Null: it counts. */
const skipped = (p: FocusResult): string | null => (p.state === 'no_move' ? 'no exercise' : p.atLimit ? 'limit' : p.held === 'maxed' ? 'maxed' : null);
/** A pick's own extra: without the sets that came with the work of a pick ranked higher (they were given to that pick). */
const own = (p: FocusResult) => p.extra - (p.rides?.extra ?? 0);
const said = (p: FocusResult) => { const row = focusRow(p); return `${row.tag ?? ''} | ${row.detail ?? ''}`; };
const key = (s: Sample) => `${s.days}d ${s.minutes}m ${s.input.focusPicks!.join(',')}`;

describe('1. strict rank: a lower pick never gets more extra than a higher pick that has an exercise', () => {
  it('the critic\'s case: Lats, Side shoulders, Biceps, Upper chest, Glutes on 5 days of 60 min (Lats got "12 sets no extra" while #4 and #5 got +3)', () => {
    const ps = critic(['lats', 'side_delts', 'biceps', 'upper_chest', 'glutes'], 5, 60).priorities;
    expect(ps[0]!.extra).toBeGreaterThanOrEqual(3);
    expect(focusRow(ps[0]!).tag).toBe(`+${ps[0]!.extra} extra`);
    for (const [i, p] of ps.entries()) if (i) expect(p.extra, p.id).toBeLessThanOrEqual(ps[i - 1]!.extra);
    // And the two pick version of it ("Lats no extra, we prioritized Side shoulders").
    const two = critic(['lats', 'side_delts'], 5, 60).priorities;
    expect(two[0]!.extra).toBeGreaterThanOrEqual(Math.max(3, two[1]!.extra));
  });
  it('every seeded intake: extras never rise down the rank among the picks that can take sets; a pick left out of the rank says why', () => {
    let pairs = 0;
    const left: Record<string, number> = {};
    for (const s of samples()) {
      const hard = hardOf(s.report);
      const open = hard.filter((p) => !skipped(p));
      for (const [i, low] of open.entries()) for (const high of open.slice(0, i)) { pairs++; expect(own(low), `${low.id} above ${high.id}: ${key(s)}`).toBeLessThanOrEqual(high.extra); }
      for (const p of hard) {
        const why = skipped(p);
        if (!why) continue;
        left[why] = (left[why] ?? 0) + 1;
        // Said on its row: "no exercises yet" or "needs equipment"; 20 sets as "plenty" or "as much as is useful now"; "its exercises are at their most sets".
        expect(said(p), `${p.id} ${key(s)}`).toMatch(why === 'no exercise' ? /no exercises yet|needs equipment/ : why === 'limit' ? /plenty|As much as is useful now|Covered by/ : /Its exercises are at their most sets|Covered by/);
        if (why === 'limit') expect(Math.max(...counts(p), p.total), `${p.id} ${key(s)}`).toBeGreaterThanOrEqual(20);
      }
      // Extra that came with a higher pick's work is said on the row, so the numbers read true.
      for (const p of hard) if (p.rides && !p.shared && !p.coveredBy) expect(said(p), `${p.id} ${key(s)}`).toMatch(/with your .+ work/);
    }
    expect(pairs).toBeGreaterThan(2000);
    expect(left.limit).toBeGreaterThan(20);
    expect(left['no exercise']).toBeGreaterThan(100);
    console.log(`strict rank: ${pairs} pairs held; left out of the rank: ${JSON.stringify(left)}`);
  });
  it('the #1 pick gets at least +3 when it has an exercise and is under 16 sets; the plans where its days cannot hold that are listed, each with the reason on its row', () => {
    const corners: string[] = [];
    let tops = 0;
    for (const s of samples()) {
      const top = hardOf(s.report).find((p) => !skipped(p));
      if (!top) continue;
      tops++;
      if (top.extra >= 3 || top.total >= 16) continue;
      // The one reason left: its days are full, also after the trades (never the rank, never the budget).
      expect(top.held, `${top.id} ${key(s)}`).toBe('room');
      if (top.extra === 0) expect(said(top), key(s)).toContain('Its days are full');
      corners.push(`${key(s)} | ${focusName(top.id)} +${top.extra}`);
    }
    expect(tops).toBeGreaterThan(350);
    if (JSON.stringify(corners) !== JSON.stringify(TOP_CORNERS)) console.log(`const TOP_CORNERS = ${JSON.stringify(corners, null, 2)}`);
    expect(corners).toEqual(TOP_CORNERS);
    // Under one plan in ten.
    expect(corners.length / tops).toBeLessThan(0.1);
  });
});

describe('2. plenty means 16: no pick under 16 sets is called plenty, or left with no extra, without the true reason', () => {
  it('the critic\'s case: Lats only on 5 days of 75 min ("13 sets plenty") climbs to 16 or more and is never plenty under 16', () => {
    const [lats] = critic(['lats'], 5, 75).priorities;
    expect(lats!.total).toBeGreaterThanOrEqual(16);
    expect(lats!.extra).toBeGreaterThanOrEqual(3);
    const at60 = critic(['lats'], 5, 60).priorities[0]!;
    expect(at60.total).toBeGreaterThanOrEqual(16);
    expect(focusRow(at60).tag).toBe(`+${at60.extra} extra`);
  });
  it('every seeded intake: "plenty" only from 16 sets (in fact only at the 20 set limit); "no extra" under 16 always comes with a reason that is true of the plan', () => {
    const reasons: Record<string, number> = {};
    for (const s of samples()) {
      const hard = hardOf(s.report);
      for (const [i, p] of hard.entries()) {
        if (p.state === 'no_move') continue;
        const row = focusRow(p), [, line] = focusLine(p, 'a week');
        if (p.state === 'plenty' || /plenty/.test(`${row.tag} ${row.detail} ${line}`)) expect(Math.max(...counts(p), p.total), `${p.id} ${key(s)}`).toBeGreaterThanOrEqual(20);
        if (row.tag !== 'no extra' && !line.includes('no extra')) continue;
        if (Math.min(...counts(p)) >= 16) continue;
        expect(p.held, `${p.id} ${key(s)}`).toBeDefined();
        reasons[p.held!] = (reasons[p.held!] ?? 0) + 1;
        expect(row.detail, `${p.id} ${key(s)}`).toMatch(/Its exercises are at their most sets|Extra work stops at 12 sets a week|No more than .+, ranked above it|Its days are full/);
        expect(line).toMatch(/, no extra: /);
        // Each reason is true of the plan.
        if (p.held === 'budget') expect(p.requested === 0 || s.report.spent >= 12, `${p.id} ${key(s)}`).toBe(true);
        if (p.held === 'rank') {
          const by = hard.findIndex((h) => h.id === p.heldBy);
          expect(by >= 0 && by < i, `${p.id} held by ${p.heldBy} ${key(s)}`).toBe(true);
          expect(hard[by]!.extra).toBeLessThanOrEqual(p.extra);
          expect(skipped(hard[by]!)).toBeNull();
          expect(row.detail).toContain(focusName(p.heldBy!));
        }
      }
    }
    expect(reasons.rank).toBeGreaterThan(50);
    expect(reasons.budget).toBeGreaterThan(50);
    console.log(`"no extra" under 16 sets, by reason: ${JSON.stringify(reasons)}`);
  });
  it('a single pick with 60 or 75 minutes ends at 16 sets or more, or at +12 (the weekly budget), or says what holds it', () => {
    const one = samples().filter((s) => s.served.length === 1 && s.minutes >= 60);
    expect(one.length).toBeGreaterThan(25);
    let there = 0;
    for (const s of one) {
      const p = s.report.priorities.find((x) => x.id === s.served[0])!;
      if (Math.min(...counts(p)) >= 16 || p.atLimit) { there++; continue; }
      expect(p.extra >= 12 || p.held !== undefined, `${p.id} ${p.total}+${p.extra} ${key(s)}`).toBe(true);
    }
    expect(there / one.length).toBeGreaterThanOrEqual(0.6);
  });
});
