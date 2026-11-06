import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { PLANS, planById } from '../../data/plans';
import { profileFor } from '../../data/order';
import { estimateDayMinutes, type PlanBlock, type PlanDay } from '../plans';
import { isCompound } from '../order';
import { applyTrim, changeWords, fitWords, trimDay, type TrimInput } from '../timeBudget';

const profileOf: TrimInput['profileOf'] = (id, name) => profileFor(id, name);
const split = planById('five-day-split')!;
const d1 = split.days[0]!;

describe('verify 3.6 check 1: estimate formula, computed from the raw JSON', () => {
  it('Day 1 equals sum(40s work + rest) + 60 s per change, from data/plans/five-day-split.json', () => {
    const raw = JSON.parse(readFileSync('data/plans/five-day-split.json', 'utf8'));
    const rd = raw.days[0];
    let sec = 0;
    for (const b of rd.blocks) {
      const items = b.type === 'single' ? [b] : b.items;
      const sets = b.sets ?? 1;
      for (const it of items) {
        const hold = it.reps === undefined && it.seconds !== undefined;
        const work = hold ? (Array.isArray(it.seconds) ? it.seconds[0] : it.seconds) : 40;
        sec += sets * work;
      }
      sec += sets * (b.restSec ?? (b.sets === undefined ? 0 : 90));
    }
    sec += (rd.blocks.length - 1) * 60;
    const mine = Math.round(sec / 60);
    console.log('DAY1 independent', sec, 's =', mine, 'min; app', estimateDayMinutes(d1));
    expect(estimateDayMinutes(d1)).toBe(mine);
    expect(mine).toBe(90);
  });
});


const blk = (id: string, sets: number, rest = 60): PlanBlock => ({ kind: 'single', items: [{ exerciseId: id, name: profileFor(id).name, reps: [8, 12] }], sets, restSec: rest });
const stretch = (id: string): PlanBlock => ({ kind: 'single', items: [{ exerciseId: id, name: profileFor(id).name, seconds: 45 }] }) as PlanBlock;
const pair = (a: string, b: string, sets: number): PlanBlock => ({ kind: 'pair', items: [a, b].map((id) => ({ exerciseId: id, name: profileFor(id).name, reps: [10, 15] as [number, number] })), sets, restSec: 60 }) as PlanBlock;
const idsOf = (d: PlanDay) => d.blocks.flatMap((b) => b.items.map((i) => i.exerciseId));
const setsOf = (d: PlanDay) => Object.fromEntries(d.blocks.flatMap((b) => b.items.map((i) => [i.exerciseId, b.sets])));

const day: PlanDay = {
  n: 1,
  name: 'Constructed',
  blocks: [
    stretch('static-quadricep-stretch'),
    stretch('static-proximal-hamstring-stretch'),
    stretch('static-pigeon-stretch'),
    blk('barbell-back-squat', 4, 150),
    blk('dumbbell-bench-press', 4, 120),
    blk('barbell-bent-over-row', 3, 120),
    blk('barbell-bicep-curl', 4),
    blk('machine-seated-chest-fly', 4),
    pair('dumbbell-lateral-raise', 'machine-seated-reverse-fly', 3),
    blk('cable-rope-tricep-extension', 4),
    blk('machine-seated-calf-raise', 4),
    blk('wrist-twist', 3),
  ],
} as PlanDay;
const full = estimateDayMinutes(day);
const compounds = ['barbell-back-squat', 'dumbbell-bench-press'];
const names = (d: PlanDay, id: string) => d.blocks.flatMap((b) => b.items).find((i) => i.exerciseId === id)!.name;

