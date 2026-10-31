// Muscle map data (SPEC 4.5): turns a catalog exercise's muscle lists into the body regions to
// light up and the text line shown under the drawing. Pure: no I/O, so the app, the report script
// and the tests share one definition. Only `import type` from bodyPolygons so Node can run the
// report script straight from TypeScript.
import type { Region } from './bodyPolygons';

/** What "shoulders" means for one exercise (data/muscle-overrides.json). */
export type ShoulderPart = 'front' | 'rear' | 'side' | 'rotator cuff' | 'leave out';

export interface MuscleOverride {
  shoulders?: ShoulderPart;
  /** Replaces the text for one source muscle, e.g. { chest: 'upper chest' } on an incline. */
  labels?: Record<string, string>;
  why: string;
}

export interface MuscleOverrides {
  exercises: Record<string, MuscleOverride>;
}

export interface CatalogMuscles {
  id: string;
  primaryMuscles: string[];
  secondaryMuscles: string[];
}

export interface MuscleTarget {
  /** The source muscle name, kept for audits. */
  muscle: string;
  label: string;
  regions: Region[];
}

export type Shade = 'primary' | 'secondary';

export interface MuscleMapData {
  primary: MuscleTarget[];
  secondary: MuscleTarget[];
  /** Each lit region once; primary wins when both lists land on the same region. */
  shading: Partial<Record<Region, Shade>>;
  /** "Upper chest, front delts · Triceps": primary, then secondary after a dot. */
  text: string;
}

/** The fixed SPEC 4.5 table. Shoulders are absent on purpose: they are decided per exercise. */
export const MUSCLE_REGIONS: Record<string, Region[]> = {
  abdominals: ['abs'],
  obliques: ['obliques'],
  // SPEC 4.5 says abductors→abductors, but the upstream polygon with that name sits on the inner
  // thigh (it is filed under adductor in bodyPolygons.ts). The hip abductors are the side glutes,
  // so lighting the glute shape is the honest choice (SPEC 0: no wrong muscles).
  abductors: ['gluteal'],
  adductors: ['adductor'],
  biceps: ['biceps'],
  calves: ['calves'],
  chest: ['chest'],
  forearms: ['forearm'],
  glutes: ['gluteal'],
  hamstrings: ['hamstring'],
  lats: ['upper-back'],
  'middle back': ['upper-back'],
  'lower back': ['lower-back'],
  neck: ['neck'],
  quadriceps: ['quadriceps'],
  traps: ['trapezius'],
  triceps: ['triceps'],
};

/** Plain words for the text line (SPEC 13.1). */
export const MUSCLE_LABELS: Record<string, string> = {
  abdominals: 'abs',
  obliques: 'obliques',
  abductors: 'outer hips',
  adductors: 'inner thighs',
  biceps: 'biceps',
  calves: 'calves',
  chest: 'chest',
  forearms: 'forearms',
  glutes: 'glutes',
  hamstrings: 'hamstrings',
  lats: 'lats',
  'middle back': 'mid back',
  'lower back': 'lower back',
  neck: 'neck',
  quadriceps: 'quads',
  traps: 'traps',
  triceps: 'triceps',
};

/** Shoulder parts: the region drawn and the words shown. The drawing has no side delt shape. */
export const SHOULDER_PARTS: Record<Exclude<ShoulderPart, 'leave out'>, { label: string; regions: Region[] }> = {
  front: { label: 'front delts', regions: ['front-deltoids'] },
  rear: { label: 'rear delts', regions: ['back-deltoids'] },
  side: { label: 'side delts', regions: ['front-deltoids'] },
  'rotator cuff': { label: 'rotator cuff', regions: [] },
};

function target(muscle: string, override: MuscleOverride | undefined): MuscleTarget | null {
  if (muscle === 'shoulders') {
    const part = override?.shoulders;
    if (!part || part === 'leave out') return null; // never guess front or rear
    const s = SHOULDER_PARTS[part];
    return { muscle, label: s.label, regions: [...s.regions] };
  }
  const regions = MUSCLE_REGIONS[muscle];
  if (!regions) return null; // unknown muscle: say nothing rather than guess
  return { muscle, label: override?.labels?.[muscle] ?? MUSCLE_LABELS[muscle] ?? muscle, regions: [...regions] };
}

const sentenceCase = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

/** The text line under the drawing. */
export function muscleText(primary: MuscleTarget[], secondary: MuscleTarget[]): string {
  const group = (list: MuscleTarget[]) => sentenceCase(list.map((t) => t.label).join(', '));
  return [primary, secondary].filter((l) => l.length > 0).map(group).join(' · ');
}

/**
 * Resolves one catalog exercise. Returns null (the honest empty state) when there is no exercise,
 * or when no primary muscle can be named for sure.
 */
