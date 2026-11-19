// PLAN Q1 (SPEC 20.3): the six muscle groups recovery is told in, and how long each needs. The one
// place the windows are written. Pure.
import type { Muscle } from '../order';

export const RECOVERY_GROUPS = ['legs', 'back', 'chest', 'shoulders', 'arms', 'abs'] as const;
export type RecoveryGroup = (typeof RECOVERY_GROUPS)[number];

/** Every muscle of the app's list (lib/order MUSCLES) in exactly one group. */
const GROUP_OF: Readonly<Record<Muscle, RecoveryGroup>> = {
  quads: 'legs',
  glutes: 'legs',
  hamstrings: 'legs',
  adductors: 'legs',
  abductors: 'legs',
  calves: 'legs',
  'lower back': 'back',
  back: 'back',
  traps: 'back',
  chest: 'chest',
  'front delts': 'shoulders',
  'side delts': 'shoulders',
  'rear delts': 'shoulders',
  biceps: 'arms',
  triceps: 'arms',
  forearms: 'arms',
  abs: 'abs',
};

export const groupOf = (m: Muscle): RecoveryGroup => GROUP_OF[m];

const HOUR_MS = 3_600_000;

/** SPEC 20.3: 48 h for legs, back and chest; 24 h for shoulders, arms and abs. */
export const RECOVERY_HOURS: Readonly<Record<RecoveryGroup, number>> = { legs: 48, back: 48, chest: 48, shoulders: 24, arms: 24, abs: 24 };

export const windowMs = (g: RecoveryGroup): number => RECOVERY_HOURS[g] * HOUR_MS;
