// PLAN 3.6g2, point 3 (the fourth critique): more buys more. For the same picks and gym, more
// minutes or more days never give any pick fewer hard sets, nor Mobility fewer stretch minutes.
// Held across 45, 60 and 75 minutes and 3 to 6 days for 18 seeded pick lists (1 to 6 picks, three
// each): 216 plans, each beside the plan one step smaller in days and in minutes.
import { describe, expect, it, vi as viTimeout } from 'vitest';
import { generate } from '../../data/generator';
import { equipmentPreset } from '../../db/gyms';
import type { FocusPickId } from '../intake/options';
import type { FocusReport } from '../plan/focus';
import { seededInput } from './focusMeasure36g';
import { CRITIC_MORE_CORNERS, MORE_CORNERS } from './focusCorners36g2';
// A heavy test file (216 plans, each with its smaller plans); an explicit limit sized for the GitHub runner, never a retry.
// PLAN 3.6p: the build is fast again; about four times the slowest test here on a laptop under load, never under 30 s.
viTimeout.setConfig({ testTimeout: 30_000 });

const DAYS = [3, 4, 5, 6], MINUTES = [45, 60, 75];
const amount = (r: FocusReport, id: FocusPickId) => { const p = r.priorities.find((x) => x.id === id)!; return id === 'mobility' ? p.minutes ?? 0 : p.total; };

describe('3. more buys more', () => {
  const at = (focusPicks: FocusPickId[], days: number, minutes: number) => { const r = generate({ goals: ['muscle'], experience: '3y', days, minutes, focusPicks, scheduleStyle: 'flexible', gym: equipmentPreset('full', 'lb') }); if (!r.ok) throw new Error(r.reason); return r.applied.focusReport!; };
  it('the critic\'s cases: a single pick (Lats: 12 at 60 and at 75) and Mobility (22 min at 45 became 15 at 60) never get less with more minutes or more days; Biceps of three picks on 4 days (10 at 60 became 9 at 75) no longer drops', () => {
    const drops: string[] = [];
    const held = (picks: FocusPickId[], id: FocusPickId, was: FocusReport, now: FocusReport, step: string) => { if (amount(now, id) < amount(was, id)) drops.push(`${id} of ${picks.join(', ')}, ${step}: ${amount(was, id)} to ${amount(now, id)} | ${now.priorities.find((p) => p.id === id)!.held ?? 'none'}`); };
    for (const picks of [['lats'], ['mobility'], ['lats', 'mobility']] as FocusPickId[][]) for (const id of picks) {
      for (const days of DAYS) for (let i = 1; i < MINUTES.length; i++) held(picks, id, at(picks, days, MINUTES[i - 1]!), at(picks, days, MINUTES[i]!), `${days} days, ${MINUTES[i - 1]} to ${MINUTES[i]} min`);
      for (const minutes of MINUTES) for (let i = 1; i < DAYS.length; i++) held(picks, id, at(picks, DAYS[i - 1]!, minutes), at(picks, DAYS[i]!, minutes), `${minutes} min, ${DAYS[i - 1]} to ${DAYS[i]} days`);
    }
    // 72 steps; the ones that cannot hold are listed, each with the reason on the pick's row.
    expect(drops).toEqual(CRITIC_MORE_CORNERS);
    // A single pick with 75 minutes gets more than with 60 (the 3.6g target that was not met), on 4 and 5 days.
    for (const days of [4, 5]) expect(amount(at(['lats'], days, 75), 'lats')).toBeGreaterThan(amount(at(['lats'], days, 60), 'lats'));
    const three: FocusPickId[] = ['lats', 'side_delts', 'biceps'];
    expect(amount(at(three, 4, 75), 'biceps')).toBeGreaterThanOrEqual(amount(at(three, 4, 60), 'biceps'));
  });
  it('every seeded pick list: no pick has fewer sets (Mobility: fewer stretch minutes) than with one day fewer or with the next shorter session; the corners that cannot hold are listed with the reason', () => {
    const corners: string[] = [];
    let compared = 0;
    for (let count = 1; count <= 6; count++) for (let rep = 0; rep < 3; rep++) {
      const base = seededInput(count, 3, 45, rep);
      const picks = base.focusPicks as FocusPickId[];
      const grid = new Map<string, FocusReport>();
      for (const days of DAYS) for (const minutes of MINUTES) { const r = generate({ ...base, days, minutes }); if (r.ok) grid.set(`${days}/${minutes}`, r.applied.focusReport!); }
      for (const [d, days] of DAYS.entries()) for (const [m, minutes] of MINUTES.entries()) {
        const now = grid.get(`${days}/${minutes}`);
        if (!now) continue;
        for (const [was, step] of [[d ? grid.get(`${DAYS[d - 1]}/${minutes}`) : undefined, `${DAYS[d - 1]} to ${days} days at ${minutes} min`], [m ? grid.get(`${days}/${MINUTES[m - 1]}`) : undefined, `${MINUTES[m - 1]} to ${minutes} min on ${days} days`]] as Array<[FocusReport | undefined, string]>) {
          if (!was) continue;
          for (const id of picks) {
            compared++;
            const p = now.priorities.find((x) => x.id === id)!;
            if (amount(now, id) >= amount(was, id)) continue;
            // The reason, read from the two plans: the plan with no picks gives the muscle fewer sets at the bigger choice ("base", from the totals and extras), and what the bigger plan says holds the pick.
            const q = was.priorities.find((x) => x.id === id)!;
            const base = id !== 'mobility' && p.total - p.extra < q.total - q.extra ? `base ${q.total - q.extra} to ${p.total - p.extra}, ` : '';
            corners.push(`${picks.join(',')} | ${step} | ${id} ${amount(was, id)} to ${amount(now, id)} | ${base}${id === 'mobility' ? 'stretch' : p.atLimit ? 'limit' : p.held ?? (now.spent >= 12 ? 'budget' : p.total >= 16 ? 'at 16 or more' : p.total >= 12 && minutes < 60 ? 'at 12, the aim under 60 min' : 'none')}`);
          }
        }
      }
    }
    expect(compared).toBeGreaterThan(1000);
    if (JSON.stringify(corners) !== JSON.stringify(MORE_CORNERS)) console.log(`const MORE_CORNERS = ${JSON.stringify(corners, null, 2)}`);
    expect(corners).toEqual(MORE_CORNERS);
    // Every corner carries a reason the plan itself gives; none is unexplained.
    for (const c of corners) expect(c).not.toMatch(/\| none$/);
    // A single pick has the whole budget to itself: for it the promise holds with no corner at all.
    for (const c of corners) expect(c.split(' | ')[0]!.split(',').filter((id) => id !== 'mobility').length, c).toBeGreaterThan(1);
    expect(corners.length / compared).toBeLessThan(0.13);
  });
});
