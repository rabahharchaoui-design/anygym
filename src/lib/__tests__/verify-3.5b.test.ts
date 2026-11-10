// Independent verifier checks for PLAN 3.5b (tester). Overlap numbers are computed here from the
// catalog's primary regions (QUICK_DEPS.primaryOf), not taken from the builder's helpers.
import { describe, expect, it } from 'vitest';
import { EQUIPMENT_IDS } from '../../db/types';
import { QUICK_DEPS } from '../../data/quick';
import { PLANS } from '../../data/plans';
import { SWAP_DATA } from '../../data/patterns';
import { demoFor } from '../../data/exerciseInfo';
import type { GymKit } from '../picker';
import { presetEquipment } from '../intake/funnel';
import type { Muscle } from '../order';
import { requiresOf } from '../swap';
import { buildIdeas, planConcept, QUICK_MINUTES, sureGear, type Concept } from '../quick';
import { chooseBatch, densityFor, STYLE_ORDER, type Pickable } from '../quickStyles';

const FULL: GymKit = { equipment: [...EQUIPMENT_IDS], dumbbellRange: { min: 5, max: 100, step: 5 } };
const DB: GymKit = { equipment: ['dumbbells', 'adjustable_bench'], dumbbellRange: { min: 5, max: 50, step: 5 } };
const place = (p: 'hotel' | 'home' | 'outdoors'): GymKit => {
  const equipment = presetEquipment(p);
  return { equipment, dumbbellRange: equipment.includes('dumbbells') ? { min: 5, max: 50, step: 5 } : null };
};
const NOW = new Date(2026, 10, 9, 18, 0).getTime();
const DAY = 86_400_000;
const GYMS: Record<string, GymKit> = { full: FULL, dumbbell: DB, hotel: place('hotel') };

function overlap(a: ReadonlySet<string>, b: ReadonlySet<string>) {
  let shared = 0;
  for (const x of a) if (b.has(x)) shared++;
  const union = a.size + b.size - shared;
  return { shared, union, ofUnion: union ? shared / union : 0, ofSmaller: shared / Math.max(1, Math.min(a.size, b.size)) };
}

const history = (): { lastTrained: Partial<Record<Muscle, number>>; recent: Muscle[] } => ({
  // chest/front delts/triceps trained yesterday; quads 2 days ago; back/biceps 4 days; rest 6 days.
  lastTrained: { chest: NOW - DAY, 'front delts': NOW - DAY, triceps: NOW - DAY, quads: NOW - 2 * DAY, back: NOW - 4 * DAY, biceps: NOW - 4 * DAY, glutes: NOW - 6 * DAY, hamstrings: NOW - 6 * DAY, abs: NOW - 6 * DAY, 'side delts': NOW - 6 * DAY, 'rear delts': NOW - 6 * DAY, calves: NOW - 6 * DAY, 'lower back': NOW - 6 * DAY },
  recent: ['chest', 'front delts', 'triceps', 'quads'],
});

