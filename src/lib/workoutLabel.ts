// PLAN HT1 (Nov 27): a Quick workout is named for what was logged, never for the card it
// started from: "Quick · Back + Shoulders". The groups are the six recovery groups (src/lib/recovery),
// counted from logged working sets by primary muscle, the same proving sets recovery reads. Pure.
import { RECOVERY_GROUPS, TRAINED_MIN_SETS, groupOf, type LoggedWorkout, type RecoveryGroup } from './recovery';

export const QUICK_FALLBACK = 'Quick workout';
/** A workout with this many groups trained (TRAINED_MIN_SETS sets each) is full body. */
export const FULL_BODY_GROUPS = 4;
/** At most this many groups are named. */
export const MAX_NAMED_GROUPS = 3;

const WORD: Readonly<Record<RecoveryGroup, string>> = { legs: 'Legs', back: 'Back', chest: 'Chest', shoulders: 'Shoulders', arms: 'Arms', abs: 'Abs' };

/** Working sets per group in the order each group was first logged (warm ups and unsure sets never count). */
export function groupSets(w: Pick<LoggedWorkout, 'sets'>): { group: RecoveryGroup; sets: number }[] {
  const out: { group: RecoveryGroup; sets: number }[] = [];
  for (const s of w.sets) {
    if (s.kind !== 'work' || s.uncertain) continue;
    for (const g of new Set(s.primary.map(groupOf))) {
      const at = out.find((x) => x.group === g);
      if (at) at.sets++;
      else out.push({ group: g, sets: 1 });
    }
  }
  return out;
}

/**
 * "Quick · Back + Shoulders": the top 1 to 3 groups by working sets (a tie goes to the one logged
 * first); "Quick · Full body" when 4 or more groups each have 3 or more sets; "Quick workout" when
 * nothing that names a group was logged.
 */
export function quickLabel(w: Pick<LoggedWorkout, 'sets'>): string {
  const groups = groupSets(w);
  if (!groups.length) return QUICK_FALLBACK;
  if (groups.filter((g) => g.sets >= TRAINED_MIN_SETS).length >= FULL_BODY_GROUPS) return 'Quick · Full body';
  const top = groups
    .map((g, i) => ({ ...g, i }))
    .sort((a, b) => b.sets - a.sets || a.i - b.i)
    .slice(0, MAX_NAMED_GROUPS);
  return `Quick · ${top.map((g) => WORD[g.group]).join(' + ')}`;
}

/** Every group word, in the app's order (for tests and screens that list them). */
export const GROUP_WORDS: readonly string[] = RECOVERY_GROUPS.map((g) => WORD[g]);
