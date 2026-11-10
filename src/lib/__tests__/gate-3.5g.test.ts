// PLAN 3.5g: the Session 3 gate critic's blockers, as pure rules. Not now on the Level up card holds
// last week's weight (stored and honoured), plan pairs rest after the round, "Your plan, short" only
// when shorter, the 48 h rule on every style card with a why line per muscle, a circuit stays whole,
// one Start Day 1 when the next day is Day 1, short coach lists, the warm up fold and the reveal words.
import { describe, expect, it } from 'vitest';
import { EQUIPMENT_IDS } from '../../db/types';
import { QUICK_DEPS } from '../../data/quick';
import { PLANS } from '../../data/plans';
import { SWAP_DATA } from '../../data/patterns';
import { HOLD_REASON, coachDay, holdChanges, missedChoice, shortList, targetActive, targetOf, weeklyLevelUp, withTarget } from '../coach';
import { beatLine, progress } from '../progression';
import { dayWorkout, restAfter, nextCurrent } from '../planWorkout';
import { estimateDayMinutes } from '../plans';
import { applyTrim } from '../timeBudget';
import { buildIdeas, buildStyleCards, dropItem, muscleRestLine, nextSwap, planConcept, QUICK_MINUTES, shortLine, structureOf, type QuickInput } from '../quick';
import { SAME_SPOT_MS, doneWarmUps, foldWords, sameSpot } from '../warmUpFold';
import { overWords } from '../intake/yourPlan';
import type { GymKit } from '../picker';
import type { Muscle } from '../order';
import { groupNextOf } from '../../screens/workout/groupNext';
import { DAY, LB, NOW, bar, lift, nov, sess } from './coach/fixtures';

const FULL: GymKit = { equipment: [...EQUIPMENT_IDS], dumbbellRange: { min: 5, max: 100, step: 5 } };

describe('3.5g (1) Not now on the Level up card holds last week\'s weight', () => {
  const squat = () => lift({ sessions: [sess(nov(4), [12, 12, 12], bar(200))] });
  const decision = () => weeklyLevelUp([squat()], [], NOW)!;

  it('stores one hold per earned lift at the weight it was, until next Monday, aiming high', () => {
    const d = decision();
    expect(d.earned[0]).toMatchObject({ from: 200, to: 210 });
    const holds = holdChanges(d, NOW);
    expect(holds).toEqual([expect.objectContaining({ exerciseId: 'barbell-back-squat', from: 200, to: 200, source: 'hold', reason: HOLD_REASON, reps: 'high' })]);
    expect(holds[0]!.until).toBe(new Date(2026, 10, 16).getTime());
  });

  it('the exercise keeps 200 with "Same as last time, you chose not to add weight", all week, even after a workout', () => {
    const t = targetOf(holdChanges(decision(), NOW)[0]!, NOW);
    // SPEC 6 alone would raise it (every set at the top): the hold wins.
    const p = progress({ exerciseId: 'barbell-back-squat', loadKind: 'barbell', unit: 'lb', gym: LB, repRange: [8, 12], history: [{ date: nov(4), gymId: 'g', unit: 'lb', sets: [12, 12, 12].map((reps) => ({ kind: 'work' as const, reps, load: bar(200) })) }] });
    expect(p.next.load?.total).toBe(205);
    expect(targetActive(t, nov(4), NOW, 'lb', 'barbell')).toBe(true);
    // A workout of the lift on Thursday does not end it: it holds to Monday.
    expect(targetActive(t, NOW + DAY, NOW + 2 * DAY, 'lb', 'barbell')).toBe(true);
    expect(targetActive(t, NOW + DAY, new Date(2026, 10, 16, 9).getTime(), 'lb', 'barbell')).toBe(false);
    const held = withTarget(p, t, bar(200), [8, 12]);
    expect(held.next).toMatchObject({ kind: 'coach', reason: HOLD_REASON, held: true });
    expect(held.next.load?.total).toBe(200);
    expect(held.perSet.map((r) => [r.target.load?.total, r.target.reps])).toEqual([[200, 12], [200, 12], [200, 12]]);
    // Never "Beat last time" for a held weight.
    expect(beatLine(held)).toBe('12 reps at 200 lb');
  });

  it('a hold is never counted as a raise the coach learns from', () => {
    const h = holdChanges(decision(), NOW)[0]!;
    expect(h.source).not.toBe('level_up');
    expect(h.source).not.toBe('auto');
  });
});

