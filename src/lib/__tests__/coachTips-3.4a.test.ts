// PLAN 3.4a, SPEC 22: Coach tips on the curated plans. G's split (shown as "Classic 5 Day Split") is
// the worked example: exactly the six SPEC 22 tips are raised on it, nothing it already does right
// is flagged, and every tip's Apply makes a tuned copy through order.ts without touching the plan.
import { describe, expect, it } from 'vitest';
import { PLANS, basePlanOf, planById } from '../../data/plans';
import { profileFor } from '../../data/order';
import { applyTips, parseTunedId, planTips, tunedId, tunedName, tunedPlan, TIP_IDS, HEAVY_REST_SEC, type TipId } from '../coachTips';
import { dayWorkout } from '../planWorkout';
import type { Plan } from '../plans';

const profile = (id: string) => profileFor(id);
const split = planById('five-day-split')!;
const sixWeek = planById('six-week-volume')!;
const ids = (p: Plan, n: number) => p.days.find((d) => d.n === n)!.blocks.map((b) => b.items.map((i) => i.exerciseId).join('+'));
const tip = (p: Plan, id: TipId) => planTips(p, profile).find((t) => t.id === id);

describe("G's split: the six SPEC 22 tips and no false flags", () => {
  it('raises exactly the six tips SPEC 22 names, in order', () => {
    expect(planTips(split, profile).map((t) => t.id)).toEqual(['hinge', 'stretch', 'rest', 'pair', 'freq', 'core']);
  });

  it('(1) hamstring focus day: the Romanian deadlift is 6th; Apply makes it squat → RDL → leg curl → the rest', () => {
    const t = tip(split, 'hinge')!;
    expect(t.days).toEqual([1]);
    expect(t.title).toBe('Legs (hamstring focus): Barbell Straight Leg Romanian Deadlift is 6th');
    const day = ids(applyTips(split, ['hinge'], profile), 1);
    const lifts = day.filter((id) => !/stretch|raise|sit-up|plank|twist|climber|crunch/.test(id));
    expect(lifts).toEqual(['barbell-back-squat', 'barbell-straight-leg-romanian-deadlift', 'machine-lying-leg-curl', 'angled-machine-leg-press', 'dumbbell-walking-lunge', 'machine-seated-leg-extension']);
    // The quad focus day already trains its focus first: not flagged.
    expect(t.days).not.toContain(4);
  });

  it('(2) both leg days: static stretches before lifting; Apply keeps the dynamic warm up first and moves the holds last', () => {
    const t = tip(split, 'stretch')!;
    expect(t.days).toEqual([1, 4]);
    const tuned = applyTips(split, ['stretch'], profile);
    for (const n of [1, 4]) {
      const day = ids(tuned, n);
      expect(day[0]).toBe('dynamic-hip-flexor-stretch');
      expect(day.slice(-3)).toEqual(['static-quadricep-stretch', 'static-proximal-hamstring-stretch', 'static-pigeon-stretch']);
      expect(day.length).toBe(ids(split, n).length);
    }
  });

  it('(3) heavy compounds rest 90 s or less: back squat, leg press, Arnold press, barbell incline; Apply sets 2.5 min', () => {
    const t = tip(split, 'rest')!;
    expect(t.title).toBe('Barbell Back Squat, Barbell Incline Bench Press, Machine Leg Press and Dumbbell Arnold Shoulder Press rest 90 s or less');
    expect(t.days).toEqual([1, 2, 4, 5]);
    const tuned = applyTips(split, ['rest'], profile);
    const restOf = (p: Plan, id: string) => p.days.flatMap((d) => d.blocks).find((b) => b.items.some((i) => i.exerciseId === id))!.restSec;
    for (const id of ['barbell-back-squat', 'barbell-incline-bench-press', 'machine-leg-press', 'dumbbell-arnold-shoulder-press']) expect(restOf(tuned, id)).toBe(HEAVY_REST_SEC);
    // Rows, pull ups and the dumbbell bench keep the plan's own rest.
    for (const id of ['barbell-bent-over-row', 'wide-grip-pull-up', 'dumbbell-bench-press']) expect(restOf(tuned, id)).toBe(restOf(split, id));
  });

  it('(4) the barbell incline + incline plate press pair works the chest back to back; Apply splits it into straight sets', () => {
    const t = tip(split, 'pair')!;
    expect(t.days).toEqual([2]);
    expect(t.title).toBe('Barbell Incline Bench Press and Incline Plate Press are paired');
    const day = applyTips(split, ['pair'], profile).days[1]!;
    const incline = day.blocks.find((b) => b.items[0]!.exerciseId === 'barbell-incline-bench-press')!;
    const plate = day.blocks.find((b) => b.items[0]!.exerciseId === 'incline-plate-press')!;
    expect(incline).toMatchObject({ kind: 'single', sets: 4, restSec: 90 });
    expect(plate).toMatchObject({ kind: 'single', sets: 4, restSec: 90 });
    // The warm up pair is not a training pair: it stays.
    expect(day.blocks[0]).toMatchObject({ kind: 'pair', warmup: true });
  });

  it('(5) chest, back, hamstrings and shoulders get one session a week; Apply adds 3 sets of each elsewhere, same split', () => {
    const t = tip(split, 'freq')!;
    expect(t.title).toBe('Chest, back, shoulders and hamstrings get one session a week');
    expect(t.detail).toEqual(['Dumbbell Bench Press → Day 5', 'Wide Grip Pull Up → Day 5', 'Dumbbell Arnold Shoulder Press → Day 2', 'Barbell Straight Leg Romanian Deadlift → Day 4']);
    const tuned = applyTips(split, ['freq'], profile);
    expect(tuned.days.map((d) => d.name)).toEqual(split.days.map((d) => d.name));
    expect(ids(tuned, 5).slice(0, 4)).toEqual(['band-internal-shoulder-rotation-0-degrees+band-internal-shoulder-rotation-90-degrees', 'dumbbell-arnold-shoulder-press', 'dumbbell-bench-press', 'wide-grip-pull-up']);
    const added = tuned.days[4]!.blocks[2]!;
    expect(added).toMatchObject({ kind: 'single', sets: 3, restSec: 90 });
    expect(added.items[0]!.note).toBeUndefined();
    // Never a day that already has the exercise.
    for (const d of tuned.days) {
      const list = d.blocks.flatMap((b) => b.items.map((i) => i.exerciseId));
      expect(new Set(list).size).toBe(list.length);
    }
  });

  it('(6) abs: 6 exercises twice a week; Apply keeps a 3 exercise core block', () => {
    const t = tip(split, 'core')!;
    expect(t.days).toEqual([1, 4]);
    const tuned = applyTips(split, ['core'], profile);
    for (const n of [1, 4]) {
      const core = ids(tuned, n).filter((id) => ['lying-straight-leg-raise', 'decline-bench-sit-up', 'elbow-plank', 'plate-russian-twist', 'cross-body-mountain-climber', 'curl-up-crunch'].includes(id));
      expect(core).toEqual(['lying-straight-leg-raise', 'decline-bench-sit-up', 'elbow-plank']);
    }
  });

  it('things the split already does right are not flagged', () => {
    const all = planTips(split, profile);
    const text = all.map((t) => `${t.title} ${t.why} ${(t.detail ?? []).join(' ')}`).join(' | ');
    // Pull ups and rows before biceps, bench before triceps, calves and forearms last, Arnold press first.
    for (const word of ['Bicep', 'Curl', 'Tricep', 'Calf', 'Forearm', 'Wrist']) expect(text).not.toContain(word);
    expect(all.some((t) => t.id === 'hinge' && t.days.includes(5))).toBe(false);
    // Day 3 (back and biceps) is touched by no tip.
    for (const t of all) expect(t.days).not.toContain(3);
    // The tuned Day 5 still opens with the Arnold press after its warm up.
    expect(ids(applyTips(split, [...TIP_IDS], profile), 5)[1]).toBe('dumbbell-arnold-shoulder-press');
  });
});

