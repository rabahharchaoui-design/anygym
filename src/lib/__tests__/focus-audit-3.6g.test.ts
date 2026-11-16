// PLAN 3.6g, counted independently on the built plans (never taken from the focus module's own
// report): the same seeded intakes as the targets (a full gym, 45 minutes and up, 3 to 6 days),
// each beside the same answers with no picks.
import { describe, expect, it, vi as viTimeout } from 'vitest';
import { focusFacts } from '../../data/focus';
import { generate } from '../../data/generator';
import { musclesForCatalog, musclesForPlan } from '../../data/muscles';
import { profileFor } from '../../data/order';
import { definitionPlan } from '../../data/plans';
import type { FocusPickId } from '../intake/options';
import { focusCompared } from '../plan/focusPriority';
import { LIMIT_MUSCLES } from '../plan/focus';
import { readFocusReport } from '../plan/focusMetadata';
import { estimateDayMinutes, type Plan } from '../plans';
import { samples, type Sample } from './focusMeasure36g';
// A heavy test file (about 800 plans built once, then each rebuilt to read its moves); an explicit limit sized for the GitHub runner, never a retry.
viTimeout.setConfig({ testTimeout: 240_000 });

type T = { muscle: string; label: string };
const named = (l: string) => (t: T) => t.label.toLowerCase() === l;
const mus = (...m: string[]) => (t: T) => m.includes(t.muscle);
/** Each atomic option against the reviewed primary muscles, as the PLAN names it. */
const SRC: Record<string, (t: T) => boolean> = {
  upper_chest: named('upper chest'), lats: mus('lats'), upper_back: mus('middle back'), lower_back: mus('lower back'), front_delts: named('front delts'), side_delts: named('side delts'), rear_delts: named('rear delts'),
  biceps: mus('biceps'), triceps: mus('triceps'), forearms: mus('forearms'), grip: mus('forearms'), abs: mus('abdominals'), obliques: mus('obliques'), glutes: mus('glutes'), quads: mus('quadriceps'), hamstrings: mus('hamstrings'), calves: mus('calves'),
  posture: (t) => t.muscle === 'middle back' || t.label.toLowerCase() === 'rear delts',
};
const primary = (id: string): T[] => (profileFor(id).role === 'lift' ? ((musclesForPlan(id) ?? musclesForCatalog(id))?.primary ?? []) : []);
const plansOf = (s: Sample) => { const r = generate(s.input), b = generate({ ...s.input, focusPicks: [] }); if (!r.ok || !b.ok) throw new Error('no plan'); return { plan: definitionPlan(r.plan)!, base: definitionPlan(b.plan)! }; };
/** Hard sets a week by muscle: the sure muscles of each lift, or what the 48 hour rule tracks when none is on record (a plank). */
function byMuscle(plan: Plan): Map<string, number> {
  const out = new Map<string, number>();
  for (const d of plan.days) for (const b of d.blocks.filter((x) => !x.warmup)) for (const it of b.items) {
    const p = profileFor(it.exerciseId);
    if (p.role !== 'lift') continue;
    const sure = focusFacts(it.exerciseId, p).muscles;
    for (const m of sure.length ? sure : p.targets) out.set(m, (out.get(m) ?? 0) + b.sets!);
  }
  return out;
}

describe('3.6g, counted on the built plans', () => {
  it('more is not better anywhere: no muscle that no pick asks for is taken past 20 sets a week by what focus and the fill add', () => {
    let over = 0;
    for (const s of samples()) {
      const { plan, base } = plansOf(s);
      const focused = new Set((s.input.focusPicks as FocusPickId[]).flatMap((p) => LIMIT_MUSCLES[p] ?? []));
      const now = byMuscle(plan), was = byMuscle(base);
      for (const [m, n] of now) {
        if (focused.has(m) || n <= 20) continue;
        over++;
        expect(n, `${m} ${JSON.stringify(s.input.focusPicks)} ${s.days}d ${s.minutes}m`).toBeLessThanOrEqual(was.get(m) ?? 0);
      }
    }
    // (Only plans that held more than 20 with no picks still do: a 6 day plan at 75 minutes.)
    expect(over).toBeLessThan(samples().length / 4);
  });
  it('the rank promise in free time: a pick left short below a lower pick could not have taken one more set on a move of its own', () => {
    let seen = 0;
    for (const s of samples()) {
      if (s.report.spent >= 12) continue;
      const hard = focusCompared(s.report);
      const passed = hard.filter((h, i) => h.state === 'short' && hard.slice(i + 1).some((l) => l.extra > h.extra));
      if (!passed.length) continue;
      const { plan } = plansOf(s);
      const cap = s.input.experience === '3y' && !s.input.goals!.includes('comeback') ? 4 : 3;
      for (const h of passed) {
        seen++;
        for (const d of plan.days) for (const b of d.blocks.filter((x) => !x.warmup)) {
          if (b.sets! >= cap || !b.items.some((it) => primary(it.exerciseId).some(SRC[h.id]!))) continue;
          const grown = { ...d, blocks: d.blocks.map((x) => (x === b ? { ...x, sets: x.sets! + 1 } : x)) };
          expect(estimateDayMinutes(grown), `${h.id} on ${d.name}: ${JSON.stringify(s.input.focusPicks)} ${s.days}d ${s.minutes}m`).toBeGreaterThan(s.minutes);
        }
      }
    }
    // PLAN 3.6g2: under the strict rank a pick left short is only ever passed by extra that came with a higher pick's work, so these are few now (they were over 10).
    expect(seen).toBeGreaterThan(0);
  });
  it('Mobility picked: most sessions end with a stretch block (60 minutes: over 80%, 75: over 90%, 45: over 25%), each 5 to 8 minutes, and every report reads back as saved', () => {
    for (const [minutes, least] of [[45, 0.25], [60, 0.8], [75, 0.9]] as const) {
      const days = samples().filter((s) => s.minutes === minutes && s.input.focusPicks!.includes('mobility')).flatMap((s) => s.report.dayExtra!.map((d) => d.find((x) => x.id === 'mobility')?.minutes ?? 0));
      expect(days.length).toBeGreaterThan(50);
      expect(days.filter((m) => m >= 5).length / days.length, `${minutes} min`).toBeGreaterThanOrEqual(least);
      for (const m of days) expect([0, 5, 6, 8]).toContain(m);
    }
    for (const s of samples()) expect(readFocusReport(structuredClone(s.report)), JSON.stringify(s.input.focusPicks)).toEqual(s.report);
  });
});