describe('verify 3.6 check 2: trim order on a constructed day', () => {
  it('sweep every budget with a logged curl', () => {
    const logged = { 'barbell-bicep-curl': 1 };
    const accessories = ['barbell-bicep-curl', 'machine-seated-chest-fly', 'dumbbell-lateral-raise', 'machine-seated-reverse-fly', 'cable-rope-tricep-extension', 'machine-seated-calf-raise', 'wrist-twist'];
    console.log('FULL', full);
    let sawSets = false, sawDrop = false, sawMob = false;
    for (let budget = 74; budget >= 5; budget--) {
      const r = trimDay(day, { budget, profileOf, logged });
      const again = trimDay(day, { budget, profileOf, logged });
      expect(JSON.stringify(again.trim)).toBe(JSON.stringify(r.trim)); // deterministic
      const out = r.day;
      const left = idsOf(out);
      for (const id of left) expect(idsOf(day)).toContain(id); // nothing added
      const was = setsOf(day), now = setsOf(out);
      for (const id of left) if (!['static-quadricep-stretch','static-proximal-hamstring-stretch','static-pigeon-stretch'].includes(id)) expect(now[id]).toBeLessThanOrEqual(was[id]!);
      for (const c of compounds) { expect(left).toContain(c); expect(now[c]).toBe(was[c]); }
      expect(left).toContain('barbell-bicep-curl'); expect(now['barbell-bicep-curl']).toBeGreaterThanOrEqual(1);
      expect(left.includes('dumbbell-lateral-raise')).toBe(left.includes('machine-seated-reverse-fly')); // pair whole
      if (left.includes('dumbbell-lateral-raise')) expect(now['dumbbell-lateral-raise']).toBe(now['machine-seated-reverse-fly']);
      if (r.trim) {
        if (r.trim.sets && Object.keys(r.trim.sets).length) { sawSets = true; expect(r.trim.mobility?.length ?? 0).toBeGreaterThan(0); }
        if (r.trim.drop.length) {
          sawDrop = true;
          expect(r.trim.mobility?.length).toBe(3);
          // every kept, non-logged accessory is already at 2 or fewer
          for (const id of accessories) if (left.includes(id) && id !== 'barbell-bicep-curl') { if (now[id]! > 2) console.log('VIOLATION sets>2 kept while dropping at', budget, id, now[id]); }
          // drops are from the end of the day (suffix among droppable accessories)
          const droppable = accessories.filter((a) => a !== 'barbell-bicep-curl');
          const dropped = droppable.filter((a) => !left.includes(a));
          const firstDropIdx = Math.min(...dropped.map((a) => droppable.indexOf(a)));
          for (const a of droppable.slice(firstDropIdx)) if (left.includes(a)) console.log('VIOLATION not a suffix at', budget, 'kept', a, 'dropped', dropped);
        }
        if (r.trim.mobility?.length) sawMob = true;
        // words match what changed
        const words = changeWords(r.changes);
        const cutNames = idsOf(day).filter((i) => !left.includes(i)).map((i) => names(day, i));
        const cutLine = words.find((w) => w.startsWith('Cut: '));
        if (cutNames.length) expect(cutLine).toBe(`Cut: ${cutNames.join(', ')}`); else expect(cutLine).toBeUndefined();
        for (const w of words.filter((x) => x.startsWith('Fewer sets'))) {
          const m = /^Fewer sets: (.*) · (\d+) → (\d+)$/.exec(w)!;
          for (const n of m[1]!.split(', ')) {
            const id = idsOf(day).find((i) => names(day, i) === n)!;
            expect(was[id]).toBe(Number(m[2])); expect(now[id]).toBe(Number(m[3]));
          }
        }
        const mw = words.find((x) => x.startsWith('Stretches'));
        if (r.trim.mobility?.length) expect(mw).toBe(`Stretches in one quick block: ${r.trim.mobility.map((i) => names(day, i)).join(', ')}`);
        expect(applyTrim(day, r.trim, 0).blocks.length).toBe(out.blocks.length);
        expect(r.minutes).toBe(estimateDayMinutes(out));
      }
      if (r.fits) expect(r.minutes).toBeLessThanOrEqual(budget);
    }
    expect(sawSets && sawDrop && sawMob).toBe(true);
  });

  it('step order at representative budgets', () => {
    const w = (b: number) => { const r = trimDay(day, { budget: b, profileOf }); return { r, words: changeWords(r.changes) }; };
    for (const b of [74, 70, 60, 50, 45, 40, 35, 30, 20]) { const { r, words } = w(b); console.log('B', b, r.minutes, r.fits, JSON.stringify(words)); }
  });

  it('logged sets: a 4-set row with 3 logged is never cut below 3, and an exercise with sets is never dropped', () => {
    const logged = { 'barbell-bicep-curl': 3, 'wrist-twist': 1, 'machine-seated-calf-raise': 1 };
    const r = trimDay(day, { budget: 20, profileOf, logged });
    const left = idsOf(r.day), now = setsOf(r.day);
    expect(left).toContain('wrist-twist'); expect(left).toContain('machine-seated-calf-raise');
    expect(now['barbell-bicep-curl']).toBeGreaterThanOrEqual(3);
  });

  it('a day whose first two compounds alone exceed the budget', () => {
    const d2 = { ...day, blocks: [blk('barbell-back-squat', 5, 180), blk('dumbbell-bench-press', 5, 180), blk('wrist-twist', 2), blk('machine-seated-calf-raise', 2)] } as PlanDay;
    const r = trimDay(d2, { budget: 20, profileOf });
    console.log('SHORT', r.minutes, r.fits, fitWords(r), JSON.stringify(changeWords(r.changes)));
    expect(r.fits).toBe(false);
    expect(idsOf(r.day)).toEqual(expect.arrayContaining(compounds));
    expect(fitWords(r)).toBe(`Shortest it goes: ~${r.minutes} min`);
  });
});