describe('3.5g (2) curated plan pairs are back to back', () => {
  const split = PLANS.find((p) => p.id === 'five-day-split')!;
  const day = split.days.findIndex((d) => d.blocks.some((b) => b.kind === 'pair' && b.items.length === 2 && !b.warmup));
  const entries = dayWorkout(split, day, 0);
  const pair = entries.filter((e) => e.kind === 'pair' && !e.warmup && e.block === entries.find((x) => x.kind === 'pair' && !x.warmup)!.block);
  const [a, b] = pair;

  it('no rest after the first lift, the partner is next; the plan\'s rest after the second', () => {
    expect(pair).toHaveLength(2);
    expect(a!.roundRest && b!.roundRest).toBe(true);
    const afterA = { [a!.exerciseId]: 1 };
    expect(restAfter(entries, afterA, a!.exerciseId)).toBe(0);
    expect(nextCurrent(entries, afterA, a!.exerciseId)).toBe(b!.exerciseId);
    const afterB = { [a!.exerciseId]: 1, [b!.exerciseId]: 1 };
    expect(restAfter(entries, afterB, b!.exerciseId)).toBe(b!.restSec);
    expect(nextCurrent(entries, afterB, b!.exerciseId)).toBe(a!.exerciseId);
  });

  it('a single exercise still rests after every set', () => {
    const single = entries.find((e) => e.kind === 'single' && !e.warmup && !e.finisher)!;
    expect(restAfter(entries, { [single.exerciseId]: 1 }, single.exerciseId)).toBe(single.restSec);
  });
});

describe('3.5g (4) "Your plan, short" only when it is shorter than the plan day', () => {
  it('every plan and day, every chip: short means fewer minutes than the day as this gym does it, else the plan\'s own estimate', () => {
    for (const plan of PLANS)
      for (let d = 0; d < plan.days.length; d++)
        for (const minutes of QUICK_MINUTES) {
          const c = planConcept({ plan, dayIndex: d, weekIndex: 0, minutes, gym: FULL }, QUICK_DEPS);
          if (!c) continue;
          const untrimmed = planConcept({ plan, dayIndex: d, weekIndex: 0, minutes: 75, gym: FULL }, QUICK_DEPS)!;
          const label = `${plan.id} ${d} ${minutes}`;
          if (c.title === 'Your plan, short') expect(c.minutes, label).toBeLessThan(untrimmed.minutes);
          else {
            expect(c.title, label).toBe('Your plan');
            expect(c.minutes, label).toBe(untrimmed.minutes);
            expect(c.minutes, label).toBe(estimateDayMinutes(applyTrim(c.plan!.day, c.plan!.trim, 0), 0));
            if (c.minutes < minutes - 2) expect(shortLine(c), label).toBe("All of today's plan this gym can do");
          }
        }
  });
});

describe('3.5g (5) the 48 h rule on every style card, and a why line from its own muscles', () => {
  const lastTrained: Partial<Record<Muscle, number>> = { chest: NOW - DAY, 'front delts': NOW - DAY, triceps: NOW - DAY, back: NOW - 5 * DAY, biceps: NOW - 5 * DAY, quads: NOW - 4 * DAY, glutes: NOW - 4 * DAY, hamstrings: NOW - 4 * DAY };
  const BIG: Muscle[] = ['chest'];

  it('no style card at any length holds a move for a big muscle trained in the last 48 h (Full body circuit and Pairs included)', () => {
    let circuits = 0;
    let pairs = 0;
    for (const minutes of QUICK_MINUTES) {
      const input: QuickInput = { base: { goals: ['muscle'], gym: FULL, experience: '1_2y' }, minutes, recent: ['chest', 'triceps', 'front delts'], lastTrained, now: NOW };
      for (const [id, cards] of buildStyleCards(input, QUICK_DEPS))
        for (const c of cards) {
          if (id === 'circuit') circuits++;
          if (id === 'pump') pairs++;
          for (const it of c.items) expect(QUICK_DEPS.profile(it.id).targets.some((m) => BIG.includes(m)), `${minutes} ${id} ${it.name}`).toBe(false);
        }
    }
    expect(circuits + pairs, 'the circuit and the pairs are still offered without chest').toBeGreaterThan(0);
  });

  it('the line names the card\'s main muscles, each with its own rest days', () => {
    const items = [{ id: 'barbell-back-squat', sets: 4 }, { id: 'lat-pulldown', sets: 4 }].map((x) => ({ ...x, slot: x.id, origin: x.id, name: x.id, pattern: null, restSec: 90, why: '' })) as never;
    const line = muscleRestLine(items, QUICK_DEPS, lastTrained, NOW);
    expect(line).toMatch(/^[A-Z][a-z ]+ rested \d days(, [a-z ]+ rested \d days)?$/);
    for (const part of line!.split(', ')) {
      const [, word, days] = part.match(/^(.+) rested (\d) days$/i)!;
      const truth: Record<string, number> = { back: 5, quads: 4, legs: 4, glutes: 4 };
      if (truth[word!.toLowerCase()] !== undefined) expect(Number(days), part).toBe(truth[word!.toLowerCase()]);
    }
    expect(muscleRestLine(items, QUICK_DEPS, {}, NOW)).toBeNull();
    expect(muscleRestLine(items, QUICK_DEPS, undefined, NOW)).toBeNull();
  });

  it('every card on screen keeps its own line', () => {
    for (const minutes of QUICK_MINUTES) {
      const ideas = buildIdeas({ base: { goals: ['muscle'], gym: FULL, experience: '1_2y' }, minutes, recent: ['chest', 'triceps', 'front delts'], lastTrained, now: NOW }, QUICK_DEPS);
      const lines = ideas.cards.map((c) => c.line);
      expect(new Set(lines).size, lines.join(' / ')).toBe(lines.length);
    }
  });
});