export function resolveMuscles(exercise: CatalogMuscles | null | undefined, overrides: MuscleOverrides): MuscleMapData | null {
  if (!exercise) return null;
  const override = overrides.exercises[exercise.id];
  const build = (list: string[], skip: Set<string>) => {
    const out: MuscleTarget[] = [];
    const labels = new Set<string>();
    for (const m of list) {
      if (skip.has(m)) continue;
      skip.add(m);
      const t = target(m, override);
      if (!t || labels.has(t.label)) continue;
      labels.add(t.label);
      out.push(t);
    }
    return out;
  };
  const seen = new Set<string>();
  const primary = build(exercise.primaryMuscles, seen);
  if (primary.length === 0) return null;
  const secondary = build(exercise.secondaryMuscles, seen).filter((t) => !primary.some((p) => p.label === t.label));
  const shading: Partial<Record<Region, Shade>> = {};
  for (const t of secondary) for (const r of t.regions) shading[r] = 'secondary';
  for (const t of primary) for (const r of t.regions) shading[r] = 'primary';
  return { primary, secondary, shading, text: muscleText(primary, secondary) };
}

/** The plan side of SPEC 4.3: a plan exercise with match none gets no muscle map either. */
export function resolvePlanMuscles(
  entry: { match: string; catalogId: string | null } | undefined,
  catalogById: Map<string, CatalogMuscles>,
  overrides: MuscleOverrides,
): MuscleMapData | null {
  if (!entry || entry.match === 'none' || !entry.catalogId) return null;
  return resolveMuscles(catalogById.get(entry.catalogId), overrides);
}

const usesShoulders = (e: CatalogMuscles) => [...e.primaryMuscles, ...e.secondaryMuscles].includes('shoulders');
const PARTS = new Set<string>(['front', 'rear', 'side', 'rotator cuff', 'leave out']);

/** Problems with the overrides file; an empty list means it is valid. */
export function validateMuscleOverrides(exercises: CatalogMuscles[], overrides: MuscleOverrides, regions: readonly string[]): string[] {
  const problems: string[] = [];
  const byId = new Map(exercises.map((e) => [e.id, e]));
  const known = new Set(regions);
  for (const [id, o] of Object.entries(overrides.exercises)) {
    const e = byId.get(id);
    if (!e) {
      problems.push(`${id}: not in the catalog`);
      continue;
    }
    if (!o.why || !o.why.trim()) problems.push(`${id}: missing why`);
    if (o.shoulders !== undefined && !PARTS.has(o.shoulders)) problems.push(`${id}: bad shoulders ${o.shoulders}`);
    if (o.shoulders !== undefined && !usesShoulders(e)) problems.push(`${id}: sets shoulders but the source does not list them`);
    for (const [m, label] of Object.entries(o.labels ?? {})) {
      if (![...e.primaryMuscles, ...e.secondaryMuscles].includes(m)) problems.push(`${id}: label for unlisted muscle ${m}`);
      if (!label.trim()) problems.push(`${id}: empty label for ${m}`);
    }
  }
  for (const e of exercises) {
    if (usesShoulders(e) && !overrides.exercises[e.id]?.shoulders) problems.push(`${e.id}: lists shoulders but has no override`);
    for (const m of [...e.primaryMuscles, ...e.secondaryMuscles]) {
      if (m !== 'shoulders' && !MUSCLE_REGIONS[m]) problems.push(`${e.id}: unknown muscle ${m}`);
    }
  }
  for (const [m, rs] of Object.entries(MUSCLE_REGIONS)) for (const r of rs) if (!known.has(r)) problems.push(`${m}: unknown region ${r}`);
  for (const [p, s] of Object.entries(SHOULDER_PARTS)) for (const r of s.regions) if (!known.has(r)) problems.push(`${p}: unknown region ${r}`);
  return problems;
}

/** The SPEC 4.5 section of CATALOG_REPORT.md. */
export function muscleReportLines(exercises: CatalogMuscles[], overrides: MuscleOverrides): string[] {
  const rows = exercises.filter(usesShoulders).map((e) => {
    const o = overrides.exercises[e.id];
    const shown = !o?.shoulders ? 'NOT RESOLVED' : o.shoulders === 'leave out' ? 'left out' : `${SHOULDER_PARTS[o.shoulders].label} (${SHOULDER_PARTS[o.shoulders].regions.join(', ') || 'text only'})`;
    const where = e.primaryMuscles.includes('shoulders') ? 'primary' : 'secondary';
    return `| ${e.id} | ${where} | ${shown} | ${resolveMuscles(e, overrides)?.text ?? ''} | ${o?.why ?? ''} |`;
  });
  const relabeled = Object.entries(overrides.exercises).filter(([, o]) => o.labels);
  return [
    '## Muscle map (SPEC 4.5)',
    '',
    'The source only says "shoulders"; every exercise that lists them is resolved in data/muscle-overrides.json',
    '(checked by src/lib/__tests__/muscles.test.ts). Side delts light the front delt shape because the drawing has none;',
    'the text under the map says side delts. Hip abductors light the glute shape (the upstream "abductors" polygon sits',
    'on the inner thigh and is drawn as adductor). Plan exercises with match none show no muscle map.',
    '',
    '| Catalog id | Shoulders in source | Shown as | Text under the map | Why |',
    '|---|---|---|---|---|',
    ...rows,
    '',
    `Text overrides: ${relabeled.map(([id, o]) => `${id} (${Object.entries(o.labels ?? {}).map(([m, l]) => `${m} → ${l}`).join(', ')})`).join(', ') || 'none'}.`,
    '',
  ];
}
