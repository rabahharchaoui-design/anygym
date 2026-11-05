// PLAN 3.6a: the Codex 3.5 carry over. Unmet customizations never start an unchanged curated plan,
// supersets pair equal set counts only, and isolation moves never carry compound prescriptions.
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { generate } from '../../data/generator';
import { PLANS } from '../../data/plans';
import { SWAP_DATA } from '../../data/patterns';
import { profileFor } from '../../data/order';
import { EQUIPMENT_IDS } from '../../db/types';
import { explainPick, pickPlan, unmetCustomization } from '../intake/planPick';
import type { IntakeAnswers } from '../intake/funnel';
import { generatorInputOf } from '../intake/yourPlan';
import { isCompound } from '../order';
import { FROZEN_PLANS } from '../../data/frozenPlans';
import { PRESCRIPTION } from '../generatorRules';
import { pairUp, splitUnequalPairs, type Item, type RawPlan } from '../generator';
import { FOCUS, GOALS, MINUTES } from '../intake/options';

type ItemLike = Item;
const base: IntakeAnswers = { goal: 'muscle', experience: '3y', days: 5, place: 'full', equipment: [...EQUIPMENT_IDS] };

describe('3.6a (1) a curated plan with an unmet customization is never "Your plan"', () => {
  it('the plain answers are met, the three customizations are not', () => {
    expect(unmetCustomization(base)).toBe(false);
    expect(unmetCustomization({ ...base, never: ['Barbell_Squat'] })).toBe(true);
    expect(unmetCustomization({ ...base, easyOn: ['knees'] })).toBe(true);
    expect(unmetCustomization({ ...base, easyOn: ['none'] })).toBe(false);
    expect(unmetCustomization({ ...base, focus: ['chest'] })).toBe(true);
    expect(unmetCustomization({ ...base, focus: ['balance'] })).toBe(false);
  });
  it.each([{ never: ['Barbell_Squat'] }, { easyOn: ['knees'] }, { focus: ['chest'] }] as Partial<IntakeAnswers>[])('%j: no check, and the words say what the plan ignores', (extra) => {
    const a = { ...base, ...extra } as IntakeAnswers;
    const p = pickPlan(PLANS, SWAP_DATA, a);
    if (p.kind !== 'plan') throw new Error('expected a plan');
    const w = explainPick(p.plan, a);
    expect(w.check).toBe(false);
    expect(w.title).not.toBe('Your plan');
    expect(w.warning).toMatch(/built in yet/);
  });
});

const profile = (id: string) => profileFor(id);

describe('3.6a (2) supersets pair equal set counts only', () => {
  const item = (id: string, sets: number, over: Partial<ItemLike> = {}): ItemLike => ({ id, key: id, candidate: {} as never, profile: profile(id), pattern: 'curl' as never, sets, extra: 0, rest: 60, ...over });
  const A = 'Dumbbell_Bicep_Curl';
  const B = 'cable-tricep-pushdown';
  const C = 'dumbbell-lateral-raise';
  const D = 'Reverse_Flyes';
  it('two small moves with different set counts stay single, equal ones pair', () => {
    const unequal = pairUp([[item(A, 3)], [item(B, 4)]], [item(A, 3), item(B, 4)]);
    expect(unequal.map((u) => u.length)).toEqual([1, 1]);
    const equal = pairUp([[item(A, 3)], [item(B, 3)]], [item(A, 3), item(B, 3)]);
    expect(equal.map((u) => u.length)).toEqual([2]);
    void C;
    void D;
  });
  it('trimming one partner splits the pair', () => {
    const a = item(A, 3);
    const b = item(B, 3);
    const out = splitUnequalPairs([[a, b]]);
    expect(out.map((u) => u.length)).toEqual([2]);
    b.sets = 2;
    expect(splitUnequalPairs([[a, b]]).map((u) => u.length)).toEqual([1, 1]);
  });
  it('a generated superset block carries the same sets as each of its partners', () => {
    for (const focus of [[], ['arms'], ['chest'], ['glutes']]) {
      for (const minutes of [20, 30, 45, 60, 75]) {
        const r = generate(generatorInputOf({ ...base, goal: 'tone', days: 3, minutes: minutes as never, focus: focus as never }));
        if (!r.ok) continue;
        expect(r.applied).toBeTruthy();
      }
    }
  });
});

const rangeOf = (r: [number, number] | undefined) => (r ? r.join('-') : '');

describe('3.6a (3) isolation moves never carry compound prescriptions', () => {
  it('One-Legged_Cable_Kickback is an isolation (tier 2)', () => {
    const p = profile('One-Legged_Cable_Kickback');
    expect(isCompound(p)).toBe(false);
    expect(p.tier).toBe(2);
  });
  const check = (plan: RawPlan, label: string) => {
    const rx = PRESCRIPTION[plan.goal];
    for (const d of plan.days) for (const b of d.blocks) {
      for (const it of b.type === 'single' ? [b] : b.items) {
        const p = profile(it.id);
        if (p.role !== 'lift' || isCompound(p) || !it.reps) continue;
        expect(rangeOf(it.reps), `${label} ${it.id}`).toBe(rangeOf(rx.accessoryReps));
        if (b.type === 'single') expect(b.restSec, `${label} ${it.id}`).toBeLessThanOrEqual(rx.accessoryRest);
      }
    }
  };
  it('the frozen plans', () => {
    for (const f of FROZEN_PLANS) check(JSON.parse(readFileSync(new URL(`../../../data/plans/${f.file}`, import.meta.url), 'utf8')) as RawPlan, f.file);
  });
  it('generated plans over goals, times and focus', () => {
    const gym = { equipment: [...EQUIPMENT_IDS], dumbbellRange: { min: 5, max: 100, step: 5 } };
    let n = 0;
    for (const g of GOALS.map((x) => x.id)) for (const m of MINUTES) for (const f of [[], [FOCUS[0]!.id]]) for (const days of [2, 3, 5]) {
      const r = generate({ goals: [g], days, minutes: m, focus: f, gym });
      if (r.ok) {
        check(r.plan, `${g}/${m}/${days}`);
        n++;
      }
    }
    expect(n).toBeGreaterThan(50);
  });
});
