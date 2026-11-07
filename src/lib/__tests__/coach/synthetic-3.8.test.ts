import { describe, expect, it } from 'vitest';
import type { Unit } from '../../../db/types';
import {
  MAX_PCT,
  learnedScale,
  liftClass,
  showable,
  targetOf,
  weekStartFrom,
  weeklyLevelUp,
  welcomeChanges,
  type ChangeRecord,
  type CoachTarget,
  type Effort,
  type Lift,
  type LiftSession,
  type PlannedChange,
} from '../../coach';
import { estimatedMax, loadAt, pickedWeight, stepDown, stepUp, type LoadSetup } from '../../load';
import type { Pattern } from '../../swap';
import { KG, LB } from './fixtures';

// PLAN 3.8 (SPEC 15): SYNTHETIC USERS over 12 simulated weeks. Each user has a true strength per
// lift that changes week to week; they lift what the coach sets, getting as many reps as that
// strength allows (capped at the top of the range). Every Monday the coach's Level up runs and its
// raises are applied (Auto level up). Asserted: sensible, never unsafe jumps; every weight loadable
// at the gym; adaptation after misses; no estimate in any word shown.

type LiftSpec = { id: string; name: string; pattern: Pattern; kind: 'barbell' | 'dumbbell_each'; range: [number, number]; sets: number; start: number; strength: number };
type User = {
  name: string;
  unit: Unit;
  /** Weekly change of true strength, per week index (0.03 = +3%). */
  growth: (week: number) => number;
  /** Workouts in a week (0 = a week off). */
  workouts: (week: number) => number;
  lifts: LiftSpec[];
};

const T0 = new Date(2026, 0, 5, 18).getTime(); // a Monday
const DAY = 24 * 60 * 60 * 1000;
const setupOf = (u: Unit): LoadSetup => (u === 'lb' ? LB : KG);

/** Reps a true strength allows at a weight (Epley, inverted), capped at 15. */
function repsAt(max: number, weight: number): number {
  if (weight >= max) return weight > max * 1.02 ? 0 : 1;
  for (let r = 15; r >= 1; r--) if (estimatedMax(weight, r)! <= max) return r;
  return 0;
}

type Sim = { raises: Array<{ lift: string; from: number; to: number; week: number; cls: string }>; changes: ChangeRecord[]; lifts: Lift[]; misses: Array<{ lift: string; week: number }>; words: string[]; welcome: number; lighter: PlannedChange[] };

