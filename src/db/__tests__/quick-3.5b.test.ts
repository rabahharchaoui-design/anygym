// PLAN 3.5b: the rotation memory (cards shown, styles done), when each muscle was last trained, and
// a built workout that keeps its supersets and circuits. Additive only: no schema bump.
import 'fake-indexeddb/auto';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { AnyGymDB } from '../schema';
import { pairsOf, readDoneStyles, readLastTrained, readShown, recordShown, startBuilt } from '../quick';
import { RECORD_CHECKS } from '../../lib/backup';
import type { QuickItem } from '../../lib/quick';
import type { EquipmentId, Session, WorkoutSet } from '../types';

let db: AnyGymDB;
let name: string;
beforeEach(async () => {
  name = `quick-35b-${Math.random()}`;
  db = new AnyGymDB(name);
  await db.open();
});
afterEach(async () => {
  db.close();
  await new AnyGymDB(name).delete();
});

const DAY = 86_400_000;
const NOW = 100 * DAY;
const item = (id: string, group?: number): QuickItem => ({ id, slot: id, origin: id, name: id, pattern: null, sets: 3, reps: [10, 15], restSec: 60, why: 'x', ...(group !== undefined ? { group } : {}) });
const set = (sessionId: string, exerciseId: string, order: number, kind: WorkoutSet['kind'] = 'work'): WorkoutSet => ({ id: `${sessionId}-${order}`, sessionId, exerciseId, order, kind, reps: 10, uncertain: false });

describe('a built quick workout keeps its groups', () => {
  it('supersets and circuits go into the session targets with their place; the style is remembered', async () => {
    const items = [item('barbell-back-squat'), item('cable-tricep-pushdown', 0), item('cable-single-arm-bicep-curl', 0), item('crunch', 1), item('dead-bug', 1), item('leg-extension', 1)];
    const s = await startBuilt('g1', { id: 'pump', items }, 30, db, NOW);
    expect(s.quickStyle).toBe('pump');
    expect(s.exerciseIds).toEqual(items.map((it) => it.id));
    expect(s.targets!['barbell-back-squat']!.pair).toBeUndefined();
    expect(s.targets!['cable-tricep-pushdown']!.pair).toEqual({ group: 0, index: 0, size: 2 });
    expect(s.targets!['cable-single-arm-bicep-curl']!.pair).toEqual({ group: 0, index: 1, size: 2 });
    expect(s.targets!['leg-extension']!.pair).toEqual({ group: 1, index: 2, size: 3 });
    expect(s.targets!['crunch']).toMatchObject({ sets: 3, reps: [10, 15], restSec: 60 });
    // The saved session is a valid backup record.
    expect(RECORD_CHECKS.sessions(await db.sessions.get(s.id))).toBe(true);
  });

  it('a group of one is a single', () => {
    expect(pairsOf([item('a', 0), item('b')]).size).toBe(0);
  });

  it('backups check the new fields: a broken pair is refused, older sessions still pass', () => {
    const base: Session = { id: 's', gymId: 'g', startedAt: 1, imported: false, targets: { a: { sets: 3, restSec: 60 } } };
    expect(RECORD_CHECKS.sessions(base)).toBe(true);
    expect(RECORD_CHECKS.sessions({ ...base, quickStyle: 'circuit', targets: { a: { sets: 3, restSec: 60, pair: { group: 0, index: 1, size: 2 } } } })).toBe(true);
    expect(RECORD_CHECKS.sessions({ ...base, targets: { a: { sets: 3, restSec: 60, pair: { group: 0, index: 2, size: 2 } } } })).toBe(false);
    expect(RECORD_CHECKS.sessions({ ...base, targets: { a: { sets: 3, restSec: 60, pair: { group: 0, index: 0 } } } })).toBe(false);
    expect(RECORD_CHECKS.profile({ id: 'me', defaultUnit: 'lb', createdAt: 1, quickIdeas: { shown: ['plan', 'pump'] } })).toBe(true);
    // 3.5b round 2: a fitted plan day's rest and pairs travel in the session's trim.
    expect(RECORD_CHECKS.sessions({ ...base, planId: 'p', dayId: '2', trim: { drop: ['x'], sets: { a: 3 }, rest: { a: 60 }, pairs: [['a', 'b']] } })).toBe(true);
    expect(RECORD_CHECKS.sessions({ ...base, planId: 'p', dayId: '2', trim: { drop: [], sets: {}, pairs: 'a' } })).toBe(false);
    expect(RECORD_CHECKS.profile({ id: 'me', defaultUnit: 'lb', createdAt: 1, quickIdeas: { shown: 'pump' } })).toBe(false);
  });
});

