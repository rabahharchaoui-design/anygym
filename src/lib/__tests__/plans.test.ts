import { describe, expect, it } from 'vitest';
import fiveDayRaw from '../../../data/plans/five-day-split.json';
import sixWeekRaw from '../../../data/plans/six-week-volume.json';
import list from '../../../data/plan-exercises.json';
import { PLANS, planById, resolvePlanExercise } from '../../data/plans';
import {
  advancePlan,
  amountText,
  blockRest,
  clampWeek,
  dayIdOf,
  dayIndexOf,
  estimateDayMinutes,
  itemLine,
  itemTarget,
  normalizePlan,
  finisherText,
  restFromNote,
  setsText,
  type PlanBlock,
  type PlanDay,
} from '../plans';

const split5 = planById('five-day-split')!;
const sixWeek = planById('six-week-volume')!;
const ids = new Set((list as Array<{ id: string }>).map((e) => e.id));

/** Every exercise name anywhere in a raw plan file. */
const rawNames = (node: unknown): string[] => {
  if (Array.isArray(node)) return node.flatMap(rawNames);
  if (!node || typeof node !== 'object') return [];
  return Object.entries(node).flatMap(([k, v]) => (k === 'exercise' && typeof v === 'string' ? [v] : rawNames(v)));
};

describe('every plan exercise resolves to data/plan-exercises.json', () => {
  for (const [name, raw] of [['five-day-split', fiveDayRaw], ['six-week-volume', sixWeekRaw]] as const) {
    it(name, () => {
      const names = rawNames(raw);
      expect(names.length).toBeGreaterThan(20);
      const missing = names.filter((n) => !resolvePlanExercise(n));
      expect(missing, `missing from data/plan-exercises.json (run npm run plan-exercises): ${missing.join(', ')}`).toEqual([]);
      const plan = planById(name)!;
      for (const it of plan.days.flatMap((d) => d.blocks.flatMap((b) => b.items))) expect(ids.has(it.exerciseId), it.name).toBe(true);
    });
  }

  it('a name that is not in the list throws loudly', () => {
    const bad = { id: 'x', days: [{ n: 1, name: 'A', blocks: [{ type: 'single', exercise: 'Moon Squat', sets: 3, reps: 5 }] }] };
    expect(() => normalizePlan(bad, resolvePlanExercise)).toThrow(/Moon Squat.*x day 1 block 1/);
    expect(() => normalizePlan({ days: [{ items: [{ weeks: [] }] }] }, resolvePlanExercise)).toThrow(/undefined/);
  });

  it('each exercise appears once per day (the workout keys cards by exercise)', () => {
    for (const plan of PLANS)
      for (const day of plan.days) {
        const dayIds = day.blocks.flatMap((b) => b.items.map((i) => i.exerciseId));
        expect(new Set(dayIds).size, `${plan.id} day ${day.n}`).toBe(dayIds.length);
      }
  });
});

describe('normalizePlan: Classic 5 Day Split (blocks)', () => {
  it('keeps the plan facts', () => {
    expect(split5).toMatchObject({
      id: 'five-day-split',
      name: 'Classic 5 Day Split',
      gymType: 'full',
      goal: 'muscle',
      level: 'intermediate',
      daysPerWeek: 5,
      progressionMode: 'double',
    });
    expect(split5.weeks).toBeUndefined();
    expect(split5.summary).toMatch(/^5 day bodybuilding split/);
    expect(split5.days.map((d) => d.name)).toEqual([
      'Legs (hamstring focus)',
      'Chest and triceps',
      'Back and biceps',
      'Legs (quad focus)',
      'Shoulders and calves',
    ]);
    expect(split5.days[0]!.addOn).toBe('Abs');
    expect(split5.days[1]!.addOn).toBeUndefined();
  });

  it('day 1: stretches as holds, then the squat with its note', () => {
    const [stretch, , , , squat] = split5.days[0]!.blocks;
    expect(stretch).toEqual({ kind: 'single', items: [{ exerciseId: 'static-quadricep-stretch', name: 'Static Quadricep Stretch', seconds: 45 }] });
    expect(squat).toEqual({
      kind: 'single',
      sets: 4,
      restSec: 90,
      items: [{ exerciseId: 'barbell-back-squat', name: 'Barbell Back Squat', reps: [8, 12], note: 'Wide stance' }],
    });
    const plank = split5.days[0]!.blocks.find((b) => b.items[0]!.exerciseId === 'elbow-plank')!;
    expect(plank.items[0]!.seconds).toEqual([60, 90]);
    const climber = split5.days[0]!.blocks.find((b) => b.items[0]!.exerciseId === 'cross-body-mountain-climber')!;
    expect(climber.items[0]).toMatchObject({ reps: 20, eachSide: true });
  });

  it('day 2: the warm up pair and the working pair', () => {
    const [warm, , pair] = split5.days[1]!.blocks;
    expect(warm).toMatchObject({ kind: 'pair', warmup: true, sets: 3 });
    expect(warm!.restSec).toBeUndefined();
    expect(warm!.items.map((i) => i.exerciseId)).toEqual(['band-internal-shoulder-rotation-0-degrees', 'band-internal-shoulder-rotation-90-degrees']);
    expect(warm!.items[0]!.note).toBe('Warm up. Band, cable or dumbbell');
    expect(pair).toMatchObject({ kind: 'pair', sets: 4, restSec: 90 });
    expect(pair!.warmup).toBeUndefined();
    expect(pair!.items.map((i) => i.name)).toEqual(['Barbell Incline Bench Press', 'Incline Plate Press']);
  });
});

