import { describe, expect, it } from 'vitest';
import { PLAN_EXERCISES } from '../../data/planExercises';
import { closestFirst, NEUTRAL_WORDS, PICKER_ALIASES, PICKER_NAMES, bodyPartOf, gymSupports, pickerId, pickerName, pickerSections, sameExerciseIds } from '../picker';

const full = { equipment: ['barbell_rack', 'cable_station', 'leg_press'] as const, dumbbellRange: { min: 5, max: 100, step: 5 } };
const hotel = { equipment: [] as const, dumbbellRange: { min: 5, max: 50, step: 5 } };

describe('bodyPartOf (names only, never a guess)', () => {
  it.each([
    ['Barbell Back Squat', 'Legs'],
    ['Romanian Deadlift', 'Legs'],
    ['Leg Curl', 'Legs'],
    ['Machine Seated Calf Raise', 'Legs'],
    ['Barbell Bent Over Row', 'Back'],
    ['Lat Machine Wide Grip Pulldown', 'Back'],
    ['Pull Up', 'Back'],
    ['Upright Row', 'Shoulders'],
    ['Rear Delt Fly', 'Shoulders'],
    ['Machine Seated Reverse Fly', 'Shoulders'],
    ['Barbell Incline Bench Press', 'Chest'],
    ['Chest Fly', 'Chest'],
    ['Incline Plate Press', 'Chest'],
    ['Bicep Curl', 'Arms'],
    ['Cable Triceps Pushdown', 'Arms'],
    ['Forearm Finger Roll', 'Arms'],
    ['Crunch', 'Core'],
    ['Plank', 'Core'],
    ['Lying Straight Leg Raise', 'Core'],
    ['Deadlift', 'More'],
    ['Static Quadricep Stretch', 'More'],
    ['30 Second Interval Sprint', 'More'],
  ])('%s → %s', (name, part) => {
    expect(bodyPartOf(name)).toBe(part);
  });
  it('no triceps or biceps exercise sits under Back or Chest (the whole list)', () => {
    for (const e of PLAN_EXERCISES) {
      if (/\b(tricep|triceps|bicep|biceps)\b/i.test(e.name)) expect(['Back', 'Chest'], e.name).not.toContain(bodyPartOf(e.name));
    }
    expect(bodyPartOf('Cable Reverse Grip Tricep Pulldown')).toBe('Arms');
    expect(bodyPartOf('Lat Machine Wide Grip Pulldown')).toBe('Back');
  });
  it('every plan exercise gets a part or More', () => {
    for (const e of PLAN_EXERCISES) expect(['Chest', 'Back', 'Shoulders', 'Arms', 'Legs', 'Core', 'More']).toContain(bodyPartOf(e.name));
  });
});

describe('gymSupports', () => {
  it('maps load types to equipment', () => {
    expect(gymSupports('barbell', full)).toBe(true);
    expect(gymSupports('barbell', hotel)).toBe(false);
    expect(gymSupports('dumbbell_each', hotel)).toBe(true);
    expect(gymSupports('single', { equipment: [], dumbbellRange: null })).toBe(false);
    expect(gymSupports('stack', hotel)).toBe(false);
    expect(gymSupports('plate_machine', full)).toBe(true);
    expect(gymSupports('bodyweight', hotel)).toBe(true);
    expect(gymSupports('timed', hotel)).toBe(true);
    expect(gymSupports('unknown', full)).toBeUndefined();
  });
});