describe('3.5g (6) Never show inside a circuit keeps the structure; glute bridge for the hip thrust', () => {
  it('the 60 min Full body circuit without its hip thrust: still circuits, never a stray pair', () => {
    const cards = buildStyleCards({ base: { goals: ['muscle'], gym: FULL, experience: '1_2y' }, minutes: 60, recent: [] }, QUICK_DEPS).get('circuit') ?? [];
    let checked = 0;
    for (const c of cards)
      c.items.forEach((it, i) => {
        if (it.group === undefined || c.items.filter((x) => x.group === it.group).length !== 3) return;
        const after = dropItem(c.items, i);
        const st = structureOf(after);
        expect(st.supersets, `${c.variant} without ${it.name}`).toBe(0);
        expect(after).toHaveLength(c.items.length - 1);
        // Members of a group sit together and share their rounds.
        const groups = after.map((x) => x.group);
        for (const g of new Set(groups.filter((x) => x !== undefined))) {
          const at = groups.map((x, k) => (x === g ? k : -1)).filter((k) => k >= 0);
          expect(at[at.length - 1]! - at[0]!, 'contiguous').toBe(at.length - 1);
          expect(new Set(after.filter((x) => x.group === g).map((x) => x.sets)).size).toBe(1);
        }
        checked++;
      });
    expect(checked).toBeGreaterThan(0);
  });

  it('a pair losing one member leaves a single; a lone circuit of 3 becomes a pair', () => {
    const it = (id: string, group?: number) => ({ id, slot: id, origin: id, name: id, pattern: null, sets: 3, restSec: 60, why: '', ...(group !== undefined ? { group } : {}) }) as never;
    expect(dropItem([it('a', 0), it('b', 0), it('c')], 0).map((x: { group?: number }) => x.group)).toEqual([undefined, undefined]);
    expect(structureOf(dropItem([it('a', 0), it('b', 0), it('c', 0)], 1))).toMatchObject({ supersets: 1, circuits: 0 });
  });

  it('the hip thrust swaps to a barbell glute bridge (both photos checked by hand)', () => {
    const hip = { id: 'hip-thrust', slot: 'hip-thrust', origin: 'hip-thrust', name: 'Hip Thrust', pattern: 'glutes', sets: 4, reps: [8, 12], restSec: 90, why: '' } as never;
    const to = nextSwap(hip, [hip], [], { data: SWAP_DATA, gym: FULL, ok: (id) => QUICK_DEPS.usable(id), profile: QUICK_DEPS.profile, nameOf: QUICK_DEPS.name });
    expect(to).toBe('Barbell_Glute_Bridge');
  });
});

describe('3.5g (11) missed days when the next day is Day 1', () => {
  it('one Start Day 1 and Rebuild my week; elsewhere in the week Resume Day N and Restart Day 1', () => {
    expect(missedChoice(0)).toEqual({ primary: { kind: 'start', label: 'Start Day 1' }, secondary: { kind: 'rebuild', label: 'Rebuild my week' } });
    expect(missedChoice(2)).toEqual({ primary: { kind: 'resume', label: 'Resume Day 3' }, secondary: { kind: 'restart', label: 'Restart Day 1' } });
    expect(missedChoice(null).primary.label).toBe('Resume');
    expect(missedChoice(0).primary.label).not.toBe(missedChoice(0).secondary.label);
  });
});