describe('normalizePlan: Six Week Volume Builder (week table)', () => {
  it('keeps the plan facts', () => {
    expect(sixWeek).toMatchObject({ id: 'six-week-volume', weeks: 6, progressionMode: 'weekly_table', daysPerWeek: 5 });
    expect(sixWeek.days).toHaveLength(5);
  });

  it('each item is a single block with its 6 week table', () => {
    const [front] = sixWeek.days[0]!.blocks;
    expect(front!.kind).toBe('single');
    expect(front!.sets).toBeUndefined();
    expect(front!.items[0]).toMatchObject({ exerciseId: 'front-squat', name: 'Front Squat' });
    expect(front!.items[0]!.weeks).toEqual([6, 7, 8, 9, 10, 11].map((reps) => ({ sets: 5, reps })));
    const legExt = sixWeek.days[0]!.blocks[3]!.items[0]!;
    expect(legExt.note).toBe('10 seconds rest between sets');
  });

  it('rounds become sets, and the sprint holds for the 30 seconds in its name', () => {
    const sprint = sixWeek.days[2]!.blocks[0]!.items[0]!;
    expect(sprint.weeks).toEqual([10, 12, 14, 16, 18, 20].map((sets) => ({ sets, rounds: true })));
    expect(sprint.seconds).toBe(30);
  });
});

describe('itemTarget: week table lookup', () => {
  const front = sixWeek.days[0]!.blocks[0]!;
  it('reads the week row, and stays on the last week past the table', () => {
    expect(itemTarget(front, front.items[0]!, 0)).toEqual({ sets: 5, reps: 6 });
    expect(itemTarget(front, front.items[0]!, 3)).toEqual({ sets: 5, reps: 9 });
    expect(itemTarget(front, front.items[0]!, 5)).toEqual({ sets: 5, reps: 11 });
    expect(itemTarget(front, front.items[0]!, 9)).toEqual({ sets: 5, reps: 11 });
    expect(itemTarget(front, front.items[0]!, -1)).toEqual({ sets: 5, reps: 6 });
    const m28 = sixWeek.days[0]!.blocks[4]!;
    expect([0, 1, 2, 3, 4, 5].map((w) => itemTarget(m28, m28.items[0]!, w).sets)).toEqual([3, 3, 4, 4, 5, 5]);
  });
  it('without a table: the block sets with the item reps; a lone hold is one set', () => {
    const squat = split5.days[0]!.blocks[4]!;
    expect(itemTarget(squat, squat.items[0]!)).toEqual({ sets: 4, reps: [8, 12] });
    const stretch = split5.days[0]!.blocks[0]!;
    expect(itemTarget(stretch, stretch.items[0]!)).toEqual({ sets: 1, seconds: 45 });
    const sprint = sixWeek.days[2]!.blocks[0]!;
    expect(itemTarget(sprint, sprint.items[0]!, 1)).toEqual({ sets: 12, seconds: 30, rounds: true });
  });
  it('clampWeek', () => {
    expect(clampWeek(2.7, 6)).toBe(2);
    expect(clampWeek(8, 6)).toBe(5);
    expect(clampWeek(3, 0)).toBe(0);
  });
});