describe('dbg2', () => {
  it('restore step on constructed day', () => {
    for (const logged of [{} as Record<string, number>, { 'barbell-bicep-curl': 1 } as Record<string, number>]) {
      const r = trimDay(day, { budget: 51, profileOf, logged });
      console.log('D51', JSON.stringify(logged), r.minutes, JSON.stringify(r.trim), JSON.stringify(changeWords(r.changes)), JSON.stringify(setsOf(r.day)));
    }
  });
  it('all shipped plan days: kept accessory with >2 sets while another accessory is cut', () => {
    let n = 0, bad = 0;
    for (const p of PLANS) for (const d of p.days) for (const budget of [20, 30, 45, 60]) {
      n++;
      const r = trimDay(d, { budget, profileOf });
      if (!r.trim?.drop.length) continue;
      const left = r.day;
      const droppedAcc = r.trim.drop;
      const keptBig = left.blocks.filter((b: PlanBlock) => !b.warmup && !b.mobility && b.items.every((i) => { const k = profileOf(i.exerciseId, i.name); return k.role === 'lift' && !isCompound(k); }) && b.sets !== undefined && b.sets > 2);
      if (keptBig.length && droppedAcc.length) { bad++; console.log('SHIPPED-VIOL', p.id, d.n, budget, keptBig.map((b: PlanBlock) => b.items[0]!.name + ':' + b.sets).join(','), 'cut', droppedAcc.join(',')); }
    }
    console.log('SHIPPED scanned', n, 'viol', bad);
  });
});

describe('verify 3.6 round 2: bringing blocks back keeps the SPEC 7.4 order', () => {
  const accessories = ['barbell-bicep-curl', 'machine-seated-chest-fly', 'dumbbell-lateral-raise', 'machine-seated-reverse-fly', 'cable-rope-tricep-extension', 'machine-seated-calf-raise', 'wrist-twist'];
  const check = (d: PlanDay, budget: number, logged: Record<string, number>) => {
    const r = trimDay(d, { budget, profileOf, logged });
    if (!r.trim?.drop.length) return;
    const left = idsOf(r.day);
    const now = setsOf(r.day);
    const free = accessories.filter((a) => !logged[a] && idsOf(d).includes(a));
    // Accessory sets to 2 first: nothing kept above 2 while any accessory is cut.
    for (const a of free) if (left.includes(a)) expect(now[a], `${a} at ${budget}`).toBeLessThanOrEqual(2);
    // Then drop last first: the cut accessories are the tail of the day's accessories.
    const cut = free.filter((a) => !left.includes(a));
    if (cut.length) expect(free.slice(free.length - cut.length), `suffix at ${budget}`).toEqual(cut);
  };
  it('the 51 min case: Wrist Twist never keeps 3 sets while earlier accessories are cut', () => {
    const r = trimDay(day, { budget: 51, profileOf });
    expect(r.trim!.drop.length).toBeGreaterThan(0);
    const now = setsOf(r.day);
    if (idsOf(r.day).includes('wrist-twist')) expect(now['wrist-twist']).toBeLessThanOrEqual(2);
    check(day, 51, {});
  });
  it('every budget, with and without a logged curl', () => {
    for (const logged of [{}, { 'barbell-bicep-curl': 1 }] as Record<string, number>[]) for (let b = 74; b >= 5; b--) check(day, b, logged);
  });
});