function simulate(user: User): Sim {
  const setup = setupOf(user.unit);
  const truth = new Map(user.lifts.map((l) => [l.id, l.strength]));
  const weight = new Map(user.lifts.map((l) => [l.id, l.start]));
  const targets = new Map<string, CoachTarget>();
  const sessions = new Map<string, LiftSession[]>(user.lifts.map((l) => [l.id, []]));
  const changes: ChangeRecord[] = [];
  const out: Sim = { raises: [], changes, lifts: [], misses: [], words: [], welcome: 0, lighter: [] };
  let n = 0;
  const liftsNow = (): Lift[] =>
    user.lifts.map((l) => ({ key: l.id, exerciseId: l.id, name: l.name, loadKind: l.kind, pattern: l.pattern, setup, sessions: [...sessions.get(l.id)!].sort((a, b) => b.date - a.date) }));
  let lastWorkout = T0;
  for (let week = 0; week < 12; week++) {
    const monday = weekStartFrom(T0, week);
    // Monday morning: the coach looks at last week.
    const now = monday + 10 * 60 * 60 * 1000;
    if (week > 0) {
      const lifts = liftsNow();
      // A comeback after 7+ days off: the welcome back week.
      if (now - lastWorkout >= 7 * DAY) {
        const back = welcomeChanges(lifts, lifts.flatMap((l) => l.sessions.map((s) => s.date)), now);
        out.welcome += back.length;
        for (const c of back) {
          out.words.push(c.reason);
          out.lighter.push(c);
          weight.set(c.exerciseId, c.to);
        }
      }
      const d = weeklyLevelUp(lifts, changes, now);
      for (const h of d?.holding ?? []) out.words.push(h.reason);
      for (const c of d?.earned ?? []) {
        out.words.push(c.reason);
        const spec = user.lifts.find((l) => l.id === c.exerciseId)!;
        const cls = liftClass(spec.pattern)!;
        out.raises.push({ lift: c.exerciseId, from: c.from, to: c.to, week, cls });
        changes.push({ ...c, id: `c${n++}`, cardId: d!.cardId, weekKey: d!.weekKey, appliedAt: now, source: 'auto' });
        targets.set(c.exerciseId, targetOf(c, now));
        weight.set(c.exerciseId, c.to);
      }
    }
    // The week's workouts: Tuesday, Thursday, Saturday.
    for (let w = 0; w < user.workouts(week); w++) {
      const date = monday + (1 + 2 * w) * DAY;
      lastWorkout = date;
      for (const spec of user.lifts) {
        const max = truth.get(spec.id)!;
        const at = weight.get(spec.id)!;
        const load = loadAt(spec.kind, at, setup)!;
        expect(load, `${user.name} ${spec.id} ${at}`).not.toBeNull();
        const sets = Array.from({ length: spec.sets }, (_, i) => {
          // A little fatigue set to set.
          const can = Math.max(0, repsAt(max * (1 - 0.015 * i), at));
          return { reps: Math.min(spec.range[1], can), load };
        });
        const left = repsAt(max, at) - spec.range[1];
        const effort: Effort = left >= 3 ? 'easy' : left >= 1 ? 'good' : 'hard';
        if (sets.some((s) => s.reps < spec.range[0])) out.misses.push({ lift: spec.id, week });
        sessions.get(spec.id)!.push({ sessionId: `s${n++}`, date, sets, range: spec.range, effort });
      }
    }
    for (const spec of user.lifts) truth.set(spec.id, truth.get(spec.id)! * (1 + user.growth(week)));
  }
  out.lifts = liftsNow();
  return out;
}

const SQUAT: Omit<LiftSpec, 'start' | 'strength'> = { id: 'squat', name: 'Back Squat', pattern: 'squat', kind: 'barbell', range: [5, 8], sets: 3 };
const BENCH: Omit<LiftSpec, 'start' | 'strength'> = { id: 'bench', name: 'Bench Press', pattern: 'horizontal push', kind: 'barbell', range: [6, 10], sets: 3 };
const CURL: Omit<LiftSpec, 'start' | 'strength'> = { id: 'curl', name: 'Dumbbell Curl', pattern: 'biceps', kind: 'dumbbell_each', range: [10, 12], sets: 3 };

const USERS: User[] = [
  {
    name: 'fast beginner',
    unit: 'lb',
    growth: () => 0.04,
    workouts: () => 3,
    lifts: [
      { ...SQUAT, start: 95, strength: 130 },
      { ...BENCH, start: 75, strength: 100 },
      { ...CURL, start: 15, strength: 26 },
    ],
  },
  {
    name: 'slow veteran',
    unit: 'kg',
    growth: () => 0.003,
    workouts: () => 3,
    lifts: [
      { ...SQUAT, start: 160, strength: 195 },
      { ...BENCH, start: 110, strength: 140 },
      { ...CURL, start: 20, strength: 30 },
    ],
  },
  {
    name: 'inconsistent',
    unit: 'lb',
    growth: (w) => (w % 3 === 2 ? -0.01 : 0.015),
    workouts: (w) => [2, 1, 3, 0, 2, 1, 1, 3, 0, 2, 2, 1][w]!,
    lifts: [
      { ...SQUAT, start: 135, strength: 170 },
      { ...BENCH, start: 115, strength: 140 },
      { ...CURL, start: 20, strength: 30 },
    ],
  },
  {
    name: 'injured comeback',
    unit: 'lb',
    // Three good weeks, a two week break with lost strength, then back.
    growth: (w) => (w < 3 ? 0.02 : w < 5 ? -0.06 : 0.025),
    workouts: (w) => (w >= 3 && w < 5 ? 0 : 3),
    lifts: [
      { ...SQUAT, start: 185, strength: 235 },
      { ...BENCH, start: 155, strength: 190 },
      { ...CURL, start: 25, strength: 36 },
    ],
  },
];

