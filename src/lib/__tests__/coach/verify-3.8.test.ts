// Independent verification (tester) of PLAN 3.8: minimums, loadability, and no e1RM wording.
import { describe, expect, it } from 'vitest';
import { loadAt, nearestLoadable, type LoadSetup } from '../../load';
import { weeklyLevelUp, welcomeChanges, HIDDEN_WORDS, weekKey } from '../../coach';
import { COACH_MIN_ADD } from '../../load';
// Round 2: unused `bar` import dropped so `npm run build` (tsc over tests) passes.
import { DAY, KG, LB, NOW, bar, lift, nov, sess } from './fixtures';

const lbPlatesLimited: LoadSetup = { ...LB, plates: [45, 10, 5, 2.5] };
const kgSmall: LoadSetup = { ...KG, plates: [20, 10, 5, 2.5, 1.25] };

function run(setup: LoadSetup, id: string, pattern: string, name: string, total: number, extra: number[] = []) {
  const load = loadAt('barbell', total, setup)!;
  expect(load).toBeTruthy();
  const l = lift({ exerciseId: id, name, pattern: pattern as never, setup, sessions: [sess(nov(3), [12, 12, 12], load), ...extra.map((t) => sess(nov(3) - 8 * DAY, [12, 12, 12], loadAt('barbell', t, setup)!))] });
  return weeklyLevelUp([l], [], NOW);
}

describe('verify 3.8 coach math', () => {
  for (const [label, setup, unit] of [['lb', LB, 'lb'], ['lb limited plates', lbPlatesLimited, 'lb'], ['kg', KG, 'kg'], ['kg small plates', kgSmall, 'kg']] as const) {
    const starts = unit === 'lb' ? [65, 95, 135, 185, 225, 315, 405] : [30, 40, 60, 80, 100, 140, 180];
    for (const [id, pattern, name, cls] of [['barbell-back-squat', 'squat', 'Barbell Back Squat', 'lower'], ['overhead-press', 'press_v', 'Overhead Press', 'upper'], ['barbell-bench-press', 'press_h', 'Barbell Bench Press', 'upper']] as const) {
      it(`${label} ${id}: min add and loadable`, () => {
        for (const v of starts) {
          const total = nearestLoadable('barbell', v, setup)!;
          const d = run(setup, id, pattern, name, total);
          if (!d || !d.earned.length) continue;
          const e = d.earned[0]!;
          const min = COACH_MIN_ADD[cls][unit];
          expect(e.to - e.from, `${label} ${id} ${total} -> ${e.to}`).toBeGreaterThanOrEqual(min - 1e-9);
          expect(loadAt('barbell', e.to, setup), `${label} ${id} ${e.to} loadable`).toBeTruthy();
          expect(HIDDEN_WORDS.test(e.reason)).toBe(false);
          if (unit === 'lb') expect((e.to * 2) % 5, 'multiple of 5 total').toBe(0);
          else expect((e.to * 10) % 25, 'multiple of 2.5 kg').toBe(0);
          // eslint-disable-next-line no-console
          console.log(`${label} ${id} ${total} -> ${e.to} | ${e.reason}`);
        }
      });
    }
  }
  it('welcome back weights loadable', () => {
    for (const setup of [LB, KG]) {
      const load = loadAt('barbell', setup.unit === 'lb' ? 225 : 100, setup)!;
      const l = lift({ setup, sessions: [sess(NOW - 10 * DAY, [10, 10, 10], load)] });
      const ch = welcomeChanges([l], [NOW - 10 * DAY], NOW);
      for (const c of ch) { expect(loadAt('barbell', c.to, setup)).toBeTruthy(); expect(c.to).toBeLessThan(c.from); console.log('welcome', setup.unit, c.from, c.to, c.reason); }
      expect(ch.length).toBeGreaterThan(0);
    }
  });
});

// ---- round 2 (C1, C3, C4) ----
import { candidates, judgeRaise, learnedScale, newOutcomes, plateauOf, type CoachInput } from '../../coach';
import { record } from './fixtures';

const inp = (over: Partial<CoachInput>): CoachInput => ({ now: NOW, lifts: [], dates: [], changes: [], closed: new Set(), autoLevelUp: true, activeWorkout: false, ...over });
const sq = (date = nov(3), reps = [12, 12, 12], extra = {}) => lift({ sessions: [sess(date, reps, bar(200))], ...extra });