describe('Six Week Volume Builder: only what its own data shows', () => {
  it('raises only the frequency tip (hamstrings only on day 4); no stated rests, pairs, stretches or focus days to flag', () => {
    const all = planTips(sixWeek, profile);
    expect(all.map((t) => t.id)).toEqual(['freq']);
    expect(all[0]!.title).toBe('Hamstrings get one session a week');
    expect(all[0]!.detail).toEqual(['Deadlift → Day 1']);
  });

  it('the HIIT and abs day is an abs day, not an abs add on: no core tip', () => {
    expect(tip(sixWeek, 'core')).toBeUndefined();
  });

  it('an added weekly table exercise keeps its reps and caps its sets at 3', () => {
    const tuned = applyTips(sixWeek, ['freq'], profile);
    const block = tuned.days[0]!.blocks.find((b) => b.items[0]!.exerciseId === 'deadlift')!;
    const original = sixWeek.days[3]!.blocks.find((b) => b.items[0]!.exerciseId === 'deadlift')!;
    expect(block.items[0]!.weeks).toEqual(original.items[0]!.weeks!.map((w) => ({ ...w, sets: 3 })));
    expect(dayWorkout(tuned, 0, 2).find((e) => e.exerciseId === 'deadlift')).toMatchObject({ sets: 3, reps: 10 });
  });
});

