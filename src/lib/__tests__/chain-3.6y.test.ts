// PLAN 3.6y point 4: chained integration. One path, end to end and pure: the intake answers, the
// plan generator, the ordering rules, the time estimate, and the load module, on every place of the
// intake. Each link has its own unit tests; this proves they agree with each other.
import { describe, expect, it } from 'vitest';
import { generate } from '../../data/generator';
import { definitionPlan } from '../../data/plans';
import { profileFor } from '../../data/order';
import { SWAP_DATA } from '../../data/patterns';
import { loadSetupFor } from '../../screens/workout/exerciseLoad';
import { makeGym } from '../../db/gyms';
import type { Gym } from '../../db/types';
import { FIT_SLACK, type RawItem, type RawPlan } from '../generator';
import { MIN_MOVES } from '../generatorRules';
import { GYM_TYPE_OF, type IntakeAnswers } from '../intake/funnel';
import { generatorInputOf } from '../intake/yourPlan';
import { gymKitOf } from '../intake/planFit';
import { PLACES, type PlaceAnswer } from '../intake/options';
import { dumbbellsInRange, loadAt, pickedWeight, sameLoad, type LoadSetup } from '../load';
import { loadTypeFromName, planItemLoadType } from '../loadTypeRule';
import { canPair, heaviestOf } from '../order';
import { estimateDayMinutes } from '../plans';
import { progress } from '../progression';
import { supports, workoutIdOf, type Candidate } from '../swap';

const CANDIDATE = new Map<string, Candidate>();
for (const l of Object.values(SWAP_DATA.patterns)) for (const c of l.candidates) CANDIDATE.set(workoutIdOf(c), c);

/** The places of the intake, plus a home that has the dumbbells and bench its owner ticked and a range typed. */
type Case = { name: string; answers: IntakeAnswers };
const CASES: Case[] = [
  ...PLACES.map((p) => ({ name: p.id as string, answers: { place: p.id as PlaceAnswer } satisfies IntakeAnswers })),
  { name: 'home with dumbbells', answers: { place: 'home', equipment: ['dumbbells', 'adjustable_bench'], dumbbellRange: { min: 5, max: 40, step: 5 } } },
];
const GOALS = ['muscle', 'strength', 'fat_loss'] as const;
const MINUTES = [30, 45, 60] as const;
const DAYS = [3, 4] as const;

/** What the chain really exercised, so a green run cannot be an empty one (checked in the last test). */
const seen = { planned: new Map<string, number>(), empty: new Map<string, number>(), targets: 0, dumbbell: 0, barbell: 0, stack: 0, pairs: 0 };
const bump = (m: Map<string, number>, k: string) => m.set(k, (m.get(k) ?? 0) + 1);

const itemsOf = (plan: RawPlan, day: number): RawItem[] => plan.days[day]!.blocks.flatMap((b) => (b.type === 'single' ? [b] : b.items));

/** The gym record of an intake answer set, as the app saves it. */
function gymOf(a: IntakeAnswers): Gym {
  const kit = gymKitOf(a);
  return { ...makeGym({ name: 'Test', type: GYM_TYPE_OF[a.place!], unit: 'lb', isActive: true }, 1), equipment: [...kit.equipment], dumbbellRange: kit.dumbbellRange };
}

