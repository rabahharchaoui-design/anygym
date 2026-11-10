// The builder's cross check rules (PLAN 3.5e). The first reference is always the source's own fields
// (equipment, primary and secondary muscles); the second is ours, written here once:
//   gear     the implement words in the name (a "Dumbbell" press needs dumbbells, "Incline" needs an
//            adjustable bench) and the source's equipment field must both be met by the gear we require;
//   muscles  the movement pattern's main muscles (a squat works quads or glutes, a curl the biceps) must
//            include one of the source's primary muscles: the standard anatomy of the movement;
//   shoulders the source only says "shoulders": a press is front delts, a raise to the side the side
//            delts, a row or reverse fly the rear delts (the same rules data/muscle-overrides.json uses).
// Anything the rules cannot decide is an error the curation must answer: never a guess.
import type { EquipmentId } from '../../db/types';
import type { ExerciseLoadType } from '../loadTypeRule';
import type { ShoulderPart } from '../muscles';
import type { CandidateGroup, SourceExercise } from './types';

/** The gear the source's equipment field means, and how it is loaded. null: the curation must say. */
export function sourceGear(equipment: string | null, name: string): { requires: EquipmentId[][]; load: ExerciseLoadType } | null {
  const oneArm = /\b(one|single)[\s_-]?arm\b/i.test(name.replace(/_/g, ' '));
  switch (equipment) {
    case 'barbell':
      return { requires: [['barbell_rack']], load: 'barbell' };
    case 'dumbbell':
      return { requires: [['dumbbells']], load: oneArm ? 'single' : 'dumbbell_each' };
    case 'cable':
      return { requires: [['cable_station']], load: 'stack' };
    case 'kettlebells':
      return { requires: [['kettlebells']], load: 'single' };
    case 'bands':
      return { requires: [['resistance_bands']], load: 'bodyweight' };
    case 'e-z curl bar':
      return { requires: [['ez_curl_bar']], load: 'barbell' };
    case 'body only':
    case null:
      return { requires: [], load: 'bodyweight' };
    default:
      return null; // machine, other: the curation names the exact gear
  }
}

/** Which equipment ids satisfy the source's equipment field (a Smith or EZ bar is a barbell too). */
const SOURCE_COVERS: Record<string, readonly EquipmentId[] | 'any'> = {
  barbell: ['barbell_rack', 'smith_machine', 'ez_curl_bar'],
  dumbbell: ['dumbbells'],
  cable: ['cable_station', 'lat_pulldown', 'seated_row'],
  kettlebells: ['kettlebells'],
  bands: ['resistance_bands'],
  'e-z curl bar': ['ez_curl_bar'],
  machine: ['smith_machine', 'shoulder_press_machine', 'chest_press_machine', 'treadmill', 'bike', 'rower', 'stair_climber', 'lat_pulldown', 'seated_row', 'leg_press'],
  other: 'any',
  'body only': 'any',
};

/** Implement words in a name and the gear that meets each (any of). */
const NAME_WORDS: ReadonlyArray<[RegExp, readonly EquipmentId[]]> = [
  [/\bbarbell\b|(?<!v-)\bbar\b/i, ['barbell_rack', 'smith_machine', 'ez_curl_bar']],
  [/\bdumbbells?\b|\bdb\b/i, ['dumbbells']],
  [/\bkettlebells?\b/i, ['kettlebells']],
  [/\bcable\b|\bpulley\b/i, ['cable_station', 'lat_pulldown', 'seated_row']],
  [/\bbands?\b/i, ['resistance_bands']],
  [/\bsmith\b/i, ['smith_machine']],
  [/\bez\b/i, ['ez_curl_bar']],
  [/\bpulldown\b/i, ['lat_pulldown', 'cable_station']],
  [/\bincline\b(?![\s-]+push)/i, ['adjustable_bench']],
  [/\bbench\b|\bincline[\s-]+push/i, ['flat_bench', 'adjustable_bench']],
  [/\btreadmill\b/i, ['treadmill']],
  [/\bbicycling\b|\bbike\b/i, ['bike']],
  [/\browing\b/i, ['rower']],
  [/\bstairmaster\b/i, ['stair_climber']],
  [/\bparallel bars\b|\bdips?\b/i, ['dip_station']],
  [/\bpull[\s-]?ups?\b|\bchin[\s-]?ups?\b|\bhang\b/i, ['pull_up_bar']],
];