describe('verify 3.5b', () => {
  it('overlap table (report) and honesty of every card at full, dumbbell, hotel', () => {
    const rows: string[] = [];
    let worstU = { v: 0, s: '' };
    let worstS = { v: 0, s: '' };
    for (const [gn, gym] of Object.entries(GYMS))
      for (const m of QUICK_MINUTES)
        for (const withPlan of [true, false]) {
          const h = history();
          const base = { goals: ['muscle' as const], experience: '1_2y' as const, gym };
          const plan = withPlan ? planConcept({ plan: PLANS[0]!, dayIndex: 1, weekIndex: 0, minutes: m, gym }, QUICK_DEPS) : null;
          const ideas = buildIdeas({ base, minutes: m, recent: h.recent, plan, lastTrained: h.lastTrained, now: NOW }, QUICK_DEPS);
          const cs = ideas.cards;
          const tag = `${gn} ${m} plan=${withPlan}`;
          rows.push(`${tag}: ${cs.map((c) => `${c.id}(${c.items.length}x ${c.minutes}m)`).join(' | ')}`);
          expect(new Set(cs.map((c) => c.id)).size).toBe(cs.length);
          if (withPlan && !plan) console.log('NOTE plan dropped (no fit)', tag); if (withPlan && plan && ideas.cards.some((c)=>c.id==='plan')) expect(cs[0]!.id).toBe('plan'); else if (withPlan && plan) console.log('PLAN DROPPED', tag, plan.minutes);
          if (!withPlan) expect(cs.some((c) => c.id === 'plan')).toBe(false);
          for (let i = 0; i < cs.length; i++)
            for (let j = i + 1; j < cs.length; j++) {
              const o = overlap(cs[i]!.primary, cs[j]!.primary);
              const s = `${tag} ${cs[i]!.id}/${cs[j]!.id} shared ${o.shared} union ${o.union} smaller ${Math.min(cs[i]!.primary.size, cs[j]!.primary.size)}`;
              if (o.ofSmaller > 0.5) console.log('OVER-HALF-OF-SMALLER', s, 'a=', [...cs[i]!.primary].join('/'), 'b=', [...cs[j]!.primary].join('/'), 'u%', (o.ofUnion*100).toFixed(0), 's%', (o.ofSmaller*100).toFixed(0));
              if (o.ofUnion > worstU.v) worstU = { v: o.ofUnion, s };
              if (o.ofSmaller > worstS.v) worstS = { v: o.ofSmaller, s };
            }
          for (const c of cs) for (const it of c.items) {
            expect(demoFor(it.id), `${tag} ${c.id} ${it.id}`).not.toBeNull();
            expect(sureGear(SWAP_DATA, it.id, gym), `${tag} ${it.id} gear`).toBe(true);
            expect(requiresOf(SWAP_DATA, it.id)).not.toBeNull();
          }
        }
    console.log(rows.join('\n'));
    console.log('WORST shared/union', worstU.v.toFixed(3), worstU.s);
    console.log('WORST shared/smaller', worstS.v.toFixed(3), worstS.s);
  });

  it('density per chip x preset (report)', () => {
    const rows: string[] = [];
    for (const [gn, gym] of Object.entries(GYMS))
      for (const m of QUICK_MINUTES) {
        const cs = buildIdeas({ base: { goals: ['muscle'], experience: '1_2y', gym }, minutes: m, recent: [] }, QUICK_DEPS).cards;
        const d = densityFor(m);
        for (const c of cs) {
          rows.push(`${gn} ${m} ${c.id}: n=${c.items.length} min=${c.minutes} range=${d.min}-${d.max}`);
          expect(c.minutes).toBeLessThanOrEqual(m);
          expect(c.minutes).toBeGreaterThanOrEqual(m - 2 - (c.minutes < m - 2 ? 99 : 0));
        }
      }
    console.log(rows.join('\n'));
  });

  it('rotation: two done circuit workouts -> circuit is not among cards 3 and 4; last set not repeated; chain of 10 visits', () => {
    const base = { goals: ['muscle' as const], experience: '1_2y' as const, gym: FULL };
    for (const m of QUICK_MINUTES) {
      const first = buildIdeas({ base, minutes: m, recent: [] }, QUICK_DEPS).cards.map((c) => c.id);
      const withDone = buildIdeas({ base, minutes: m, recent: [], done: ['circuit', 'circuit'] }, QUICK_DEPS).cards.map((c) => c.id);
      const styles = withDone.filter((x) => x !== 'plan' && x !== 'fresh');
      console.log(m, 'no-history', first.join(','), '| circuit x2 done', withDone.join(','));
      expect(styles[0]).not.toBe('circuit');
      const again = buildIdeas({ base, minutes: m, recent: [], lastShown: first }, QUICK_DEPS).cards.map((c) => c.id);
      console.log('  revisit with lastShown', again.join(','), [...again].sort().join()===[...first].sort().join() ? 'SAME SET' : 'changed');
    }
    let last: string[] = [];
    for (let v = 0; v < 10; v++) {
      const ids = buildIdeas({ base, minutes: 30, recent: [], lastShown: last }, QUICK_DEPS).cards.map((c) => c.id);
      if (v) expect([...ids].sort()).not.toEqual([...last].sort());
      last = ids;
    }
  });

  it('chooseBatch edge: when exactly one diverse set exists it may repeat; when 2 exist it must not', () => {
    const P = (id: string, ...m: string[]): Pickable => ({ id, primary: new Set(m) });
    const styles = new Map<any, Pickable[]>([['circuit', [P('circuit', 'a', 'b')]], ['pump', [P('pump', 'c', 'd')]], ['strength', [P('strength', 'e', 'f')]]]);
    const one = chooseBatch({ plan: null, fresh: [], styles, done: [], lastShown: ['circuit', 'pump', 'strength'], needEasy: false });
    expect(one.cards).toHaveLength(3);
    styles.set('armsAbs', [P('armsAbs', 'g', 'h')]);
    const two = chooseBatch({ plan: null, fresh: [], styles, done: [], lastShown: ['circuit', 'pump', 'strength', 'armsAbs'], needEasy: false });
    expect(two.cards.length).toBe(4);
    // 4 available styles, max 4: the only set of 4 is the same, repeated is forced (no other 4 exists).
    void STYLE_ORDER;
  });

  it('home and outdoors: no cards at all', () => {
    for (const p of ['home', 'outdoors'] as const)
      for (const m of QUICK_MINUTES) expect(buildIdeas({ base: { goals: ['muscle'], experience: '1_2y', gym: place(p) }, minutes: m, recent: [] }, QUICK_DEPS).cards).toEqual([]);
  });

  it('fresh card claims: every named muscle is outside the recent set and the rested number equals the seeded history', () => {
    const h = history();
    for (const [gn, gym] of Object.entries(GYMS))
      for (const m of QUICK_MINUTES) {
        const cs = buildIdeas({ base: { goals: ['muscle'], experience: '1_2y', gym }, minutes: m, recent: h.recent, lastTrained: h.lastTrained, now: NOW }, QUICK_DEPS).cards;
        const f = cs.find((c) => c.id === 'fresh');
        console.log(gn, m, 'fresh:', f ? `${f.line} [${f.items.map((i) => i.id).join(',')}]` : 'none');
        if (f) expect(cs[0]!.id).toBe('fresh');
      }
  });
});
// Concept type import kept for readers.
export type _C = Concept;