describe('3.5g (8) coach cards list today\'s lifts, and never share a day with the backup reminder', () => {
  const rows = ['a', 'b', 'c', 'd', 'e', 'f'].map((id) => ({ exerciseId: id }));
  it('today\'s lifts first (a few at most), the rest behind "+N more"; none today: the first few', () => {
    expect(shortList(rows, ['c', 'e'])).toEqual({ shown: [{ exerciseId: 'c' }, { exerciseId: 'e' }], more: 4, today: true });
    expect(shortList(rows, [])).toEqual({ shown: rows.slice(0, 3), more: 3, today: false });
    expect(shortList(rows.slice(0, 2), ['z'])).toEqual({ shown: rows.slice(0, 2), more: 0, today: false });
  });
  it('a coach card now, or one answered today, keeps the backup reminder away', () => {
    expect(coachDay(true, [], NOW)).toBe(true);
    expect(coachDay(false, [NOW - 60_000], NOW)).toBe(true);
    expect(coachDay(false, [NOW - DAY], NOW)).toBe(false);
    expect(coachDay(false, [], NOW)).toBe(false);
  });
});

describe('3.5g (3) the finished warm ups fold into one row', () => {
  it('only the leading logged warm ups, only once none is left to do, two at least', () => {
    expect(doneWarmUps(['warmup', 'warmup', 'warmup', 'normal'], ['normal', 'normal'])).toBe(3);
    expect(doneWarmUps(['warmup', 'warmup'], ['warmup', 'normal'])).toBe(0);
    expect(doneWarmUps(['warmup'], ['normal'])).toBe(0);
    expect(doneWarmUps(['normal', 'warmup', 'warmup'], [])).toBe(0);
    expect(foldWords(3)).toBe('3 warm ups done');
  });
  it('the second tap of a double tap on the same spot logs nothing; the next row, or later, does', () => {
    const a = { x: 340, y: 600, t: 1000 };
    expect(sameSpot(null, a)).toBe(false);
    expect(sameSpot(a, { x: 344, y: 596, t: 1120 })).toBe(true);
    expect(sameSpot(a, { x: 340, y: 656, t: 1120 }), 'the next row, 56 pt below').toBe(false);
    expect(sameSpot(a, { x: 340, y: 600, t: 1000 + SAME_SPOT_MS }), 'later: a new tap').toBe(false);
  });
});

describe('3.5g (10) the reveal says the real minutes', () => {
  it('"Day 1 takes about 37 min, longer than your 20"', () => {
    expect(overWords([37, 26], 20)).toBe('Day 1 takes about 37 min and Day 2 about 26, longer than your 20. Tap Make it fit when you start.');
    expect(overWords([37, 18], 20)).toBe('Day 1 takes about 37 min, longer than your 20. Tap Make it fit when you start.');
    expect(overWords([31, 33, 35], 30)).toBe('Days 1, 2 and 3 take 31 to 35 min, longer than your 30. Tap Make it fit when you start.');
    expect(overWords([18, 20], 20)).toBeNull();
  });
});

describe('3.5g (2) the Next bar in a pair or circuit', () => {
  const split = PLANS.find((p) => p.id === 'five-day-split')!;
  const day = split.days.findIndex((d) => d.blocks.some((b) => b.kind === 'pair' && b.items.length === 2 && !b.warmup));
  const entries = dayWorkout(split, day, 0);
  const [a, b] = entries.filter((e) => e.kind === 'pair' && !e.warmup && e.block === entries.find((x) => x.kind === 'pair' && !x.warmup)!.block);
  it('after the first lift: the partner; after the round: back to the first for the next one; never to itself', () => {
    expect(groupNextOf(entries, {}, a!.exerciseId)).toBeUndefined();
    expect(groupNextOf(entries, { [a!.exerciseId]: 1 }, a!.exerciseId)?.exerciseId).toBe(b!.exerciseId);
    expect(groupNextOf(entries, { [a!.exerciseId]: 1 }, b!.exerciseId)).toBeUndefined();
    expect(groupNextOf(entries, { [a!.exerciseId]: 1, [b!.exerciseId]: 1 }, b!.exerciseId)?.exerciseId).toBe(a!.exerciseId);
    expect(groupNextOf(entries, { [a!.exerciseId]: 1, [b!.exerciseId]: 1 }, a!.exerciseId)).toBeUndefined();
    const all = { [a!.exerciseId]: a!.sets, [b!.exerciseId]: b!.sets };
    expect(groupNextOf(entries, all, b!.exerciseId)).toBeUndefined();
  });
});
