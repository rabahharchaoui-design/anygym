// PLAN 3.1: routines by place, the week by week table, and sure demos for every plan exercise.
import { existsSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import sixWeekRaw from '../../../data/plans/six-week-volume.json';
import catalog from '../../../data/catalog.json';
import { PLANS, planById } from '../../data/plans';
import { PLACE_TILES, needOf, placesOfPlan, planNeeds, plansForPlace } from '../../data/places';
import { demoForPlan, infoForPlan } from '../../data/exerciseInfo';
import { EXERCISE_MAP, musclesForPlan } from '../../data/muscles';
import { PLACES, exerciseNeed, placeById, placeFits, placeTiles, placesFor, type Need, type PlaceId } from '../places';
import { itemLine, weekTable, type PlanItem } from '../plans';

const MAP = new Map(EXERCISE_MAP.map((e) => [e.planId, e]));
const CAT = new Map((catalog as { exercises: Array<{ id: string; equipment: string | null }> }).exercises.map((e) => [e.id, e]));
const allItems = (planId: string) => planById(planId)!.days.flatMap((d) => d.blocks.flatMap((b) => b.items));

describe('exerciseNeed: from the data only', () => {
  it('a sure catalog match names the gear', () => {
    expect(exerciseNeed({ match: 'exact', catalogEquipment: 'bands', loadType: 'bodyweight' })).toBe('bands');
    expect(exerciseNeed({ match: 'variant', catalogEquipment: 'e-z curl bar' })).toBe('barbell');
    expect(exerciseNeed({ match: 'exact', catalogEquipment: 'kettlebells', loadType: 'single' })).toBe('kettlebell');
    expect(exerciseNeed({ match: 'exact', catalogEquipment: 'body only', loadType: 'bodyweight' })).toBe('bodyweight');
    // The Smith machine upright row is logged as a barbell, but the catalog knows it is a machine.
    expect(exerciseNeed({ match: 'exact', catalogEquipment: 'machine', loadType: 'barbell' })).toBe('machine');
  });
  it('a none match never borrows the catalog gear', () => {
    expect(exerciseNeed({ match: 'none', catalogEquipment: 'body only', loadType: 'bodyweight' })).toBe('unknown');
  });
  it('without a sure match only a certain load type counts; a weight stack is a machine', () => {
    expect(exerciseNeed({ loadType: 'barbell' })).toBe('barbell');
    expect(exerciseNeed({ loadType: 'dumbbell_each' })).toBe('dumbbell');
    expect(exerciseNeed({ loadType: 'plate_machine' })).toBe('machine');
    expect(exerciseNeed({ loadType: 'stack' })).toBe('machine');
    for (const lt of ['single', 'bodyweight', 'timed', 'unknown'] as const) expect(exerciseNeed({ loadType: lt })).toBe('unknown');
    expect(exerciseNeed({ match: 'exact', catalogEquipment: 'other', loadType: 'bodyweight' })).toBe('unknown');
    expect(exerciseNeed({})).toBe('unknown');
  });
});

describe('placeFits: every tile rule', () => {
  const fits = (id: PlaceId, needs: Need[]) => placeFits(placeById(id)!, needs);
  it('seven places in tile order', () => {
    expect(PLACES.map((p) => p.id)).toEqual(['home', 'travel', 'dumbbells', 'bands', 'full', 'bodyweight', 'cardio']);
    expect(PLACES.map((p) => p.label)).toEqual(['At home', 'Travel or hotel gym', 'Dumbbells only', 'Bands', 'Full gym', 'Bodyweight', 'Cardio']);
  });
  it('no exercises: no place', () => {
    for (const p of PLACES) expect(placeFits(p, [])).toBe(false);
  });
  it('an unknown need fits only the full gym', () => {
    expect(placesFor(['dumbbell', 'unknown'])).toEqual(['full']);
    expect(placesFor(['unknown'])).toEqual(['full']);
  });
  it('barbells and machines: full gym only', () => {
    expect(placesFor(['barbell'])).toEqual(['full']);
    expect(placesFor(['machine', 'dumbbell'])).toEqual(['full']);
  });
  it('dumbbells and floor work: home, travel, dumbbells only, full', () => {
    expect(placesFor(['dumbbell', 'bodyweight'])).toEqual(['home', 'travel', 'dumbbells', 'full']);
  });
  it('a cable: travel (one cable station) and full', () => {
    expect(placesFor(['dumbbell', 'cable'])).toEqual(['travel', 'full']);
  });
  it('bands: home, bands, full; never dumbbells only', () => {
    expect(placesFor(['bands', 'bodyweight'])).toEqual(['home', 'bands', 'full']);
    expect(fits('dumbbells', ['bands'])).toBe(false);
  });
  it('a named gear place needs the plan to use that gear', () => {
    expect(fits('dumbbells', ['bodyweight'])).toBe(false);
    expect(fits('bands', ['bodyweight'])).toBe(false);
    expect(fits('cardio', ['bodyweight'])).toBe(false);
    expect(placesFor(['bodyweight'])).toEqual(['home', 'travel', 'full', 'bodyweight']);
  });
  it('cardio only: travel, full, cardio; cardio never with lifting', () => {
    expect(placesFor(['cardio'])).toEqual(['travel', 'full', 'cardio']);
    expect(fits('cardio', ['cardio', 'dumbbell'])).toBe(false);
  });
  it('kettlebells: full gym only (no other preset has them)', () => {
    expect(placesFor(['kettlebell'])).toEqual(['full']);
  });
});

describe('the shipped plans', () => {
  it('every plan exercise need matches its map entry, catalog gear and load type', () => {
    for (const p of PLANS) {
      for (const it of allItems(p.id)) {
        const e = MAP.get(it.exerciseId);
        const sure = e && e.match !== 'none' && e.catalogId ? CAT.get(e.catalogId)?.equipment : undefined;
        if (sure && sure !== 'other') expect(needOf(it.exerciseId), it.exerciseId).not.toBe('unknown');
      }
    }
  });
  it('both curated plans need a full gym (barbells, machines, holds with no sure gear)', () => {
    for (const p of PLANS) {
      const needs = planNeeds(p);
      expect(needs).toContain('barbell');
      expect(needs).toContain('machine');
      expect(placesOfPlan(p)).toEqual(['full']);
    }
  });
  it('tiles: only places with a plan behind them, every plan in at least one tile', () => {
    expect(PLACE_TILES.map((t) => t.place.id)).toEqual(['full']);
    expect(PLACE_TILES[0]!.plans.map((p) => p.id)).toEqual(['five-day-split', 'six-week-volume']);
    for (const t of PLACE_TILES) expect(t.plans.length).toBeGreaterThan(0);
    for (const p of PLANS) expect(PLACE_TILES.some((t) => t.plans.includes(p))).toBe(true);
  });
  it('a place with no plan lists none (the honest empty state), an unknown id too', () => {
    expect(plansForPlace('home')).toEqual([]);
    expect(plansForPlace('cardio')).toEqual([]);
    expect(plansForPlace('nowhere')).toEqual([]);
    expect(plansForPlace(undefined)).toEqual([]);
    expect(plansForPlace('full').map((p) => p.id)).toEqual(['five-day-split', 'six-week-volume']);
  });
  it('placeTiles drops empty places and keeps plan order', () => {
    const tiles = placeTiles(['a', 'b', 'c'], (x): PlaceId[] => (x === 'a' ? ['home', 'full'] : x === 'b' ? ['full'] : []));
    expect(tiles.map((t) => [t.place.id, t.plans])).toEqual([
      ['home', ['a']],
      ['full', ['a', 'b']],
    ]);
  });
});

describe('weekTable: the six week numbers, straight from the JSON', () => {
  const sixWeek = planById('six-week-volume')!;
  type RawItem = { exercise: string; weeks: Array<{ sets?: number; reps?: number; rounds?: number }> };
  const raw = (sixWeekRaw as { days: Array<{ n: number; items: RawItem[] }> }).days;

  it('every item of every day: six cells that equal the JSON', () => {
    let checked = 0;
    sixWeek.days.forEach((d, di) => {
      const items = d.blocks.flatMap((b) => b.items);
      expect(items.length).toBe(raw[di]!.items.length);
      items.forEach((it, ii) => {
        const src = raw[di]!.items[ii]!;
        expect(it.name).toBe(src.exercise);
        const t = weekTable(it)!;
        expect(t.cells).toHaveLength(6);
        const sets = src.weeks.map((w) => w.sets);
        const reps = src.weeks.map((w) => w.reps);
        const want = src.weeks[0]!.rounds !== undefined
          ? src.weeks.map((w) => String(w.rounds))
          : new Set(sets).size === 1 && new Set(reps).size > 1
            ? reps.map(String)
            : new Set(reps).size === 1 && new Set(sets).size > 1
              ? sets.map(String)
              : src.weeks.map((w) => `${w.sets} × ${w.reps}`);
        expect(t.cells, `${d.name} ${it.name}`).toEqual(want);
        checked++;
      });
    });
    expect(checked).toBe(48);
  });

  it('captions name the number that stays', () => {
    const find = (name: string) => allItems('six-week-volume').find((i) => i.name === name)!;
    expect(weekTable(find('Front Squat'))).toEqual({ caption: 'Reps each week · 5 sets', cells: ['6', '7', '8', '9', '10', '11'] });
    expect(weekTable(find('Deadlift'))!.cells).toEqual(['8', '9', '10', '11', '12', '14']);
    expect(weekTable(find('Hip Thrust'))!.cells.at(-1)).toBe('18');
    expect(weekTable(find('Single Leg Romanian Deadlift'))!.cells).toEqual(['8', '9', '10', '10', '12', '12']);
    expect(weekTable(find('Leg Extension'))).toEqual({ caption: 'Reps each week · 10 sets', cells: ['10', '11', '12', '13', '14', '15'] });
    expect(weekTable(find('28 Method Squat'))).toEqual({ caption: 'Sets each week · 28 reps', cells: ['3', '3', '4', '4', '5', '5'] });
    expect(weekTable(find('Crunch'))).toEqual({ caption: 'Sets each week · 10 reps', cells: ['3', '4', '5', '6', '7', '8'] });
    expect(weekTable(find('30 Second Interval Sprint'))).toEqual({ caption: 'Rounds each week · 30 sec each', cells: ['10', '12', '14', '16', '18', '20'] });
  });

  it('both numbers changing, or neither, shows sets × reps; no table without weeks', () => {
    const it = (weeks: PlanItem['weeks']): PlanItem => ({ exerciseId: 'x', name: 'X', weeks });
    expect(weekTable(it([{ sets: 3, reps: 8 }, { sets: 4, reps: 10 }]))!.cells).toEqual(['3 × 8', '4 × 10']);
    expect(weekTable(it([{ sets: 3, reps: 8 }, { sets: 3, reps: 8 }]))!.cells).toEqual(['3 × 8', '3 × 8']);
    expect(weekTable(it([{ sets: 1, reps: 8 }, { sets: 1, reps: 9 }]))!.caption).toBe('Reps each week · 1 set');
    expect(weekTable(it(undefined))).toBeNull();
    expect(weekTable(allItems('five-day-split')[0]!)).toBeNull();
  });
});

describe('pairs: the rest once per pair', () => {
  it('pair rows leave the rest to the pair, singles keep it', () => {
    const day2 = planById('five-day-split')!.days[1]!;
    const pair = day2.blocks.find((b) => b.kind === 'pair' && !b.warmup)!;
    expect(pair.restSec).toBe(90);
    for (const it of pair.items) {
      expect(itemLine(pair, it, 0, false)).not.toContain('rest');
      expect(itemLine(pair, it)).toContain('90 s rest');
    }
  });
});

describe('demos inside plan workouts: every plan exercise', () => {
  it('a demo and muscles only for an exact or variant match, never for none', () => {
    let demos = 0;
    let none = 0;
    for (const p of PLANS) {
      for (const it of allItems(p.id)) {
        const e = MAP.get(it.exerciseId);
        expect(e, `${it.exerciseId} has a map entry`).toBeTruthy();
        const demo = demoForPlan(it.exerciseId);
        const info = infoForPlan(it.exerciseId, it.note ? [it.note] : []);
        if (e!.match === 'none') {
          none++;
          expect(demo, it.exerciseId).toBeNull();
          expect(musclesForPlan(it.exerciseId), it.exerciseId).toBeNull();
          // Name and plan notes only.
          if (it.note) expect(JSON.stringify(info)).toContain(it.note);
        } else {
          demos++;
          expect(demo, it.exerciseId).not.toBeNull();
          for (const path of [...demo!.jpg, ...demo!.webp]) {
            expect(path.startsWith(`ex/${e!.catalogId}/`), path).toBe(true);
            expect(existsSync(`public/${path}`), path).toBe(true);
          }
          expect(musclesForPlan(it.exerciseId), it.exerciseId).not.toBeNull();
        }
      }
    }
    // Counted over plan rows (an exercise on two days counts twice).
    expect(demos).toBeGreaterThan(0);
    expect(none).toBeGreaterThan(0);
  });
});