describe('pickerSections', () => {
  const recent = ['barbell-back-squat', 'not-an-exercise'];
  it('Recent, Popular, All: each exercise once, duplicates never listed', () => {
    const s = pickerSections(PLAN_EXERCISES, { query: '', part: null, recent, gym: full });
    expect(s.map((x) => x.title)).toEqual(['Recent', 'Popular', 'All']);
    expect(s[0]!.items.map((e) => e.id)).toEqual(['barbell-back-squat']);
    const ids = s.flatMap((x) => x.items.map((e) => e.id));
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids.length).toBe(PLAN_EXERCISES.length - Object.keys(PICKER_ALIASES).length);
    for (const dup of Object.keys(PICKER_ALIASES)) expect(ids).not.toContain(dup);
  });
  it('Popular: big compounds first (bench, deadlift, rows, pull ups, overhead press), short, never A to Z', () => {
    const s = pickerSections(PLAN_EXERCISES, { query: '', part: null, recent: [], gym: full });
    const popular = s.find((x) => x.title === 'Popular')!.items.map((e) => e.id);
    expect(popular.slice(0, 4)).toEqual(['barbell-back-squat', 'barbell-incline-bench-press', 'dumbbell-bench-press', 'deadlift']);
    expect(popular).toContain('barbell-bent-over-row');
    expect(popular).toContain('wide-grip-pull-up');
    expect(popular).toContain('overhead-press');
    expect(popular.length).toBeLessThanOrEqual(12);
    expect(s[0]!.title).toBe('Popular');
  });
  it('Popular only lists what the gym can make; the rest stays under All', () => {
    const s = pickerSections(PLAN_EXERCISES, { query: '', part: null, recent: [], gym: hotel });
    const popular = s.find((x) => x.title === 'Popular')!.items;
    expect(popular.every((e) => gymSupports(e.loadType, hotel) === true)).toBe(true);
    expect(s.find((x) => x.title === 'All')!.items.map((e) => e.id)).toContain('barbell-back-squat');
  });
  it('search: one flat list of matches, words in any order, across every body part', () => {
    const s = pickerSections(PLAN_EXERCISES, { query: ' back squat ', part: null, recent, gym: hotel });
    expect(s).toEqual([{ title: 'Results', items: [expect.objectContaining({ id: 'barbell-back-squat' })] }]);
    expect(pickerSections(PLAN_EXERCISES, { query: 'zzz', part: null, recent, gym: hotel })).toEqual([]);
    // The duplicate's word order still finds the one shown entry.
    const row = pickerSections(PLAN_EXERCISES, { query: 'bent over barbell', part: null, recent: [], gym: full });
    expect(row[0]!.items.map((e) => e.id)).toEqual(['barbell-bent-over-row']);
    const plank = pickerSections(PLAN_EXERCISES, { query: 'plank', part: null, recent: [], gym: full });
    expect(plank[0]!.items.map((e) => e.id)).toEqual(['elbow-plank', 'spider-plank']);
  });
  it('a chip picked with a search narrows it; nothing in that part is an empty list', () => {
    expect(pickerSections(PLAN_EXERCISES, { query: 'plank', part: 'Shoulders', recent: [], gym: full })).toEqual([]);
    expect(pickerSections(PLAN_EXERCISES, { query: 'plank', part: 'Core', recent: [], gym: full })[0]!.items.length).toBe(2);
  });
  it('a body part narrows every section', () => {
    const s = pickerSections(PLAN_EXERCISES, { query: '', part: 'Core', recent, gym: full });
    for (const x of s) for (const e of x.items) expect(bodyPartOf(e.name)).toBe('Core');
    expect(s.find((x) => x.title === 'Recent')).toBeUndefined();
  });
  it('history under a duplicate id shows as its entry in Recent', () => {
    const s = pickerSections(PLAN_EXERCISES, { query: '', part: null, recent: ['plank', 'elbow-plank', 'bent-over-barbell-row', 'leg-curl'], gym: full });
    expect(s[0]!.items.map((e) => e.id)).toEqual(['elbow-plank', 'barbell-bent-over-row', 'leg-curl']);
  });
});