describe('plain words', () => {
  const squat = split5.days[0]!.blocks[4]!;
  it('item lines', () => {
    expect(itemLine(squat, squat.items[0]!)).toBe('4 sets × 8 to 12 · 90 s rest');
    const stretch = split5.days[0]!.blocks[0]!;
    expect(itemLine(stretch, stretch.items[0]!)).toBe('45 sec');
    const front = sixWeek.days[0]!.blocks[0]!;
    // The six week table states no rest: no rest line (the timer still uses the 90 s default).
    expect(itemLine(front, front.items[0]!, 0)).toBe('5 sets × 6');
    expect(itemLine(front, front.items[0]!, 5)).toBe('5 sets × 11');
    expect(blockRest(front)).toBe(90);
    // A rest the plan states in a note is the plan's rest.
    const legExt = sixWeek.days[0]!.blocks[3]!;
    expect(itemLine(legExt, legExt.items[0]!, 0)).toBe('10 sets × 10 · 10 s rest');
    const legCurl = sixWeek.days[3]!.blocks.find((b) => b.items[0]!.exerciseId === 'leg-curl')!;
    expect(legCurl.restSec).toBe(10);
    expect(legCurl.items[0]!.note).toBe('10 seconds rest between sets');
    // Rounds of a timed interval.
    const sprint = sixWeek.days[2]!.blocks[0]!;
    expect(itemLine(sprint, sprint.items[0]!, 0)).toBe('10 rounds × 30 sec');
    expect(itemLine(sprint, sprint.items[0]!, 5)).toBe('20 rounds × 30 sec');
    // The 5 day split warm up pair states no rest either.
    const warm = split5.days[1]!.blocks[0]!;
    expect(itemLine(warm, warm.items[0]!)).toBe('3 sets × 10 to 12');
  });
  it('setsText and amountText', () => {
    expect(setsText({ sets: 3, seconds: [60, 90] })).toBe('3 sets × 60 to 90 sec');
    expect(setsText({ sets: 1, reps: 10 })).toBe('1 set × 10');
    expect(setsText({ sets: 10 })).toBe('10 sets');
    expect(setsText({ sets: 1, seconds: 30, rounds: true })).toBe('1 round × 30 sec');
    expect(amountText({ reps: [8, 12] })).toBe('8 to 12 reps');
    expect(amountText({ reps: 20 }, true)).toBe('20 reps each side');
    expect(amountText({ seconds: 45 })).toBe('45 sec');
    expect(amountText({})).toBe('');
  });
  it('blockRest: the block, else 90 s, and none after a lone stretch', () => {
    expect(blockRest(squat)).toBe(90);
    expect(blockRest(split5.days[1]!.blocks[0]!)).toBe(90);
    expect(blockRest(split5.days[0]!.blocks[0]!)).toBe(0);
    expect(blockRest(sixWeek.days[2]!.blocks[0]!)).toBe(90);
  });
});

describe('estimateDayMinutes (SPEC 7.4)', () => {
  const block = (b: Partial<PlanBlock> & Pick<PlanBlock, 'items'>): PlanBlock => ({ kind: 'single', ...b });
  const item = (exerciseId: string, extra = {}) => ({ exerciseId, name: exerciseId, ...extra });

  it('40 s work + rest per set, 60 s per exercise change', () => {
    const day: PlanDay = {
      n: 1,
      name: 'A',
      blocks: [block({ sets: 3, restSec: 60, items: [item('a', { reps: 10 })] }), block({ sets: 2, restSec: 90, items: [item('b', { reps: 10 })] })],
    };
    // 3 × (40 + 60) + 2 × (40 + 90) + 1 change × 60 = 300 + 260 + 60 = 620 s → 10 min
    expect(estimateDayMinutes(day)).toBe(10);
  });
  it('a hold counts its own time; a pair rests once per round', () => {
    const day: PlanDay = {
      n: 1,
      name: 'A',
      blocks: [
        block({ items: [item('s', { seconds: 45 })] }),
        block({ kind: 'pair', sets: 3, restSec: 90, items: [item('a', { reps: 10 }), item('b', { reps: 10 })] }),
      ],
    };
    // 45 + 3 × (40 + 40) + 3 × 90 + 2 changes × 60 = 45 + 240 + 270 + 120 = 675 s → 11 min
    expect(estimateDayMinutes(day)).toBe(11);
  });
  it("the shipped days (day 2 by hand: 3 × 80 + 3 × 90 + 3 × 130 + 4 × 80 + 4 × 90 + 4 × 4 × 100 + 8 × 60 = 3660 s, + 15 min stair climbing + 1 change = 4620 s)", () => {
    expect(estimateDayMinutes(split5.days[0]!)).toBe(90);
    expect(split5.days.map((d) => estimateDayMinutes(d))).toEqual([90, 77, 78, 98, 63]);
    // The week table grows the day: 10 rounds of sprints in week 1, 20 in week 6.
    // Leg extension rests 10 s (its note), the rest the 90 s default: 3 × 5 × 130 + 10 × 50 + 3 × 130 + 5 × 130 + 5 × 60 = 3790 s.
    expect(estimateDayMinutes(sixWeek.days[0]!, 0)).toBe(63);
    expect(estimateDayMinutes(sixWeek.days[2]!, 5)).toBeGreaterThan(estimateDayMinutes(sixWeek.days[2]!, 0));
  });
});

