// Tester round 2 for PLAN 3.5b. Independent computations from the catalog, report lines on stdout.
import { describe, expect, it } from 'vitest';
import { EQUIPMENT_IDS } from '../../db/types';
import { QUICK_DEPS } from '../../data/quick';
import { PLANS } from '../../data/plans';
import { profileFor } from '../../data/order';
import type { GymKit } from '../picker';
import { presetEquipment } from '../intake/funnel';
import { isHeavy, restFor, type Muscle } from '../order';
import { estimateDayMinutes } from '../plans';
import { buildIdeas, planConcept, QUICK_MINUTES, type Concept } from '../quick';
import { dayWorkout, quickEntry, restAfter, upNext, type WorkoutEntry } from '../planWorkout';
import { applyTrim, trimmedPlan } from '../timeBudget';

const FULL: GymKit = { equipment: [...EQUIPMENT_IDS], dumbbellRange: { min: 5, max: 100, step: 5 } };
const DB: GymKit = { equipment: ['dumbbells', 'adjustable_bench'], dumbbellRange: { min: 5, max: 50, step: 5 } };
const place = (p: 'hotel' | 'home' | 'outdoors'): GymKit => {
  const equipment = presetEquipment(p);
  return { equipment, dumbbellRange: equipment.includes('dumbbells') ? { min: 5, max: 50, step: 5 } : null };
};
const GYMS: Record<string, GymKit> = { full: FULL, dumbbell: DB, hotel: place('hotel') };
const NOW = new Date(2026, 10, 9, 18, 0).getTime();
const DAY = 86_400_000;
const split = PLANS.find((p) => p.id === 'five-day-split')!;
const ALL: Muscle[] = ['quads', 'glutes', 'hamstrings', 'lower back', 'calves', 'chest', 'front delts', 'side delts', 'rear delts', 'back', 'biceps', 'triceps', 'abs'];

const histories: Array<{ name: string; lastTrained?: Partial<Record<Muscle, number>>; recent: Muscle[] }> = [
  { name: 'none', recent: [] },
  { name: 'push-yesterday', lastTrained: { chest: NOW - DAY, 'front delts': NOW - DAY, triceps: NOW - DAY, quads: NOW - 2 * DAY, back: NOW - 4 * DAY, biceps: NOW - 4 * DAY, glutes: NOW - 6 * DAY, hamstrings: NOW - 6 * DAY, abs: NOW - 6 * DAY, 'side delts': NOW - 6 * DAY, 'rear delts': NOW - 6 * DAY, calves: NOW - 6 * DAY, 'lower back': NOW - 6 * DAY }, recent: ['chest', 'front delts', 'triceps', 'quads'] },
  { name: 'legs-yesterday', lastTrained: Object.fromEntries(ALL.map((m) => [m, NOW - (['quads', 'glutes', 'hamstrings', 'calves'].includes(m) ? 1 : 5) * DAY])) as Partial<Record<Muscle, number>>, recent: ['quads', 'glutes', 'hamstrings', 'calves'] },
];

function run(gym: GymKit, m: number, hist: (typeof histories)[number], planDay: number | null, experience: '1_2y' | 'new' = '1_2y') {
  const plan = planDay === null ? null : planConcept({ plan: split, dayIndex: planDay, weekIndex: 0, minutes: m, gym, experience }, QUICK_DEPS);
  const input = { base: { goals: ['muscle' as const], experience, gym }, minutes: m, recent: hist.recent, plan, ...(hist.lastTrained ? { lastTrained: hist.lastTrained } : {}), now: NOW };
  return buildIdeas(input, QUICK_DEPS);
}
const ratio = (a: ReadonlySet<string>, b: ReadonlySet<string>) => {
  let s = 0;
  for (const x of a) if (b.has(x)) s++;
  return { s, small: Math.min(a.size, b.size), r: s / Math.max(1, Math.min(a.size, b.size)) };
};