describe('every tip over both plans', () => {
  it('Apply never changes the original, and any order of taps gives the same copy', () => {
    for (const p of PLANS) {
      const before = JSON.stringify(p);
      const tips = planTips(p, profile).map((t) => t.id);
      const all = applyTips(p, tips, profile);
      expect(applyTips(p, [...tips].reverse(), profile)).toEqual(all);
      expect(JSON.stringify(p)).toBe(before);
      // Same days, every exercise still a plan exercise, nothing lost but trimmed core moves.
      expect(all.days.map((d) => d.n)).toEqual(p.days.map((d) => d.n));
      for (const d of all.days) for (const b of d.blocks) for (const it of b.items) expect(profileFor(it.exerciseId)).toBeTruthy();
    }
  });

  it('each tip alone changes the plan, and a plan with no tips gives no copy', () => {
    for (const p of PLANS) {
      for (const t of planTips(p, profile)) expect(JSON.stringify(applyTips(p, [t.id], profile))).not.toBe(JSON.stringify(p));
      expect(tunedPlan(p, [], profile)).toBeNull();
    }
    expect(tunedPlan(sixWeek, ['pair'], profile)).toBeNull();
  });

  it('every tip speaks in plain one line words', () => {
    for (const p of PLANS) {
      for (const t of planTips(p, profile)) {
        expect(t.title).toMatch(/^[A-Z][^\n]+$/);
        expect(t.why).toMatch(/^[A-Z][^\n]+\.$/);
        expect(`${t.title} ${t.why}`).not.toMatch(/OhRabah|Rabah|\bG\b/);
      }
    }
  });
});

describe('tuned copies', () => {
  it('ids carry the tips in SPEC 22 order; parse round trips', () => {
    expect(tunedId('five-day-split', ['core', 'rest'])).toBe('five-day-split~coach-rest.core');
    expect(tunedId('five-day-split', [])).toBe('five-day-split');
    expect(parseTunedId('five-day-split~coach-rest.core')).toEqual({ baseId: 'five-day-split', tips: ['rest', 'core'] });
    expect(parseTunedId('six-week-volume')).toEqual({ baseId: 'six-week-volume', tips: [] });
    expect(parseTunedId('five-day-split~coach-nope')).toEqual({ baseId: 'five-day-split', tips: [] });
  });

  it('planById builds the copy, named "(coach tuned)", the original one lookup away', () => {
    const id = tunedId('five-day-split', ['hinge', 'pair']);
    const copy = planById(id)!;
    expect(copy.id).toBe(id);
    expect(copy.name).toBe(tunedName('Classic 5 Day Split'));
    expect(copy.name).toBe('Classic 5 Day Split (coach tuned)');
    expect(basePlanOf(id)).toBe(split);
    expect(planById('five-day-split')).toBe(split);
    expect(ids(copy, 1)).toEqual(ids(applyTips(split, ['hinge', 'pair'], profile), 1));
    // Not the canonical id, or a tip that does not apply: no plan (never a guessed copy).
    expect(planById('five-day-split~coach-pair.hinge')).toBeUndefined();
    expect(planById('six-week-volume~coach-pair')).toBeUndefined();
    expect(planById('nope~coach-pair')).toBeUndefined();
    expect(planById(undefined)).toBeUndefined();
  });
});
