// Builds the candidate list (PLAN 3.5e) from the source records and the curation lines. Pure and
// deterministic: the same inputs give the same file, byte for byte (sorted by id). Every candidate
// is cross checked against two references (src/lib/candidates/rules.ts); anything that does not
// agree is a problem, never written. No candidate may already be in the sure catalog.
import type { EquipmentId } from '../../db/types';
import type { Region } from '../bodyArt';
import { resolveMuscles, type MuscleOverride } from '../muscles';
import type { Requires } from '../swap';
import type { CurationEntry, MuscleFix } from './curation';
import { GROUP_MUSCLES, checkGear, shoulderRule, sourceGear, usesShoulders } from './rules';
import { EXTRA_GROUPS, type CandidateGroup, type CandidateRecord, type PhotoCheck, type SourceExercise, type Style } from './types';

export interface BuildInput {
  entries: readonly CurationEntry[];
  source: ReadonlyMap<string, SourceExercise>;
  /** Ids of data/catalog.json: a candidate is never one of them. */
  catalogIds: ReadonlySet<string>;
  /** The ladder pattern names of data/patterns.json. */
  patterns: readonly string[];
  photos: Readonly<Record<string, string>>;
  /** Hand corrections of the source's muscle lists (data/candidate-curation.json "muscles"). */
  muscles?: Readonly<Record<string, MuscleFix>>;
}

export interface BuildResult {
  candidates: CandidateRecord[];
  /** Ids the contact sheet check dropped, with why. */
  dropped: Array<{ id: string; why: string }>;
  problems: string[];
}

/** Where a candidate's photos live in public/ (never under ex/, which the catalog build replaces). */
export const candidatePhotos = (id: string): CandidateRecord['images'] => {
  const webp: [string, string] = [`exc/${id}/0.webp`, `exc/${id}/1.webp`];
  return { webp, jpg: webp };
};

const QUIET_LOAD = new Set<CandidateGroup>(['cardio']);

function stylesOf(group: CandidateGroup, ladder: boolean, requires: Requires, s: SourceExercise): Style[] {
  const out: Style[] = [];
  if (group === 'cardio') out.push('cardio');
  else if (group === 'mobility') out.push('mobility');
  else if (group === 'power') out.push('plyometrics');
  else if (group === 'core') out.push('core');
  if (ladder && group !== 'core') out.push(s.mechanic === 'compound' ? 'strength' : 'hypertrophy');
  if (!out.length) out.push(s.mechanic === 'compound' ? 'strength' : 'hypertrophy');
  if (requires.length === 0 && group !== 'cardio' && group !== 'mobility') out.push('bodyweight');
  if (s.equipment === 'bands') out.push('bands');
  if (s.equipment === 'kettlebells') out.push('kettlebell');
  return [...new Set(out)];
}

function photoCheck(id: string, photos: BuildInput['photos']): PhotoCheck {
  const note = photos[id];
  if (note && note.startsWith('ok')) return { confidence: 'contact-sheet', note: note.replace(/^ok:?\s*/, '') || 'Both photos show the named move at thumbnail size.' };
  return { confidence: 'not-viewed', note: 'Not opened by the builder: G checks both photos in the review.' };
}

const unique = (list: readonly string[], skip: readonly string[] = []) => [...new Set(list)].filter((m) => !skip.includes(m));

