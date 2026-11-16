// PLAN 3.6f round 3 (critic 4): how much of the chosen minutes and of the focus budget a built plan
// really uses, over the seeded intakes (every pick count 0 to 11, days 2 to 6, every minutes choice,
// a full gym). The numbers are printed for the session report and held by the thresholds below.
import { expect, it } from 'vitest';
import { generate } from '../../data/generator';
import { equipmentPreset } from '../../db/gyms';
import type { ExperienceId, FocusPickId, GoalId } from '../intake/options';
import { vi as viTimeout } from 'vitest';
// PLAN 3.6u: a heavy test file (slowest test about 2183 ms on a laptop; the GitHub runner is six to eight times
// slower). An explicit limit sized for the runner, never a retry.
// PLAN 3.6p: the build is fast again; about four times the slowest test here on a laptop under load, never under 30 s.
viTimeout.setConfig({ testTimeout: 30_000 });

const atomic: FocusPickId[] = ['upper_chest', 'lats', 'upper_back', 'lower_back', 'front_delts', 'side_delts', 'rear_delts', 'biceps', 'triceps', 'forearms', 'abs', 'obliques', 'glutes', 'quads', 'hamstrings', 'calves', 'posture', 'grip', 'mobility'];
const exp: ExperienceId[] = ['new', 'months', '1_2y', '3y', 'break'];
const goals: GoalId[] = ['muscle', 'strength', 'health', 'fat_loss', 'comeback'];
const full = equipmentPreset('full', 'lb');
const avg = (a: number[]) => (a.length ? a.reduce((n, x) => n + x, 0) / a.length : 0);
const band = (count: number) => (count <= 2 ? '1 to 2' : count <= 4 ? '3 to 4' : '5 or more');

export function measureFocus() {
  const gap = new Map<number, number[]>();
  const extra = new Map<string, number[]>();
  const long = new Map<string, number[]>();
  for (let count = 0; count <= 11; count++) for (const days of [2, 3, 4, 5, 6]) for (const minutes of [20, 30, 45, 60, 75] as const) {
    const seed = count * 250 + days * 31 + minutes * 17;
    let rng = seed + 1;
    const random = () => { rng ^= rng << 13; rng ^= rng >>> 17; rng ^= rng << 5; return (rng >>> 0) / 4294967296; };
    const ranked = [...atomic];
    for (let i = ranked.length - 1; i > 0; i--) { const j = Math.floor(random() * (i + 1)); [ranked[i], ranked[j]] = [ranked[j]!, ranked[i]!]; }
    const r = generate({ goals: [goals[seed % goals.length]!], experience: exp[seed % exp.length]!, days, minutes, focusPicks: ranked.slice(0, count), scheduleStyle: 'flexible', gym: full, never: ['barbell-back-squat'], easyOn: seed % 3 === 0 ? ['lower_back'] : [] });
    if (!r.ok || count === 0) continue;
    for (const m of r.applied.minutes) gap.set(minutes, [...(gap.get(minutes) ?? []), minutes - m]);
    const total = r.applied.focusReport!.priorities.reduce((n, p) => n + (p.id === 'mobility' ? 0 : p.extra), 0);
    extra.set(band(count), [...(extra.get(band(count)) ?? []), total]);
    if (minutes >= 45) long.set(band(count), [...(long.get(band(count)) ?? []), total]);
  }
  return { gap, extra, long };
}

it('the chosen minutes and the focus budget are used (seeded intakes, full gym)', () => {
  const { gap, extra, long } = measureFocus();
  const lines = [...gap].map(([m, g]) => `${m} min: built days are ${avg(g).toFixed(1)} min under the choice on average, ${Math.max(...g)} at worst`);
  for (const [k, v] of extra) lines.push(`${k} picks: ${avg(v).toFixed(1)} extra sets in all on average (${avg(long.get(k) ?? []).toFixed(1)} from 45 min up)`);
  console.log(lines.join('\n'));
  // Held: with picks, a plan from 45 min up hands out most of what the PLAN means it to.
  expect(avg(long.get('1 to 2')!)).toBeGreaterThan(3);
  expect(avg(long.get('3 to 4')!)).toBeGreaterThan(6);
  expect(avg(long.get('5 or more')!)).toBeGreaterThan(7);
  // Picks that share moves each count the shared sets, so a sum over picks can pass 12; the budget itself (each set once) is held in generator-3.6f-count.test.ts.
  for (const v of extra.values()) expect(Math.max(...v)).toBeLessThanOrEqual(24);
});