describe('verify 3.5b r2', () => {
  it('#2 overlap (shared/smaller) worst, and card counts', () => {
    let worst = { r: 0, tag: '' };
    const counts: Record<string, Record<number, Set<number>>> = {};
    const bad: string[] = [];
    for (const [gn, gym] of Object.entries(GYMS))
      for (const m of QUICK_MINUTES)
        for (const exp of ['1_2y', 'new'] as const)
          for (const h of histories)
            for (const pd of [null, 0, 1, 2, 3, 4]) {
              const ideas = run(gym, m, h, pd, exp);
              const cs = ideas.cards;
              ((counts[`${gn}/${exp}`] ??= {})[m] ??= new Set()).add(cs.length);
              const sets = [cs, ...ideas.more.map((alt, k) => { const x = [...cs]; x.splice(ideas.moreAt[k]!, 1, alt); return x; })];
              for (const grp of sets)
                for (let i = 0; i < grp.length; i++)
                  for (let j = i + 1; j < grp.length; j++) {
                    const o = ratio(grp[i]!.primary, grp[j]!.primary);
                    const tag = `${gn} ${exp} ${m} hist=${h.name} planDay=${pd} ${grp[i]!.id}/${grp[j]!.id} ${o.s}/${o.small}`;
                    if (o.r > worst.r) worst = { r: o.r, tag };
                    if (o.s * 2 > o.small) bad.push(tag);
                  }
            }
    console.log('WORST shared/smaller', worst.r.toFixed(3), worst.tag);
    for (const [k, v] of Object.entries(counts)) console.log('COUNTS', k, Object.entries(v).map(([m, s]) => `${m}:${[...s].sort().join('|')}`).join('  '));
    expect(bad.slice(0, 5)).toEqual([]);
  });

  it('#3 heavy compounds never in a group; rest is the long one', () => {
    const groupedHeavy: string[] = [];
    const heavyRest: string[] = [];
    let n = 0;
    for (const [gn, gym] of Object.entries(GYMS))
      for (const m of QUICK_MINUTES)
        for (const h of histories)
          for (const pd of [null, 0, 1, 2, 3, 4]) {
            const cs = run(gym, m, h, pd).cards;
            for (const c of cs) {
              for (const it of c.items) {
                if (!isHeavy(profileFor(it.id))) continue;
                n++;
                const tag = `${gn} ${m} ${c.id} ${it.id} rest ${it.restSec}`;
                if (it.group !== undefined) groupedHeavy.push(tag);
                if (c.id !== 'plan' && it.restSec < 120) heavyRest.push(tag);
                if (c.id === 'plan') { const o = c.plan!.day.blocks.find((x) => x.items.some((y) => y.exerciseId === it.slot || y.exerciseId === it.origin)); if (o && (o.restSec ?? 0) !== it.restSec) heavyRest.push(`plan rest differs ${tag} curated ${o.restSec}`); }
              }
              if (c.plan) {
                const day = applyTrim(c.plan.day, c.plan.trim, 0);
                for (const b of c.plan.day.blocks) void b;
                for (const b of day.blocks) if (b.roundRest) for (const it of b.items) if (isHeavy(profileFor(it.exerciseId))) groupedHeavy.push(`plan ${gn} ${m} ${it.exerciseId}`);
                // Heavy rest in the trimmed day vs curated.
                for (const b of day.blocks) for (const it of b.items) if (isHeavy(profileFor(it.exerciseId))) {
                  const orig = c.plan.day.blocks.find((x) => x.items.some((y) => y.exerciseId === it.exerciseId));
                  if ((b.restSec ?? 0) < (orig?.restSec ?? 0)) heavyRest.push(`plan-trimmed-rest ${gn} ${m} ${it.exerciseId} ${b.restSec} < ${orig?.restSec}`);
                }
              }
            }
          }
    console.log('heavy items inspected', n, 'grouped', groupedHeavy.length, 'short rest', [...new Set(heavyRest)].slice(0, 10));
    expect(groupedHeavy).toEqual([]);
    expect([...new Set(heavyRest)]).toEqual([]);
    void restFor;
  });

  it('#1 five day split day 2 numbers at all chips on full gym', () => {
    for (const m of QUICK_MINUTES) {
      const cs = run(FULL, m, histories[0]!, 1).cards;
      const c = cs[0]!;
      const day = applyTrim(c.plan!.day, c.plan!.trim, 0);
      console.log(`PLAN d2 ${m}: first=${c.id} n=${c.items.length} min=${c.minutes} est=${estimateDayMinutes(day, 0)} short=${c.short ?? '-'} groups=${new Set(c.items.filter((i) => i.group !== undefined).map((i) => i.group)).size}`);
      expect(c.id).toBe('plan');
      expect(c.minutes).toBeLessThanOrEqual(m);
      expect(estimateDayMinutes(day, 0)).toBe(c.minutes);
      if (c.minutes < m - 2) expect(c.short).toBeDefined();
      void trimmedPlan; void dayWorkout;
    }
  });

  it('#4 walk: every pump/circuit at every gym and chip within 1 min of the estimate', () => {
    const out: string[] = [];
    for (const [gn, gym] of Object.entries(GYMS))
      for (const m of QUICK_MINUTES) {
        const cs = run(gym, m, histories[0]!, null).cards.filter((c) => c.items.some((i) => i.group !== undefined));
        for (const c of cs) {
          const members = new Map<number, string[]>();
          for (const it of c.items) if (it.group !== undefined) members.set(it.group, [...(members.get(it.group) ?? []), it.id]);
          const entries: WorkoutEntry[] = c.items.map((it, i) => {
            const ids = it.group !== undefined ? members.get(it.group)! : [];
            const pair = ids.length > 1 ? { group: it.group!, index: ids.indexOf(it.id), size: ids.length } : undefined;
            return quickEntry(it.id, it.name, 'stack', i, undefined, { sets: it.sets, restSec: it.restSec, ...(it.reps !== undefined ? { reps: it.reps } : {}), ...(pair ? { pair } : {}) });
          });
          const done: Record<string, number> = {};
          let cur = upNext(entries, done);
          let sec = 0;
          let restsAfterFirstOfPair = 0;
          while (cur) {
            done[cur] = (done[cur] ?? 0) + 1;
            const r = restAfter(entries, done, cur) ?? 0;
            const e = entries.find((x) => x.exerciseId === cur)!;
            const g = c.items.find((i) => i.id === cur)!.group;
            if (g !== undefined && r > 0 && members.get(g)!.length > 1 && cur !== members.get(g)!.at(-1)) restsAfterFirstOfPair++;
            sec += 40 + r;
            void e;
            cur = upNext(entries, done, cur);
          }
          const last = c.items.at(-1)!.restSec;
          const est = Math.round((sec + (c.items.length - 1) * 60 + last) / 60);
          out.push(`${gn} ${m} ${c.id}: walk ${est} card ${c.minutes} first-member rests ${restsAfterFirstOfPair}`);
          expect(Math.abs(est - c.minutes), out.at(-1)).toBeLessThanOrEqual(1);
          expect(restsAfterFirstOfPair).toBe(0);
        }
      }
    console.log(out.join('\n'));
  });

  it('#5 short reason iff more than 2 min under', () => {
    const lines: string[] = [];
    for (const [gn, gym] of Object.entries(GYMS))
      for (const m of QUICK_MINUTES)
        for (const exp of ['1_2y', 'new'] as const)
          for (const pd of [null, 1])
            for (const c of run(gym, m, histories[1]!, pd, exp).cards) {
              const under = m - c.minutes;
              if (under > 2) { lines.push(`${gn} ${exp} ${m} ${c.id} ${c.minutes} short=${c.short}`); expect(c.short, `${gn} ${m} ${c.id}`).toBeDefined(); }
              else expect(c.short, `${gn} ${m} ${c.id} within 2`).toBeUndefined();
            }
    console.log('SHORT', lines.length, lines.slice(0, 12).join(' ; '));
  });

  it('#6 fresh line: independent recomputation over many histories', () => {
    let checked = 0;
    for (let seed = 0; seed < 300; seed++) {
      const lt: Partial<Record<Muscle, number>> = {};
      for (let k = 0; k < ALL.length; k++) if ((seed >> (k % 8)) % 3 !== 0 || k === seed % 13) lt[ALL[k]!] = NOW - (1 + ((seed * (k + 3) * 7) % 11)) * DAY;
      const recent = ALL.filter((mm) => lt[mm] !== undefined && NOW - lt[mm]! < 3 * DAY);
      for (const gym of Object.values(GYMS)) for (const m of [15, 30, 45, 60]) {
        const f = buildIdeas({ base: { goals: ['muscle'], experience: '1_2y', gym }, minutes: m, recent, lastTrained: lt, now: NOW }, QUICK_DEPS).cards.find((c) => c.id === 'fresh');
        if (!f || !f.line) continue;
        const mt = f.line.match(/^(.+) rested (\d+) days?$/);
        if (!mt) continue;
        checked++;
        const words = mt[1]!.toLowerCase().split(' and ');
        const per = new Map<string, number>();
        for (const it of f.items) for (const t of profileFor(it.id).targets) {
          const at = lt[t]; if (at === undefined) continue;
          const w = ({ 'front delts': 'shoulders', 'side delts': 'shoulders', 'rear delts': 'rear shoulders' } as Record<string, string>)[t] ?? t;
          per.set(w, Math.min(per.get(w) ?? 99, Math.floor((NOW - at) / DAY)));
        }
        for (const w of words) expect(per.has(w), `${f.line} names ${w} the card does not train`).toBe(true);
        const days = Math.min(...words.map((w) => per.get(w)!));
        expect(Number(mt[2]), f.line).toBe(days);
      }
    }
    console.log('fresh lines checked', checked);
    expect(checked).toBeGreaterThan(50);
    // 3.5b round 4: many histories × every card build; 60 s so it never times out on a loaded machine or the CI runner.
  }, 60_000);
});
export type _C = Concept;

describe('verify 3.5b r2 table', () => {
  it('base card counts (no plan, no history) and with the five day split day 2 + push-yesterday history', () => {
    for (const [gn, gym] of Object.entries({ ...GYMS, home: place('home'), outdoors: place('outdoors') }))
      for (const exp of ['1_2y', 'new'] as const) {
        const a = QUICK_MINUTES.map((m) => run(gym, m, histories[0]!, null, exp).cards.length);
        const b = QUICK_MINUTES.map((m) => run(gym, m, histories[1]!, 1, exp).cards.map((c) => c.id).join('+'));
        console.log(`TABLE ${gn} ${exp}: ${a.join('/')}  | plan+hist: ${b.join(' ; ')}`);
      }
  });
});
