// PLAN 3.6g: the one measurement of how deep the focus curation goes, over the seeded intakes of
// focus-measure-3.6f.test.ts (every pick count 0 to 11, days 2 to 6, a full gym). Shared by the
// measure test (prints the table) and the target tests (hold the numbers).
import { generate } from '../../data/generator';
import { equipmentPreset } from '../../db/gyms';
import type { ExperienceId, FocusPickId, GoalId } from '../intake/options';
import type { FocusReport } from '../plan/focus';
import type { GeneratorInput } from '../generator';

export const ATOMIC: FocusPickId[] = ['upper_chest', 'lats', 'upper_back', 'lower_back', 'front_delts', 'side_delts', 'rear_delts', 'biceps', 'triceps', 'forearms', 'abs', 'obliques', 'glutes', 'quads', 'hamstrings', 'calves', 'posture', 'grip', 'mobility'];
const exp: ExperienceId[] = ['new', 'months', '1_2y', '3y', 'break'];
const goals: GoalId[] = ['muscle', 'strength', 'health', 'fat_loss', 'comeback'];
const full = equipmentPreset('full', 'lb');

export type Sample = {
  input: GeneratorInput; count: number; days: number; minutes: number;
  /** The picks that have an exercise here (never Mobility: it is stretch time). */
  served: FocusPickId[];
  report: FocusReport; built: number[]; base: number[];
};

/** The seeded intake for one cell (rep 0: the same seeds as the 3.6f measure). */
export function seededInput(count: number, days: number, minutes: number, rep = 0): GeneratorInput {
  const seed = count * 250 + days * 31 + minutes * 17 + rep * 7919;
  let rng = seed + 1;
  const random = () => { rng ^= rng << 13; rng ^= rng >>> 17; rng ^= rng << 5; return (rng >>> 0) / 4294967296; };
  const ranked = [...ATOMIC];
  for (let i = ranked.length - 1; i > 0; i--) { const j = Math.floor(random() * (i + 1)); [ranked[i], ranked[j]] = [ranked[j]!, ranked[i]!]; }
  return { goals: [goals[seed % goals.length]!], experience: exp[seed % exp.length]!, days, minutes, focusPicks: ranked.slice(0, count), scheduleStyle: 'flexible', gym: full, never: ['barbell-back-squat'], easyOn: seed % 3 === 0 ? ['lower_back'] : [] };
}

let cache: Sample[] | null = null;
/** Every seeded intake with picks, 3 to 6 days, 45 minutes and up, three seeds a cell, built once. */
export function samples(): Sample[] {
  if (cache) return cache;
  const out: Sample[] = [];
  for (let count = 1; count <= 11; count++) for (const days of [3, 4, 5, 6]) for (const minutes of [45, 60, 75]) for (let rep = 0; rep < 3; rep++) {
    const input = seededInput(count, days, minutes, rep);
    const r = generate(input), b = generate({ ...input, focusPicks: [] });
    if (!r.ok || !b.ok) continue;
    const report = r.applied.focusReport!;
    const served = report.priorities.filter((p) => p.id !== 'mobility' && p.state !== 'no_move').map((p) => p.id);
    out.push({ input, count, days, minutes, served, report, built: r.applied.minutes, base: b.applied.minutes });
  }
  return (cache = out);
}

const avg = (a: number[]) => (a.length ? a.reduce((n, x) => n + x, 0) / a.length : 0);
export const bandOf = (served: number) => (served === 0 ? '0' : served === 1 ? '1' : served === 2 ? '2' : served <= 4 ? '3 to 4' : '5 or more');

export type Row = { key: string; n: number; extra: number; zero: number; under2: number; under12: number; gap: number; stretch: number };
/** One table row: plans, average extra sets (each set once), served picks at +0 and under +2, served picks under 12 sets, average minutes under the choice, and of the sessions of plans with a Mobility pick the share that end with a stretch block. */
function row(key: string, list: Sample[]): Row {
  const picks = list.flatMap((s) => s.report.priorities.filter((p) => s.served.includes(p.id)));
  const share = (f: (p: (typeof picks)[number]) => boolean) => (picks.length ? picks.filter(f).length / picks.length : 0);
  return { key, n: list.length, extra: avg(list.map((s) => s.report.spent)), zero: share((p) => p.extra === 0 && p.state !== 'plenty'), under2: share((p) => p.extra < 2 && p.state !== 'plenty'), under12: share((p) => p.total < 12), gap: avg(list.flatMap((s) => s.built.map((m) => s.minutes - m))), stretch: avg(list.filter((s) => s.input.focusPicks!.includes('mobility')).flatMap((s) => s.report.dayExtra!.map((d) => Number(d.some((x) => x.id === 'mobility' && (x.minutes ?? 0) >= 5))))) };
}

export function table(): Row[] {
  const all = samples();
  const rows: Row[] = [];
  for (const band of ['1', '2', '3 to 4', '5 or more']) rows.push(row(`${band} served picks`, all.filter((s) => bandOf(s.served.length) === band)));
  for (const minutes of [45, 60, 75]) rows.push(row(`${minutes} min`, all.filter((s) => s.minutes === minutes && s.served.length > 0)));
  for (const minutes of [45, 60, 75]) for (const band of ['1', '2', '3 to 4', '5 or more']) rows.push(row(`${minutes} min, ${band}`, all.filter((s) => s.minutes === minutes && bandOf(s.served.length) === band)));
  return rows;
}

export const printTable = (rows: Row[]): string => ['cell | plans | avg extra sets | served picks at +0 | under +2 | under 12 sets | avg min under the choice | sessions with a stretch block (Mobility picked)', ...rows.map((r) => `${r.key} | ${r.n} | ${r.extra.toFixed(1)} | ${(r.zero * 100).toFixed(0)}% | ${(r.under2 * 100).toFixed(0)}% | ${(r.under12 * 100).toFixed(0)}% | ${r.gap.toFixed(1)} | ${(r.stretch * 100).toFixed(0)}%`)].join('\n');