describe('duplicates (PICKER_ALIASES)', () => {
  const words = (n: string) => new Set(n.toLowerCase().replace(/[()]/g, ' ').split(/[\s-]+/).filter(Boolean).map((w) => w.replace(/s$/, '')));
  const byId = new Map(PLAN_EXERCISES.map((e) => [e.id, e]));

  it('every alias points from an existing id to an existing, shown id', () => {
    for (const [from, to] of Object.entries(PICKER_ALIASES)) {
      expect(byId.get(from), from).toBeDefined();
      expect(byId.get(to), to).toBeDefined();
      expect(PICKER_ALIASES[to]).toBeUndefined();
      expect(pickerId(from)).toBe(to);
    }
    expect(pickerId('barbell-back-squat')).toBe('barbell-back-squat');
  });

  it('implement rule: an alias is the same movement on the same implement beyond doubt, nothing else', () => {
    const neutral = new Set(NEUTRAL_WORDS);
    for (const [from, to] of Object.entries(PICKER_ALIASES)) {
      const a = byId.get(from)!;
      const b = byId.get(to)!;
      expect(a.loadType, `${from} → ${to}`).toBe(b.loadType);
      const A = words(a.name);
      const B = words(b.name);
      const extra = [...B].filter((w) => !A.has(w));
      const missing = [...A].filter((w) => !B.has(w));
      expect(missing, from).toEqual([]);
      // Same words, or only words that say nothing about the equipment (never machine, seated, lying, angled…).
      for (const w of extra) expect(neutral.has(w), `${from} → ${to}: "${w}" names an implement`).toBe(true);
    }
  });

  it('every pair the rule allows is listed (same words, or a bare name plus neutral words, same load type)', () => {
    const neutral = new Set(NEUTRAL_WORDS);
    const found = new Map<string, string>();
    for (const a of PLAN_EXERCISES)
      for (const b of PLAN_EXERCISES) {
        if (a === b || a.loadType !== b.loadType) continue;
        const A = words(a.name);
        const B = words(b.name);
        if (![...A].every((w) => B.has(w))) continue;
        const extra = [...B].filter((w) => !A.has(w));
        if (extra.length === 0 && a.id < b.id) continue; // one direction for same word pairs
        if (!extra.every((w) => neutral.has(w))) continue;
        found.set(a.id, b.id);
      }
    expect(Object.fromEntries(found)).toEqual({ ...PICKER_ALIASES });
  });

  it('machine names that do not prove the same machine stay apart, with their own history', () => {
    for (const id of ['leg-curl', 'leg-extension', 'leg-press', 'machine-leg-press']) {
      expect(PICKER_ALIASES[id], id).toBeUndefined();
      expect(sameExerciseIds(id)).toEqual([id]);
    }
  });

  it('a bare name for other equipment says its equipment, from its certain load type', () => {
    for (const [id, name] of Object.entries(PICKER_NAMES)) {
      const e = byId.get(id)!;
      expect(e.loadType).toBe('dumbbell_each');
      expect(pickerName(e)).toBe(name);
      expect(name.endsWith(e.name)).toBe(true);
    }
    expect(pickerName(byId.get('barbell-bicep-curl')!)).toBe('Barbell Bicep Curl');
  });
});

describe('sameExerciseIds', () => {
  it('groups a shown entry with its duplicates, from either side', () => {
    expect(sameExerciseIds('elbow-plank').sort()).toEqual(['elbow-plank', 'plank']);
    expect(sameExerciseIds('plank').sort()).toEqual(['elbow-plank', 'plank']);
    expect(sameExerciseIds('barbell-back-squat')).toEqual(['barbell-back-squat']);
  });
});

describe('closestFirst (import pick sheet)', () => {
  it('puts names sharing the most words first, then keeps list order', () => {
    const list = closestFirst(PLAN_EXERCISES, 'Zercher Moon Press');
    expect(list.length).toBe(PLAN_EXERCISES.length);
    expect(list[0]!.name).toMatch(/Press/);
    const squats = closestFirst(PLAN_EXERCISES, 'Front Squats');
    expect(squats[0]!.id).toBe('front-squat');
    expect(closestFirst(PLAN_EXERCISES, 'zzz').map((e) => e.id)).toEqual(PLAN_EXERCISES.map((e) => e.id));
  });
  it('the same load type comes first, then word overlap', () => {
    const list = closestFirst(PLAN_EXERCISES, 'Zercher Moon Press', 'dumbbell_each');
    const firstOther = list.findIndex((e) => e.loadType !== 'dumbbell_each');
    expect(list.slice(0, firstOther).every((e) => e.loadType === 'dumbbell_each')).toBe(true);
    expect(list.slice(firstOther).some((e) => e.loadType === 'dumbbell_each')).toBe(false);
    expect(list[0]!.name).toMatch(/Press/);
  });
});