describe('the rotation memory', () => {
  it('the cards shown are remembered on the profile (no profile: nothing)', async () => {
    await recordShown(['plan', 'pump'], db);
    expect(await readShown(db)).toEqual([]);
    await db.profile.add({ id: 'me', defaultUnit: 'lb', createdAt: 1, dislikes: { never: ['x'] } });
    await recordShown(['plan', 'fresh', 'circuit', 'easy'], db);
    expect(await readShown(db)).toEqual(['plan', 'fresh', 'circuit', 'easy']);
    // Additive: what else is on the profile stays.
    expect((await db.profile.get('me'))!.dislikes).toEqual({ never: ['x'] });
  });

  it('done styles: the last 2 finished quick workouts with logged working sets, latest first', async () => {
    const add = async (id: string, startedAt: number, quickStyle: string | undefined, ended: boolean, kinds: WorkoutSet['kind'][]) => {
      await db.sessions.add({ id, gymId: 'g', startedAt, imported: false, ...(ended ? { endedAt: startedAt + 1000 } : {}), ...(quickStyle ? { quickStyle } : {}) });
      for (const [i, k] of kinds.entries()) await db.sets.add(set(id, 'crunch', i, k));
    };
    await add('a', 1 * DAY, 'circuit', true, ['work']);
    await add('b', 2 * DAY, 'pump', true, ['work']);
    await add('c', 3 * DAY, 'strength', true, ['warmup']); // only a warm up: not done
    await add('d', 4 * DAY, 'easy', false, ['work']); // still going: not done
    await add('e', 5 * DAY, undefined, true, ['work']); // a plan day
    expect(await readDoneStyles(db)).toEqual(['pump', 'circuit']);
  });

  it('last trained: logged working sets only, never warm ups, imports or a future date', async () => {
    await db.sessions.bulkAdd([
      { id: 'w', gymId: 'g', startedAt: NOW - 4 * DAY, imported: false },
      { id: 'x', gymId: 'g', startedAt: NOW - 1 * DAY, imported: false },
      { id: 'imp', gymId: 'g', startedAt: NOW - 1 * DAY, imported: true },
      { id: 'future', gymId: 'g', startedAt: NOW + DAY, imported: false },
    ]);
    await db.sets.bulkAdd([set('w', 'machine-seated-reverse-fly', 0), set('w', 'cable-single-arm-bicep-curl', 1), set('x', 'cable-single-arm-bicep-curl', 0, 'warmup'), set('imp', 'leg-extension', 0), set('future', 'crunch', 0)]);
    const last = await readLastTrained(NOW, db);
    expect(last).toEqual({ 'rear delts': NOW - 4 * DAY, biceps: NOW - 4 * DAY });
  });
});

describe('3.5b round 3: "Your plan, short" starts exactly as the card says', () => {
  it('every plan × day × chip × gym: the started workout rows are the card items, with their sets and rest, and the same minutes', async () => {
    const { PLANS } = await import('../../data/plans');
    const { QUICK_DEPS } = await import('../../data/quick');
    const { planConcept } = await import('../../lib/quick');
    const { dayWorkout, quickEntry } = await import('../../lib/planWorkout');
    const { liveEntries } = await import('../../lib/swap');
    const { applyTrim, trimmedPlan } = await import('../../lib/timeBudget');
    const { estimateDayMinutes } = await import('../../lib/plans');
    const { makeGym } = await import('../gyms');
    const gyms = [
      makeGym({ name: 'Full', type: 'full', unit: 'lb', isActive: true }, 1),
      makeGym({ name: 'Hotel', type: 'hotel', unit: 'lb' }, 1),
      { ...makeGym({ name: 'Dumbbells', type: 'home', unit: 'lb' }, 1), equipment: ['dumbbells', 'adjustable_bench'] as EquipmentId[], dumbbellRange: { min: 5, max: 50, step: 5 } },
    ];
    await db.gyms.bulkAdd(gyms);
    let checked = 0;
    for (const gym of gyms)
      for (const plan of PLANS)
        for (const [dayIndex, day] of plan.days.entries())
          for (const minutes of [15, 30, 45, 60]) {
            const card = planConcept({ plan, dayIndex, weekIndex: 0, minutes, gym: { equipment: gym.equipment, dumbbellRange: gym.dumbbellRange }, experience: '1_2y' }, QUICK_DEPS);
            if (!card) continue;
            const label = `${gym.name} ${plan.id} day ${dayIndex + 1} ${minutes}`;
            const s = await startBuilt(gym.id, card, minutes, db, NOW);
            const planEntries = dayWorkout(trimmedPlan(plan, dayIndex, s.trim, 0), dayIndex, 0);
            const rows = liveEntries({ planEntries, exerciseIds: s.exerciseIds ?? [], make: (id, b) => quickEntry(id, id, undefined, b), swaps: s.swaps, adjust: undefined, sets: [], nameOf: (id) => id });
            expect(rows.map((r) => r.exerciseId), label).toEqual(card.items.map((it) => it.id));
            rows.forEach((r, i) => {
              expect(r.sets, `${label} ${r.exerciseId} sets`).toBe(card.items[i]!.sets);
              expect(r.restSec, `${label} ${r.exerciseId} rest`).toBe(card.items[i]!.restSec);
            });
            expect(estimateDayMinutes(applyTrim(day, s.trim, 0), 0), label).toBe(card.minutes);
            await db.sessions.put({ ...(await db.sessions.get(s.id))!, endedAt: NOW + 1 });
            checked++;
          }
    expect(checked).toBeGreaterThan(80);
  }, 120_000);
});
