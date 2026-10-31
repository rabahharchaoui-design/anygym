import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { BACK, FRONT, REGIONS, VIEWBOX } from '../bodyPolygons';
import type { MapEntry } from '../catalog';
import {
  MUSCLE_LABELS,
  MUSCLE_REGIONS,
  muscleReportLines,
  muscleText,
  resolveMuscles,
  resolvePlanMuscles,
  validateMuscleOverrides,
  type CatalogMuscles,
  type MuscleOverrides,
} from '../muscles';

const read = <T>(p: string): T => JSON.parse(readFileSync(new URL(`../../../${p}`, import.meta.url), 'utf8')) as T;
const catalog = read<{ exercises: CatalogMuscles[] }>('data/catalog.json').exercises;
const overrides = read<MuscleOverrides>('data/muscle-overrides.json');
const map = read<MapEntry[]>('data/exercise-map.json');
const byId = new Map(catalog.map((e) => [e.id, e]));
const ex = (id: string) => byId.get(id)!;
const NONE: MuscleOverrides = { exercises: {} };

describe('body polygons (ported from react-body-highlighter)', () => {
  it('every polygon has finite points inside the viewBox, and every region id is listed', () => {
    for (const shape of [...FRONT, ...BACK]) {
      expect(REGIONS).toContain(shape.region);
      for (const p of shape.polygons) {
        const n = p.split(' ').map(Number);
        expect(n.length % 2).toBe(0);
        expect(n.length).toBeGreaterThanOrEqual(6);
        for (let i = 0; i < n.length; i += 2) {
          expect(n[i]! >= 0 && n[i]! <= VIEWBOX.width).toBe(true);
          expect(n[i + 1]! >= 0 && n[i + 1]! <= VIEWBOX.height).toBe(true);
        }
      }
    }
  });
  it('front and back together draw every region', () => {
    expect(new Set([...FRONT, ...BACK].map((s) => s.region))).toEqual(new Set(REGIONS));
  });
});

describe('SPEC 4.5 table', () => {
  it.each([
    ['abdominals', ['abs']],
    ['obliques', ['obliques']],
    ['adductors', ['adductor']],
    ['biceps', ['biceps']],
    ['calves', ['calves']],
    ['chest', ['chest']],
    ['forearms', ['forearm']],
    ['glutes', ['gluteal']],
    ['hamstrings', ['hamstring']],
    ['lats', ['upper-back']],
    ['middle back', ['upper-back']],
    ['lower back', ['lower-back']],
    ['neck', ['neck']],
    ['quadriceps', ['quadriceps']],
    ['traps', ['trapezius']],
    ['triceps', ['triceps']],
  ])('%s → %j', (muscle, regions) => {
    expect(MUSCLE_REGIONS[muscle]).toEqual(regions);
  });
  it('abductors light the glute shape (the upstream "abductors" polygon is on the inner thigh)', () => {
    expect(MUSCLE_REGIONS.abductors).toEqual(['gluteal']);
    expect(resolveMuscles(ex('Thigh_Abductor'), overrides)!.text).toBe('Outer hips · Glutes');
  });
  it('has no global shoulder rule', () => {
    expect(MUSCLE_REGIONS.shoulders).toBeUndefined();
  });
  it('every region in the table is a real polygon id, and every label exists', () => {
    for (const [m, rs] of Object.entries(MUSCLE_REGIONS)) {
      for (const r of rs) expect(REGIONS).toContain(r);
      expect(MUSCLE_LABELS[m]).toBeTruthy();
    }
  });
});

describe('data/muscle-overrides.json', () => {
  it('is valid: every catalog exercise with shoulders has one, all with a reason', () => {
    expect(validateMuscleOverrides(catalog, overrides, REGIONS)).toEqual([]);
  });
  it('every catalog exercise with shoulders resolves them (or leaves them out on purpose)', () => {
    for (const e of catalog.filter((c) => [...c.primaryMuscles, ...c.secondaryMuscles].includes('shoulders'))) {
      expect(overrides.exercises[e.id]?.shoulders, e.id).toBeTruthy();
    }
  });
  it('catches a missing override, an unknown id, a missing reason and a bad region', () => {
    const problems = validateMuscleOverrides(
      [ex('Side_Lateral_Raise'), ex('Barbell_Curl')],
      { exercises: { Nope: { shoulders: 'front', why: 'x' }, Barbell_Curl: { shoulders: 'front', why: ' ' } } },
      REGIONS.filter((r) => r !== 'chest'),
    );
    expect(problems).toEqual(
      expect.arrayContaining([
        'Nope: not in the catalog',
        'Barbell_Curl: missing why',
        'Barbell_Curl: sets shoulders but the source does not list them',
        'Side_Lateral_Raise: lists shoulders but has no override',
        'chest: unknown region chest',
      ]),
    );
  });
});

