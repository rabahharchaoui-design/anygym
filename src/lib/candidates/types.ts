// Candidate moves (PLAN 3.5e): exercises from the source data that are not in the sure catalog yet.
// Types only, shared by the builder (scripts/build-candidates.ts), the gate, the review queue and
// the coverage report. A candidate is never used anywhere until G approves it (src/data/candidateGate.ts).
import type { BarId, EquipmentId } from '../../db/types';
import type { Region } from '../bodyArt';
import type { ExerciseLoadType } from '../loadTypeRule';
import type { MuscleOverride } from '../muscles';
import type { Pattern, Requires } from '../swap';

/** Groups outside the 17 swap ladders: shown in the review and the coverage report only. */
export const EXTRA_GROUPS = ['cardio', 'mobility', 'power', 'accessory'] as const;
export type ExtraGroup = (typeof EXTRA_GROUPS)[number];
export type CandidateGroup = Pattern | ExtraGroup;

export const STYLES = ['strength', 'hypertrophy', 'mobility', 'plyometrics', 'cardio', 'core', 'bodyweight', 'bands', 'kettlebell'] as const;
export type Style = (typeof STYLES)[number];

/** One upstream record (yuhonas/free-exercise-db dist/exercises.json), as the builder reads it. */
export interface SourceExercise {
  id: string;
  name: string;
  force: string | null;
  level: string;
  mechanic: string | null;
  equipment: string | null;
  primaryMuscles: string[];
  secondaryMuscles: string[];
  instructions: string[];
  category: string;
  images: string[];
}

/** How the builder cross checked one thing against two references. */
export interface Check {
  /** What the source data says. */
  source: string;
  /** What our own rules say (the second reference). */
  ours: string;
  /** Both agree. A candidate is only written when they do. */
  agree: true;
  how: string;
}

export interface PhotoCheck {
  /** contact-sheet: both photos seen at thumbnail size by the builder; not-viewed: only G's review checks them. */
  confidence: 'contact-sheet' | 'not-viewed';
  note: string;
}

export interface CandidateRecord {
  id: string;
  name: string;
  /** The source's own fields, kept for audits. */
  equipment: string | null;
  category: string;
  level: string;
  force: string | null;
  mechanic: string | null;
  pattern: CandidateGroup;
  /** True for the 17 ladder patterns: once approved it joins that swap ladder (last, behind the sure moves). */
  ladder: boolean;
  /** The first is the main style. */
  styles: Style[];
  requires: Requires;
  load: ExerciseLoadType;
  bar?: BarId;
  eachSide?: true;
  timed?: true;
  primaryMuscles: string[];
  secondaryMuscles: string[];
  /** The shoulder part (SPEC 4.5), same shape as data/muscle-overrides.json. */
  muscleOverride?: MuscleOverride;
  regions: { primary: Region[]; secondary: Region[] };
  /** The map's text line ("Chest, triceps · Front delts"). */
  muscleText: string;
  instructions: string[];
  /** WebP only (every iPhone the app supports shows WebP); jpg points at the same files. */
  images: { webp: [string, string]; jpg: [string, string] };
  checks: { gear: Check; muscles: Check; pattern: Check; photo: PhotoCheck };
  confidence: 'high' | 'medium';
  status: 'candidate';
}

export interface CandidateFile {
  about: string;
  source: { repo: string; sha: string; license: string };
  candidates: CandidateRecord[];
}

export type { EquipmentId };
