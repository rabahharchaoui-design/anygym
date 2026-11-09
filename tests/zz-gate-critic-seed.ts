import { readFileSync } from 'node:fs';
import { expect, type Page } from './fixtures';
import { slugify, type PlanExercise } from '../src/lib/loadTypeRule';
import { normalizePlan, type Plan } from '../src/lib/plans';
import { dayWorkout, isWorkingEntry } from '../src/lib/planWorkout';
import { dbAll, dbPut } from './workout-helpers';

const exercises = new Map((JSON.parse(readFileSync('data/plan-exercises.json', 'utf8')) as PlanExercise[]).map((e) => [e.id, e]));
export const SPLIT: Plan = normalizePlan(JSON.parse(readFileSync('data/plans/five-day-split.json', 'utf8')), (name: string) => exercises.get(slugify(name)));
const DAY = 86_400_000;

function mondayOf(weeksAgo: number): number {
  const now = new Date();
  const back = (now.getDay() + 6) % 7;
  return new Date(now.getFullYear(), now.getMonth(), now.getDate() - back - 7 * weeksAgo, 18).getTime();
}
function plates(perSideTotal: number): number[] {
  const out: number[] = []; let r = perSideTotal;
  for (const p of [45, 35, 25, 10, 5, 2.5]) while (r >= p - 1e-9) { out.push(p); r -= p; }
  return out;
}
function loadFor(id: string, bump: number): Record<string, unknown> | null {
  const t = exercises.get(id)?.loadType ?? 'unknown';
  const h = [...id].reduce((a, c) => a + c.charCodeAt(0), 0);
  switch (t) {
    case 'barbell': { const total = 95 + (h % 5) * 20 + bump * 10; return { kind: 'barbell', unit: 'lb', total, barWeight: 45, perSide: plates((total - 45) / 2) }; }
    case 'plate_machine': { const ps = 45 + (h % 3) * 25 + bump * 10; return { kind: 'plate_machine', unit: 'lb', total: ps * 2, barWeight: 0, perSide: plates(ps), collars: 0 }; }
    case 'dumbbell_each': { const each = 20 + (h % 4) * 5 + bump * 5; return { kind: 'dumbbell_each', unit: 'lb', total: each * 2 }; }
    case 'single': { const w = 25 + (h % 3) * 10 + bump * 5; return { kind: 'single', unit: 'lb', total: w }; }
    case 'stack': { const v = 70 + (h % 5) * 10 + bump * 10; return { kind: 'stack', unit: 'lb', total: v, stackValue: v }; }
    case 'bodyweight': return { kind: 'bodyweight', unit: 'lb', total: 0 };
    case 'timed': return { kind: 'timed', unit: 'lb', total: 0 };
    default: return null;
  }
}

/** Uses the Classic 5 Day Split from Today, then seeds `weeks` full weeks of logged history ending `endWeeksAgo` weeks ago. */
export async function seedLifter(page: Page, opts: { weeks?: number; endWeeksAgo?: number; missLast?: string[]; thisWeekDays?: number; plateau?: boolean; daysOff?: number; midReps?: boolean } = {}) {
  const weeks = opts.weeks ?? 3;
  const end = opts.endWeeksAgo ?? 1;
  await page.goto('./');
  await page.getByRole('button', { name: 'See plans' }).tap();
  await page.getByTestId('plan-five-day-split').tap();
  await page.getByRole('button', { name: 'Use this plan' }).tap();
  await expect(page.getByTestId('day-card-title')).toBeVisible();
  const gym = (await dbAll<{ id: string; isActive: boolean }>(page, 'gyms')).find((g) => g.isActive)!;
  const sessions: unknown[] = []; const sets: unknown[] = [];
  const emit = (startedAt: number, dayIndex: number, weekIndex: number, bump: number, last: boolean) => {
    const id = `g-${startedAt}-${dayIndex}`;
    const entries = dayWorkout(SPLIT, dayIndex, 0).filter(isWorkingEntry);
    let order = 0; const ids: string[] = [];
    for (const e of entries) {
      const load = loadFor(e.exerciseId, opts.plateau ? 0 : bump);
      if (!load) continue;
      ids.push(e.exerciseId);
      const r = e.reps as unknown;
      const top = Array.isArray(r) ? (r[1] as number) : typeof r === 'number' ? r : 10;
      for (let k = 0; k < Math.max(1, e.sets); k++) {
        const miss = last && opts.missLast?.includes(e.exerciseId) && k === e.sets - 1;
        const base = { id: `${id}-${order}`, sessionId: id, exerciseId: e.exerciseId, order: order++, kind: 'work', uncertain: false, load };
        sets.push(load.kind === 'timed' ? { ...base, seconds: e.seconds ?? 45 } : { ...base, reps: miss ? Math.max(1, top - 5) : opts.midReps ? Math.max(1, top - 2) : top });
      }
    }
    sessions.push({ id, gymId: gym.id, startedAt, endedAt: startedAt + 62 * 60_000, imported: false, planId: 'five-day-split', dayId: String(SPLIT.days[dayIndex]!.n), weekIndex, exerciseIds: ids });
  };
  const offset = opts.daysOff ? opts.daysOff * DAY : 0;
  for (let w = 0; w < weeks; w++) {
    const weeksAgo = end + (weeks - 1 - w);
    for (let d = 0; d < 5; d++) emit(mondayOf(weeksAgo) + d * DAY - offset, d, w, w, w === weeks - 1);
  }
  for (let d = 0; d < (opts.thisWeekDays ?? 0); d++) emit(mondayOf(0) + d * DAY, d, weeks, weeks, false);
  await dbPut(page, { sessions, sets, profile: [{ id: 'me', defaultUnit: 'lb', createdAt: 1, intakeDoneAt: 1, intake: { goal: 'muscle', goals: ['muscle'], experience: '3y', minutes: 60, days: 5, place: 'full' } }] });
  const ps = (await dbAll<Record<string, unknown>>(page, 'planState'))[0]!;
  const done = opts.thisWeekDays ?? 0;
  await dbPut(page, { planState: [{ ...ps, startedAt: mondayOf(end + weeks - 1) - offset, weekIndex: weeks, nextDayIndex: done % 5, doneDays: [...Array(done).keys()] }] });
  await page.goto('./');
}