describe('resolveMuscles', () => {
  it('incline press: upper chest primary, front delts and triceps secondary', () => {
    const d = resolveMuscles(ex('Barbell_Incline_Bench_Press_-_Medium_Grip'), overrides)!;
    expect(d.text).toBe('Upper chest · Front delts, triceps');
    expect(d.shading).toEqual({ chest: 'primary', 'front-deltoids': 'secondary', triceps: 'secondary' });
  });
  it('lateral raise lights the front delt shape but the text says side delts', () => {
    const d = resolveMuscles(ex('Side_Lateral_Raise'), overrides)!;
    expect(d.shading).toEqual({ 'front-deltoids': 'primary' });
    expect(d.text).toBe('Side delts');
    expect(d.text).not.toMatch(/front/i);
  });
  it('presses go front, rear delt work goes back', () => {
    expect(resolveMuscles(ex('Dumbbell_Shoulder_Press'), overrides)!.shading).toEqual({ 'front-deltoids': 'primary', triceps: 'secondary' });
    expect(resolveMuscles(ex('Face_Pull'), overrides)!.shading).toEqual({ 'back-deltoids': 'primary', 'upper-back': 'secondary' });
    expect(resolveMuscles(ex('Reverse_Machine_Flyes'), overrides)!.text).toBe('Rear delts');
  });
  it('lats and middle back share one shape; primary wins it, both stay in the text', () => {
    const d = resolveMuscles(ex('Bent_Over_Barbell_Row'), overrides)!;
    expect(d.shading['upper-back']).toBe('primary');
    expect(d.text).toBe('Mid back · Biceps, lats, rear delts');
  });
  it('a muscle in both lists stays primary once', () => {
    const d = resolveMuscles({ id: 'x', primaryMuscles: ['chest'], secondaryMuscles: ['chest', 'triceps'] }, NONE)!;
    expect(d.secondary.map((t) => t.muscle)).toEqual(['triceps']);
  });
  it('never guesses shoulders without an override, and drops unknown muscles', () => {
    const d = resolveMuscles({ id: 'x', primaryMuscles: ['chest'], secondaryMuscles: ['shoulders', 'spleen'] }, NONE)!;
    expect(d.text).toBe('Chest');
    expect(d.shading).toEqual({ chest: 'primary' });
  });
  it('leave out drops shoulders; rotator cuff is text only', () => {
    expect(resolveMuscles(ex('Goblet_Squat'), overrides)!.text).not.toMatch(/delt|shoulder/i);
    const rot = resolveMuscles(ex('Internal_Rotation_with_Band'), overrides)!;
    expect(rot.text).toBe('Rotator cuff');
    expect(rot.shading).toEqual({});
  });
  it('honest empty state: no exercise, no muscles, or no primary it can name', () => {
    expect(resolveMuscles(undefined, overrides)).toBeNull();
    expect(resolveMuscles({ id: 'x', primaryMuscles: [], secondaryMuscles: ['chest'] }, NONE)).toBeNull();
    expect(resolveMuscles({ id: 'x', primaryMuscles: ['shoulders'], secondaryMuscles: [] }, NONE)).toBeNull();
  });
  it('does not change its input', () => {
    const e = { id: 'x', primaryMuscles: ['chest'], secondaryMuscles: ['triceps'] };
    resolveMuscles(e, NONE);
    expect(e).toEqual({ id: 'x', primaryMuscles: ['chest'], secondaryMuscles: ['triceps'] });
  });
  it('every catalog exercise resolves to a primary muscle and only real regions', () => {
    for (const e of catalog) {
      const d = resolveMuscles(e, overrides);
      expect(d, e.id).not.toBeNull();
      for (const r of Object.keys(d!.shading)) expect(REGIONS).toContain(r);
    }
  });
});

describe('muscleText', () => {
  it('joins primary, then secondary after a dot, first word capitalised', () => {
    const t = (label: string) => ({ muscle: label, label, regions: [] });
    expect(muscleText([t('upper chest'), t('front delts')], [t('triceps')])).toBe('Upper chest, front delts · Triceps');
    expect(muscleText([t('abs')], [])).toBe('Abs');
  });
});

describe('plan exercises (SPEC 4.3)', () => {
  it('match none shows no map; mapped ones resolve through the catalog', () => {
    for (const e of map) {
      const d = resolvePlanMuscles(e, byId, overrides);
      if (e.match === 'none') expect(d, e.planId).toBeNull();
      else expect(d, e.planId).toEqual(resolveMuscles(byId.get(e.catalogId!), overrides));
    }
    expect(resolvePlanMuscles(undefined, byId, overrides)).toBeNull();
    expect(map.some((e) => e.match === 'none')).toBe(true);
  });
});

describe('CATALOG_REPORT.md', () => {
  it('its muscle section matches the overrides (run npm run muscle-report)', () => {
    const report = readFileSync(new URL('../../../CATALOG_REPORT.md', import.meta.url), 'utf8');
    const section = report.slice(report.indexOf('## Muscle map (SPEC 4.5)'));
    expect(section).toBe(muscleReportLines(catalog, overrides).join('\n'));
    expect(section).not.toContain('NOT RESOLVED');
  });
});