describe('intake answers to plan, order, time and load, on every place', () => {
  for (const c of CASES) {
    for (const goal of GOALS) {
      for (const minutes of MINUTES) {
        for (const days of DAYS) {
          const answers: IntakeAnswers = { ...c.answers, goals: [goal], goal, experience: '1_2y', days, minutes, units: { weight: 'lb', distance: 'mi', measure: 'in' } };
          it(`${c.name}, ${goal}, ${days} days, ${minutes} min`, () => {
            const kit = gymKitOf(answers);
            const result = generate(generatorInputOf(answers));

            // 1. The plan exists, or it is honestly empty: no plan, a reason, and fewer moves than a day needs.
            if (!result.ok) {
              expect(result.reason.length).toBeGreaterThan(0);
              expect(result.moves).toBeLessThan(MIN_MOVES);
              bump(seen.empty, c.name);
              return;
            }
            bump(seen.planned, c.name);
            const raw = result.plan;
            expect(raw.days).toHaveLength(days);
            const plan = definitionPlan(raw);
            expect(plan, 'the saved plan can run in the app').toBeDefined();
            const gym = gymOf(answers);

            for (const [d, day] of plan!.days.entries()) {
              const items = itemsOf(raw, d);
              expect(items.length).toBeGreaterThanOrEqual(MIN_MOVES);

              // 2. Every exercise is doable at this gym.
              const warm = raw.days[d]!.blocks.find((b) => b.type === 'single' && b.warmup);
              for (const it of items) {
                if (warm && it === (warm as RawItem)) continue;
                const cand = CANDIDATE.get(it.id);
                expect(cand, `${it.exercise} (${it.id}) is a known move`).toBeDefined();
                expect(supports(cand!.requires, kit), `${it.exercise} needs gear this ${c.name} does not have`).toBe(true);
              }

              // 3. Order rules: a warm up opens the day, the heaviest lift leads the real work, and a pair never holds it.
              const blocks = raw.days[d]!.blocks;
              const warmIdx = blocks.findIndex((b) => b.type === 'single' && b.warmup);
              if (warmIdx >= 0) expect(warmIdx).toBe(0);
              const work = blocks.filter((b) => !(b.type === 'single' && b.warmup));
              const profiles = work.flatMap((b) => (b.type === 'single' ? [b] : b.items)).map((i) => profileFor(i.id, i.exercise));
              const heaviest = heaviestOf(profiles);
              if (heaviest && raw.goal !== 'strength') {
                const first = work[0]!;
                expect((first.type === 'single' ? [first] : first.items).map((i) => i.id), `${raw.days[d]!.name}: the heaviest lift leads`).toContain(heaviest.id);
              }
              for (const b of work) {
                if (b.type !== 'superset') continue;
                const [x, y] = b.items.map((i) => profileFor(i.id, i.exercise)) as [ReturnType<typeof profileFor>, ReturnType<typeof profileFor>];
                const bothLifts = x.role === 'lift' && y.role === 'lift';
                if (bothLifts) seen.pairs++;
                if (bothLifts) expect(canPair(x, y, new Set(heaviest ? [heaviest.id] : [])), `${x.id} + ${y.id} paired`).toBe(true);
              }

              // 4. The time estimate agrees with the generator's own and stays within the minutes asked.
              const est = estimateDayMinutes(day);
              expect(est).toBe(result.applied.minutes[d]);
              if (!result.applied.over) expect(est, `${raw.days[d]!.name} is ${est} min`).toBeLessThanOrEqual(minutes + FIT_SLACK);

              // 5. Every target weight is one this gym can load. Last time was heavier than any rack here.
              for (const it of items) {
                const name = it.exercise;
                const type = planItemLoadType(name, { reps: it.reps, seconds: it.seconds }, loadTypeFromName(name));
                const kind = type === 'barbell' || type === 'dumbbell_each' || type === 'stack' ? type : null;
                if (!kind) continue;
                const setup: Omit<LoadSetup, 'unit'> = loadSetupFor(gym, kind, it.id, name);
                const full: LoadSetup = { ...setup, unit: 'lb' };
                const heavy = kind === 'barbell' ? loadAt('barbell', 315, full) : kind === 'dumbbell_each' ? loadAt('dumbbell_each', 100, { ...full, dumbbellRange: { min: 5, max: 100, step: 5 } }) : loadAt('stack', 200, { ...full, stackStep: 5 });
                expect(heavy, `${name}: a heavy last time exists`).not.toBeNull();
                const p = progress({
                  exerciseId: it.id,
                  loadKind: kind,
                  unit: 'lb',
                  gym: setup,
                  repRange: Array.isArray(it.reps) ? (it.reps as [number, number]) : null,
                  history: [{ date: 1, gymId: 'elsewhere', unit: 'lb', sets: [{ kind: 'work', reps: 10, load: heavy! }, { kind: 'work', reps: 10, load: heavy! }] }],
                });
                for (const t of [p.next.load, ...p.perSet.map((s) => s.target.load)]) {
                  if (!t) continue;
                  seen.targets++;
                  seen[kind === 'barbell' ? 'barbell' : kind === 'stack' ? 'stack' : 'dumbbell']++;
                  const w = pickedWeight(t)!;
                  const again = loadAt(kind, w, full);
                  expect(again, `${name}: ${w} lb is not loadable at ${c.name}`).not.toBeNull();
                  expect(sameLoad(again!, t), `${name}: ${w} lb is made the same way`).toBe(true);
                  if (kind === 'dumbbell_each') expect(dumbbellsInRange(full.dumbbellRange!)).toContain(w);
                }
              }
            }
          });
        }
      }
    }
  }

  it('covers every place of the intake, and really checked plans, pairs and target weights', () => {
    expect(CASES.map((c) => c.name)).toEqual(expect.arrayContaining(PLACES.map((p) => p.id)));
    // Places with gear build plans; places with none say so instead of inventing moves.
    expect(seen.planned.get('full')).toBeGreaterThan(0);
    expect(seen.planned.get('hotel')).toBeGreaterThan(0);
    expect(seen.planned.get('home with dumbbells')).toBeGreaterThan(0);
    expect(seen.empty.get('outdoors') ?? 0).toBeGreaterThan(0);
    expect(seen.pairs).toBeGreaterThan(0);
    expect(seen.barbell).toBeGreaterThan(0);
    expect(seen.dumbbell).toBeGreaterThan(0);
    expect(seen.stack).toBeGreaterThan(0);
    console.log('chain 3.6y', JSON.stringify({ planned: Object.fromEntries(seen.planned), empty: Object.fromEntries(seen.empty), targets: seen.targets, pairs: seen.pairs }));
  });
});