describe('verify 3.8 round 2: C1 auto level up guards', () => {
  it('applies with a clean qualifying week', () => {
    const r = candidates(inp({ lifts: [sq()], dates: [nov(3), nov(10)] }));
    expect(r.autoApply?.earned.length).toBe(1);
  });
  it('never applies while another coach card is up (missed days)', () => {
    const r = candidates(inp({ lifts: [sq(nov(7))], dates: [nov(7)], plan: { daysPerWeek: 5 } }));
    expect(r.cards.some((c) => c.kind === 'missed_days')).toBe(true);
    expect(r.autoApply).toBeNull();
  });
  it('never applies after 7+ days off', () => {
    const r = candidates(inp({ now: nov(15), lifts: [sq(nov(8))], dates: [nov(8)] }));
    expect(r.autoApply).toBeNull();
  });
  it('never applies while a lighter week is due (6 weeks in a row)', () => {
    const dates = [0, 1, 2, 3, 4, 5].map((k) => nov(3) - k * 7 * DAY);
    const r = candidates(inp({ lifts: [sq()], dates: [...dates, nov(10)] }));
    expect(r.cards.some((c) => c.kind === 'deload')).toBe(true);
    expect(r.autoApply).toBeNull();
  });
  it('a deload due without a card (all lifts filtered) still blocks auto', () => {
    const dates = [0, 1, 2, 3, 4, 5].map((k) => nov(3) - k * 7 * DAY);
    const r = candidates(inp({ lifts: [sq()], dates: [...dates, nov(10)], closed: new Set([`deload:${weekKey(NOW)}`]) }));
    expect(r.autoApply).toBeNull();
  });
  it('lifts with a running lighter-week or welcome-back target are left out of the Level up card and Auto', () => {
    for (const source of ['deload', 'welcome_back'] as const) {
      const target = { value: 180, unit: 'lb' as const, loadKind: 'barbell' as const, reason: 'x', source, setAt: nov(9), until: NOW + 3 * DAY };
      const l = sq(nov(3), [12, 12, 12], { target });
      expect(weeklyLevelUp([l], [], NOW)).toBeNull();
      for (const auto of [true, false]) {
        const r = candidates(inp({ lifts: [l], dates: [nov(3), nov(10)], autoLevelUp: auto }));
        expect(r.autoApply).toBeNull();
        expect(r.cards.filter((c) => c.kind === 'level_up')).toEqual([]);
      }
    }
  });
});

describe('verify 3.8 round 2: C3 outcomes judged once', () => {
  const raise = (id: string, over = {}) => record({ key: 'barbell-back-squat||barbell', exerciseId: 'barbell-back-squat', name: 'Barbell Back Squat', loadKind: 'barbell', unit: 'lb', from: 200, to: 210, reason: '', source: 'level_up' }, nov(9), `levelup:${id}`, { id, ...over });
  it('a stored miss outside the session window still halves; an unstored one judged now does too', () => {
    const l = lift({ scale: 0.5, sessions: [sess(nov(10), [12, 12, 12], bar(210))] });
    const stored = raise('a', { outcome: 'miss' });
    expect(learnedScale(l, [stored])).toBe(0.5);
    // not double counted when stored
    const l2 = lift({ scale: 0.5, sessions: [sess(nov(10), [6, 6, 6], bar(210))] });
    expect(learnedScale(l2, [stored])).toBe(0.5);
    // unstored miss in sessions judged now
    const l3 = lift({ sessions: [sess(nov(10), [6, 6, 6], bar(210))] });
    expect(learnedScale(l3, [raise('b')])).toBe(0.5);
    expect(newOutcomes([l3], [raise('b')])).toEqual([{ id: 'b', key: l3.key, outcome: 'miss' }]);
    expect(newOutcomes([l3], [stored])).toEqual([]);
  });
  it('a later Easy grows it on top of the stored miss; a miss with no sessions left in the window is not lost', () => {
    const l = lift({ scale: 0.5, sessions: [sess(nov(10), [12, 12, 12], bar(220), [8, 12], 'easy')] });
    const easy = raise('c', { to: 220, appliedAt: nov(9) });
    expect(learnedScale(l, [raise('a', { outcome: 'miss' }), easy])).toBeCloseTo(0.625, 5);
    const none = lift({ scale: 0.5, sessions: [] });
    expect(learnedScale(none, [])).toBe(0.5);
  });
  it('the next raise really is smaller after a miss', () => {
    const full = weeklyLevelUp([lift({ sessions: [sess(nov(3), [12, 12, 12], bar(405))] })], [], NOW)!.earned[0]!;
    const half = weeklyLevelUp([lift({ scale: 0.5, sessions: [sess(nov(3), [12, 12, 12], bar(405))] })], [], NOW)!.earned[0]!;
    expect(half.to - half.from).toBeLessThan(full.to - full.from);
    expect(half.to - half.from).toBeGreaterThan(0);
  });
  it('judgeRaise ignores undone raises and other weights', () => {
    expect(judgeRaise({ appliedAt: nov(9), to: 210, unit: 'lb' }, lift({ sessions: [sess(nov(10), [12, 12, 12], bar(205))] }))).toBeNull();
  });
});

describe('verify 3.8 round 2: C4 two Hard workouts', () => {
  const two = (e1: 'hard' | 'good', e2: 'hard' | 'good', w2 = 200) => lift({ sessions: [sess(nov(9), [12, 12, 12], bar(200), [8, 12], e1), sess(nov(2), [12, 12, 12], bar(w2), [8, 12], e2)] });
  it('Hard twice at the same weight at the top of the range is a plateau', () => {
    const p = plateauOf(two('hard', 'hard'), NOW);
    expect(p).not.toBeNull();
    expect(p!.text).toMatch(/felt hard twice in a row/);
  });
  it('Hard then Good, Good then Hard, or different weights are not', () => {
    expect(plateauOf(two('hard', 'good'), NOW)).toBeNull();
    expect(plateauOf(two('good', 'hard'), NOW)).toBeNull();
    expect(plateauOf(two('hard', 'hard', 190), NOW)).toBeNull();
  });
});