const words = (id: string) => id.replace(/_/g, ' ');

/** Gear problems, or the plain words of how it was checked. */
export function checkGear(s: SourceExercise, requires: EquipmentId[][]): { ok: true; how: string } | { ok: false; problem: string } {
  const all = new Set(requires.flat());
  const covers = SOURCE_COVERS[s.equipment ?? 'body only'];
  if (!covers) return { ok: false, problem: `${s.id}: source equipment ${s.equipment} has no rule` };
  if (covers !== 'any' && !covers.some((id) => all.has(id))) return { ok: false, problem: `${s.id}: source says ${s.equipment}, our gear ${[...all].join(', ') || 'none'}` };
  const met: string[] = [];
  for (const [re, gear] of NAME_WORDS) {
    // "Kettlebell Hang Clean" holds a kettlebell, it does not hang from a bar.
    if (re.source.includes('hang') && /\bclean\b/i.test(words(s.id))) continue;
    const m = re.exec(words(s.id));
    if (!m) continue;
    if (!gear.some((id) => all.has(id))) return { ok: false, problem: `${s.id}: the name says "${m[0]}" but our gear has none of ${gear.join('/')}` };
    met.push(m[0].toLowerCase());
  }
  const named = met.length ? `the name's ${[...new Set(met)].join(', ')}` : 'no implement word in the name';
  return { ok: true, how: `Source equipment "${s.equipment ?? 'none'}" and ${named} are both met by our gear` };
}

/** The main muscles of each group (the standard anatomy of the movement); [] means any. */
export const GROUP_MUSCLES: Record<CandidateGroup, readonly string[]> = {
  squat: ['quadriceps', 'glutes'],
  hinge: ['hamstrings', 'glutes', 'lower back'],
  lunge: ['quadriceps', 'glutes', 'hamstrings'],
  'horizontal push': ['chest', 'triceps', 'shoulders'],
  'vertical push': ['shoulders', 'triceps'],
  'horizontal pull': ['middle back', 'lats', 'shoulders'],
  'vertical pull': ['lats', 'middle back'],
  'chest isolation': ['chest'],
  'lateral delt': ['shoulders'],
  'rear delt': ['shoulders'],
  biceps: ['biceps'],
  triceps: ['triceps'],
  'quads isolation': ['quadriceps'],
  'hamstrings isolation': ['hamstrings'],
  glutes: ['glutes', 'abductors', 'hamstrings'],
  calves: ['calves'],
  core: ['abdominals', 'obliques', 'lower back'],
  accessory: ['traps', 'forearms', 'adductors', 'abductors', 'shoulders', 'neck'],
  power: [],
  cardio: [],
  mobility: [],
};

const PULLS = new Set<CandidateGroup>(['horizontal pull', 'vertical pull', 'rear delt']);
const QUIET = new Set<CandidateGroup>(['core', 'mobility', 'cardio']);

/** Which part "shoulders" means here, by the SPEC 4.5 rules; null: the curation must say. */
export function shoulderRule(s: SourceExercise, group: CandidateGroup): { part: ShoulderPart; rule: string } | null {
  const n = words(s.id).toLowerCase();
  if (/rear|reverse fl|face pull|pull apart/.test(n)) return { part: 'rear', rule: 'a rear or reverse move works the rear delts' };
  if (/lateral|laterals|upright/.test(n)) return { part: 'side', rule: 'raising the arm to the side works the side delts' };
  if (/rotation/.test(n)) return { part: 'rotator cuff', rule: 'turning the upper arm works the rotator cuff' };
  if (/front .*raise|front raise/.test(n)) return { part: 'front', rule: 'raising the arm forward works the front delts' };
  if (QUIET.has(group)) return { part: 'leave out', rule: 'the shoulders only steady the body here' };
  if (s.force === 'push') return { part: 'front', rule: 'pressing or pushing forward or overhead works the front delts' };
  if (s.force === 'pull' && PULLS.has(group)) return { part: 'rear', rule: 'rowing and pulling down bring the arm back, which the rear delts help with' };
  if (group === 'power') return { part: 'leave out', rule: 'in a jump or a clean the shoulders only steady the weight' };
  return null;
}

export const usesShoulders = (s: SourceExercise) => [...s.primaryMuscles, ...s.secondaryMuscles].includes('shoulders');