describe.each(USERS)('synthetic user: $name, 12 weeks', (user) => {
  const sim = simulate(user);
  const setup = setupOf(user.unit);

  it('levels up at least once and every raise is loadable here', () => {
    expect(sim.raises.length).toBeGreaterThan(0);
    for (const r of sim.raises) expect(loadAt(user.lifts.find((l) => l.id === r.lift)!.kind, r.to, setup)).not.toBeNull();
  });

  it('never an unsafe jump: within SPEC 15 bounds (or the single smallest step there is)', () => {
    for (const r of sim.raises) {
      const kind = user.lifts.find((l) => l.id === r.lift)!.kind;
      const smallest = stepUp(kind, r.from, setup)!;
      if (r.cls === 'isolation') {
        expect(r.to).toBe(smallest);
        continue;
      }
      const cap = Math.max(r.from * MAX_PCT[r.cls as 'lower' | 'upper'], r.cls === 'lower' ? (user.unit === 'lb' ? 10 : 5) : user.unit === 'lb' ? 5 : 2.5);
      expect(r.to - r.from <= cap + 1e-9 || r.to === smallest, `${r.lift} ${r.from} → ${r.to}`).toBe(true);
      expect(r.to).toBeGreaterThan(r.from);
    }
  });

  it('never raises a lift in a week it missed reps', () => {
    for (const r of sim.raises) expect(sim.misses.some((m) => m.lift === r.lift && m.week === r.week - 1)).toBe(false);
  });

  it('adapts after misses: a raise followed by missed reps makes the next raise of that lift no bigger', () => {
    for (const lift of sim.lifts) {
      const mine = sim.changes.filter((c) => c.key === lift.key).sort((a, b) => a.appliedAt - b.appliedAt);
      for (let i = 1; i < mine.length; i++) {
        const before = sim.changes.filter((c) => c.key === lift.key && c.appliedAt < mine[i]!.appliedAt);
        const scale = learnedScale({ key: lift.key, sessions: lift.sessions.filter((s) => s.date < mine[i]!.appliedAt) }, before);
        if (scale < 1) {
          const prev = mine[i - 1]!;
          expect(mine[i]!.to - mine[i]!.from).toBeLessThanOrEqual(prev.to - prev.from + 1e-9);
        }
      }
    }
  });

  it('a welcome back week is about 10% lighter (or one step down), loadable', () => {
    for (const c of sim.lighter) {
      expect(c.to).toBeLessThan(c.from);
      expect(c.to >= c.from * 0.85 || c.to === stepDown(c.loadKind, c.from, setup)).toBe(true);
      expect(loadAt(c.loadKind, c.to, setup)).not.toBeNull();
    }
  });

  it('no estimate ever leaks into the words', () => {
    expect(sim.words.length).toBeGreaterThan(0);
    for (const w of sim.words) expect(showable(w), w).toBe(true);
  });

  it('never drags a lift down: at most a lighter week below the start (after a break), else at or above it', () => {
    const breaks = sim.welcome > 0;
    for (const spec of user.lifts) {
      const last = pickedWeight(sim.lifts.find((l) => l.key === spec.id)!.sessions[0]!.sets[0]!.load)!;
      expect(last).toBeGreaterThanOrEqual(breaks ? spec.start * 0.85 : spec.start);
    }
  });
});

describe('the users differ the way people do', () => {
  const total = (name: string) => {
    const sim = simulate(USERS.find((u) => u.name === name)!);
    const squat = sim.raises.filter((r) => r.lift === 'squat');
    return squat.reduce((s, r) => s + (r.to - r.from) / r.from, 0);
  };
  it('the fast beginner gains far more on the squat than the slow veteran', () => {
    expect(total('fast beginner')).toBeGreaterThan(total('slow veteran') * 2);
  });
  it('the injured comeback gets a welcome back week after the break', () => {
    const sim = simulate(USERS.find((u) => u.name === 'injured comeback')!);
    expect(sim.welcome).toBeGreaterThan(0);
    expect(simulate(USERS.find((u) => u.name === 'fast beginner')!).welcome).toBe(0);
  });
});
