// The hand written curation list (data/candidate-curation.json, PLAN 3.5e): one line per candidate,
// the source id and a few flags. Pure parsing, so the builder and the tests read it the same way.
import type { BarId, EquipmentId } from '../../db/types';
import type { ExerciseLoadType } from '../loadTypeRule';
import type { ShoulderPart } from '../muscles';
import type { CandidateGroup } from './types';

export interface CurationFile {
  about: string;
  groups: Record<string, string[]>;
  /** Source id → what the builder saw on the contact sheet ("ok: ..." or "drop: ..."). */
  photos: Record<string, string>;
  /** Source id → the muscles the source got wrong, written by hand after reading the move and its photos. */
  muscles?: Record<string, MuscleFix>;
}

export interface MuscleFix {
  primary: string[];
  secondary: string[];
  /** Plain words: what is wrong in the source and why this is right. */
  why: string;
}

/** Problems with the muscle fixes: an unknown muscle, no primary muscle, a missing reason or a move not listed. */
export function checkMuscleFixes(fixes: CurationFile['muscles'], known: readonly string[], listed: ReadonlySet<string>): string[] {
  const out: string[] = [];
  for (const [id, f] of Object.entries(fixes ?? {})) {
    if (!listed.has(id)) out.push(`${id}: a muscle fix for a move that is not listed`);
    if (!f.primary.length) out.push(`${id}: a muscle fix needs a primary muscle`);
    if (f.why.trim().length < 10) out.push(`${id}: a muscle fix needs its reason`);
    for (const m of [...f.primary, ...f.secondary]) if (!known.includes(m)) out.push(`${id}: unknown muscle ${m}`);
  }
  return out;
}

export interface CurationEntry {
  id: string;
  group: CandidateGroup;
  /** '+a/b' groups added to the source's default gear. */
  add: EquipmentId[][];
  /** '=a/b': this replaces the source's default gear (the name and photos say more than the source). */
  replace: EquipmentId[][];
  each: boolean;
  timed: boolean;
  reps: boolean;
  shoulders?: ShoulderPart;
  load?: ExerciseLoadType;
  bar?: BarId;
}

const SHOULDER_FLAGS: Record<string, ShoulderPart> = { front: 'front', rear: 'rear', side: 'side', cuff: 'rotator cuff', out: 'leave out' };
const BENCH: EquipmentId[] = ['flat_bench', 'adjustable_bench'];

/** One curation line, or the problem with it. */
export function parseLine(line: string, group: CandidateGroup, equipment: readonly string[], loads: readonly string[], bars: readonly string[]): CurationEntry | string {
  const [id, ...flags] = line.trim().split(/\s+/);
  if (!id) return `empty line in ${group}`;
  const e: CurationEntry = { id, group, add: [], replace: [], each: false, timed: false, reps: false };
  const gearGroup = (text: string): EquipmentId[] | string => {
    const ids = text.split('/');
    const bad = ids.find((x) => !equipment.includes(x));
    return bad ? `${id}: unknown equipment ${bad}` : (ids as EquipmentId[]);
  };
  for (const f of flags) {
    if (f === 'bench') e.add.push([...BENCH]);
    else if (f === 'incline') e.add.push(['adjustable_bench']);
    else if (f === 'each') e.each = true;
    else if (f === 'timed') e.timed = true;
    else if (f === 'reps') e.reps = true;
    else if (f.startsWith('+') || f.startsWith('=')) {
      const g = gearGroup(f.slice(1));
      if (typeof g === 'string') return g;
      (f.startsWith('+') ? e.add : e.replace).push(g);
    } else if (f.startsWith('sh:')) {
      const part = SHOULDER_FLAGS[f.slice(3)];
      if (!part) return `${id}: unknown shoulder flag ${f}`;
      e.shoulders = part;
    } else if (f.startsWith('load:')) {
      const kind = f.slice(5);
      if (!loads.includes(kind)) return `${id}: unknown load ${kind}`;
      e.load = kind as ExerciseLoadType;
    } else if (f.startsWith('bar:')) {
      const bar = f.slice(4);
      if (!bars.includes(bar)) return `${id}: unknown bar ${bar}`;
      e.bar = bar as BarId;
    } else return `${id}: unknown flag ${f}`;
  }
  if (e.timed && e.reps) return `${id}: timed and reps`;
  return e;
}

/** Every entry of the file, in file order, and every problem (unknown group, flag or a repeated id). */
export function parseCuration(file: CurationFile, groups: readonly string[], equipment: readonly string[], loads: readonly string[], bars: readonly string[]): { entries: CurationEntry[]; problems: string[] } {
  const entries: CurationEntry[] = [];
  const problems: string[] = [];
  const seen = new Set<string>();
  for (const [group, lines] of Object.entries(file.groups)) {
    if (!groups.includes(group)) {
      problems.push(`unknown group ${group}`);
      continue;
    }
    for (const line of lines) {
      const e = parseLine(line, group as CandidateGroup, equipment, loads, bars);
      if (typeof e === 'string') {
        problems.push(e);
        continue;
      }
      if (seen.has(e.id)) problems.push(`${e.id}: listed twice`);
      seen.add(e.id);
      entries.push(e);
    }
  }
  return { entries, problems };
}