describe('advancePlan', () => {
  const start = { nextDayIndex: 0, weekIndex: 0, doneDays: [] as number[] };
  it('moves to the day after the one done and checks it', () => {
    expect(advancePlan(start, 0, split5)).toEqual({ nextDayIndex: 1, weekIndex: 0, doneDays: [0] });
    expect(advancePlan({ nextDayIndex: 1, weekIndex: 0, doneDays: [0] }, 2, split5)).toEqual({ nextDayIndex: 3, weekIndex: 0, doneDays: [0, 2] });
    expect(advancePlan({ nextDayIndex: 1, weekIndex: 0, doneDays: [0] }, 0, split5)).toEqual({ nextDayIndex: 1, weekIndex: 0, doneDays: [0] });
  });
  it('wraps after the last day: day 1, checks cleared, same week for a double plan', () => {
    expect(advancePlan({ nextDayIndex: 4, weekIndex: 0, doneDays: [0, 1, 2, 3] }, 4, split5)).toEqual({ nextDayIndex: 0, weekIndex: 0, doneDays: [] });
    expect(advancePlan(start, 99, split5).nextDayIndex).toBe(0);
  });
  it('weekly table: the wrap moves one week on, never past week 6', () => {
    expect(advancePlan({ nextDayIndex: 4, weekIndex: 0, doneDays: [] }, 4, sixWeek)).toEqual({ nextDayIndex: 0, weekIndex: 1, doneDays: [] });
    expect(advancePlan({ nextDayIndex: 4, weekIndex: 5, doneDays: [] }, 4, sixWeek).weekIndex).toBe(5);
    expect(advancePlan({ nextDayIndex: 2, weekIndex: 3, doneDays: [] }, 2, sixWeek).weekIndex).toBe(3);
  });
  it('day ids', () => {
    expect(dayIdOf(split5.days[2]!)).toBe('3');
    expect(dayIndexOf(split5, '3')).toBe(2);
    expect(dayIndexOf(split5, '9')).toBe(-1);
    expect(dayIndexOf(split5, undefined)).toBe(-1);
  });
});

describe('finishers', () => {
  it('Classic 5 Day Split keeps each day’s finisher exactly; a missing length stays unknown', () => {
    expect(split5.days.map((d) => d.finisher)).toEqual([
      undefined,
      { name: 'Stair climbing', minutes: 15 },
      { name: 'Jump rope', minutes: 10 },
      undefined,
      { name: 'Cycling', minutes: null },
    ]);
    expect(finisherText(split5.days[1]!.finisher!)).toBe('Stair climbing · 15 min');
    expect(finisherText(split5.days[4]!.finisher!)).toBe('Cycling');
  });
  it('Six Week Volume Builder has none', () => {
    expect(sixWeek.days.every((d) => d.finisher === undefined)).toBe(true);
  });
  it('known minutes count in the estimate, unknown ones do not', () => {
    const base: PlanDay = { n: 1, name: 'A', blocks: [{ kind: 'single', sets: 1, restSec: 0, items: [{ exerciseId: 'a', name: 'a', reps: 10 }] }] };
    expect(estimateDayMinutes(base)).toBe(1); // 40 s
    expect(estimateDayMinutes({ ...base, finisher: { name: 'Bike', minutes: 10 } })).toBe(12); // 40 + 600 + 60
    expect(estimateDayMinutes({ ...base, finisher: { name: 'Bike', minutes: null } })).toBe(1);
    expect(normalizePlan({ days: [{ blocks: [], finisher: { name: ' ', minutes: 5 } }] }, resolvePlanExercise).days[0]!.finisher).toBeUndefined();
  });
});

describe('restFromNote', () => {
  it('reads a stated rest, nothing else', () => {
    expect(restFromNote('10 seconds rest between sets')).toBe(10);
    expect(restFromNote('30 sec rest')).toBe(30);
    expect(restFromNote('45 s rest, then go')).toBe(45);
    expect(restFromNote('Wide stance')).toBeUndefined();
    expect(restFromNote('10 seconds hold')).toBeUndefined();
    expect(restFromNote(undefined)).toBeUndefined();
  });
});

describe('normalizePlan defaults', () => {
  it('fills safe defaults for a sparse file', () => {
    const p = normalizePlan({ days: [{ blocks: [{ type: 'single', exercise: 'Plank', reps: 'x', note: '  ' }] }] }, resolvePlanExercise);
    expect(p).toMatchObject({ id: 'plan', name: 'plan', summary: '', daysPerWeek: 1, progressionMode: 'double' });
    expect(p.days[0]).toEqual({ n: 1, name: 'Day 1', blocks: [{ kind: 'single', items: [{ exerciseId: 'plank', name: 'Plank' }] }] });
    expect(normalizePlan(null, resolvePlanExercise).days).toEqual([]);
    const w = normalizePlan({ days: [{ items: [{ exercise: 'Plank', weeks: [{}, { sets: 2 }] }] }] }, resolvePlanExercise);
    expect(w.days[0]!.blocks[0]!.items[0]!.weeks).toEqual([{ sets: 1 }, { sets: 2 }]);
  });
});
