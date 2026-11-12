// Achievement badge families (PLAN 3.6h), pure: which medal shape a family gets, how a milestone
// reads, and the name a screen reader hears. No achievements logic here (Session 5 decides who has
// earned what); a caller hands a badge its real name and number.
import type { MomentKind } from '../celebrate/types';

export const BADGE_FAMILIES = ['first_workout', 'streak', 'pr', 'milestone', 'first_run', 'new_city', 'level'] as const;
export type BadgeFamily = (typeof BADGE_FAMILIES)[number];

/** The silhouette of the medal. One per family, so a family is known by its outline alone. */
export type BadgeShape = 'round' | 'flame' | 'hex' | 'seal' | 'diamond' | 'pin' | 'shield';

export const FAMILY_SHAPE: Record<BadgeFamily, BadgeShape> = {
  first_workout: 'round',
  streak: 'flame',
  pr: 'hex',
  milestone: 'seal',
  first_run: 'diamond',
  new_city: 'pin',
  level: 'shield',
};

export const shapeOf = (family: BadgeFamily): BadgeShape => FAMILY_SHAPE[family];

/** The workout counts that earn a milestone medal. */
export const MILESTONES = [10, 25, 50, 100] as const;

/** How many studs a milestone medal carries: 1 for 10 workouts up to 4 for 100 (0 below the first). */
export function milestoneStuds(count: number): number {
  return MILESTONES.filter((m) => count >= m).length;
}

/** The size of the number inside the medal, in the medal's 100 unit box: shorter numbers are larger. */
export function numberSize(text: string): number {
  const n = text.length;
  return n <= 1 ? 30 : n === 2 ? 26 : n === 3 ? 20 : n === 4 ? 16 : 13;
}

/** What a screen reader says: the name, the number when there is one, and "locked" when not yet earned. */
export function badgeLabel(b: { name: string; value?: string | number; locked?: boolean }): string {
  const value = b.value === undefined || b.value === '' ? '' : `, ${b.value}`;
  return `${b.name}${value}${b.locked ? ', locked' : ''}`;
}

/** The medal a celebration moment wears (PLAN 3.6b moments): the first workout its own, records the PR medal. */
export function badgeForMoment(kind: MomentKind): BadgeFamily {
  if (kind === 'first_workout') return 'first_workout';
  if (kind === 'level_up') return 'level';
  if (kind === 'city_stamp') return 'new_city';
  return 'pr';
}