/** One candidate, or why it cannot be one. */
function buildOne(e: CurationEntry, src: SourceExercise, input: BuildInput): CandidateRecord | string {
  // The source's muscle lists, after the curation's hand correction (if any), with no muscle twice:
  // a muscle in both lists is primary only, and a repeated muscle is named once.
  const fix = input.muscles?.[e.id];
  const primary = unique(fix ? fix.primary : src.primaryMuscles);
  const s: SourceExercise = { ...src, primaryMuscles: primary, secondaryMuscles: unique(fix ? fix.secondary : src.secondaryMuscles, primary) };
  const ladder = !(EXTRA_GROUPS as readonly string[]).includes(e.group);
  if (ladder && !input.patterns.includes(e.group)) return `${e.id}: unknown pattern ${e.group}`;
  if (s.images.length < 2) return `${e.id}: the source has ${s.images.length} photos, a demo needs two`;
  const base = sourceGear(s.equipment, s.id);
  if (!base && !e.replace.length && !e.add.length) return `${e.id}: source equipment "${s.equipment}" needs its gear named in the curation`;
  const requires: EquipmentId[][] = [...(e.replace.length ? e.replace : (base?.requires ?? [])), ...e.add].map((g) => [...g]);
  const gear = checkGear(s, requires);
  if (!gear.ok) return gear.problem;

  // Muscles: the source's primary must include one of the pattern's main muscles.
  const expect = GROUP_MUSCLES[e.group];
  const hit = s.primaryMuscles.filter((m) => !expect.length || expect.includes(m));
  if (!hit.length) return `${e.id}: source primary ${s.primaryMuscles.join(', ')} is not a ${e.group} muscle (${expect.join(', ')})`;
  let muscleOverride: MuscleOverride | undefined;
  if (usesShoulders(s)) {
    const rule = e.shoulders ? { part: e.shoulders, rule: 'set by hand in the curation after reading the instructions' } : shoulderRule(s, e.group);
    if (!rule) return `${e.id}: lists shoulders and no rule says which part (add sh:)`;
    muscleOverride = { shoulders: rule.part, why: rule.rule };
  }
  const map = resolveMuscles(s, { exercises: muscleOverride ? { [s.id]: muscleOverride } : {} });
  if (!map) return `${e.id}: no primary muscle can be named for sure`;

  const timed = e.timed || QUIET_LOAD.has(e.group) || (e.group === 'mobility' && s.force === 'static' && !e.reps);
  const load = timed ? 'timed' : (e.load ?? base?.load ?? 'unknown');
  const photo = photoCheck(e.id, input.photos);
  const regions = (list: typeof map.primary): Region[] => [...new Set(list.flatMap((t) => t.regions))];
  const rec: CandidateRecord = {
    id: s.id,
    name: s.name,
    equipment: s.equipment,
    category: s.category,
    level: s.level,
    force: s.force,
    mechanic: s.mechanic,
    pattern: e.group,
    ladder,
    styles: stylesOf(e.group, ladder, requires, s),
    requires,
    load,
    ...(e.bar ? { bar: e.bar } : s.equipment === 'e-z curl bar' || e.replace.some((g) => g.includes('ez_curl_bar')) ? { bar: 'ez_curl' as const } : {}),
    ...(e.each ? { eachSide: true as const } : {}),
    ...(timed ? { timed: true as const } : {}),
    primaryMuscles: [...s.primaryMuscles],
    secondaryMuscles: [...s.secondaryMuscles],
    ...(muscleOverride ? { muscleOverride } : {}),
    regions: { primary: regions(map.primary), secondary: regions(map.secondary) },
    muscleText: map.text,
    instructions: [...s.instructions],
    images: candidatePhotos(s.id),
    checks: {
      gear: { source: s.equipment ?? 'none', ours: requires.map((g) => g.join(' or ')).join(' + ') || 'nothing (body only)', agree: true, how: gear.how },
      muscles: { source: `${src.primaryMuscles.join(', ')}${src.secondaryMuscles.length ? ` · ${src.secondaryMuscles.join(', ')}` : ''}`, ours: map.text, agree: true, how: fix ? `corrected by hand: ${fix.why}` : expect.length ? `${e.group} works ${expect.join(' or ')}; the source's primary ${hit.join(', ')} matches` : `${e.group}: the source's muscles kept as they are, shoulders by the SPEC 4.5 rules` },
      pattern: { source: `${s.category}, force ${s.force ?? 'none'}, ${s.mechanic ?? 'no mechanic'}`, ours: e.group, agree: true, how: ladder ? `joins the ${e.group} swap ladder once approved, behind every sure move` : `${e.group} is not a swap ladder: shown in the review and the coverage report only` },
      photo,
    },
    confidence: photo.confidence === 'contact-sheet' && !e.replace.length && !e.shoulders && !fix ? 'high' : 'medium',
    status: 'candidate',
  };
  return rec;
}

export function buildCandidates(input: BuildInput): BuildResult {
  const candidates: CandidateRecord[] = [];
  const dropped: BuildResult['dropped'] = [];
  const problems: string[] = [];
  for (const e of input.entries) {
    if (input.catalogIds.has(e.id)) {
      problems.push(`${e.id}: already in the sure catalog`);
      continue;
    }
    const s = input.source.get(e.id);
    if (!s) {
      problems.push(`${e.id}: not in the source`);
      continue;
    }
    const note = input.photos[e.id];
    if (note?.startsWith('drop')) {
      dropped.push({ id: e.id, why: note.replace(/^drop:?\s*/, '') });
      continue;
    }
    const r = buildOne(e, s, input);
    if (typeof r === 'string') problems.push(r);
    else candidates.push(r);
  }
  candidates.sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  dropped.sort((a, b) => (a.id < b.id ? -1 : 1));
  return { candidates, dropped, problems };
}

