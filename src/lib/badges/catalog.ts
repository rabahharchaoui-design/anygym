// The M18 badges (docs/finish-celebration.md, Badges; public/art-manifest.json sets.m18). Each id is
// the art's slug, so a stored badge finds its file with no mapping. Tiered badges are one family
// with three ids (-t1, -t2, -t3), each earned on its own and stored on its own. Pure data.
// The 6 future run and gym badges (sets.future_run_and_gym) are not here on purpose: never in M18.

export const SINGLE_BADGES = ['first-workout', 'streak-3', 'streak-7', 'streak-30', 'week-complete', 'new-pr', 'early-bird', 'night-owl', 'new-city', 'comeback'] as const;
export const TIER_BADGES = ['workouts-t1', 'workouts-t2', 'workouts-t3', 'lifted-t1', 'lifted-t2', 'lifted-t3'] as const;
export const BADGE_IDS = [...SINGLE_BADGES, ...TIER_BADGES] as const;

export type BadgeId = (typeof BADGE_IDS)[number];
export type BadgeFamilyId = 'workouts' | 'lifted';

export const isBadgeId = (v: unknown): v is BadgeId => typeof v === 'string' && (BADGE_IDS as readonly string[]).includes(v);

/**
 * Streak badges count WEEKS in a row hitting the weekly goal (SPEC 17 wins over the doc's day
 * count: "never daily streaks that punish rest days"). The numbers are the art's slugs.
 */
export const STREAK_WEEKS: Readonly<Record<'streak-3' | 'streak-7' | 'streak-30', number>> = { 'streak-3': 3, 'streak-7': 7, 'streak-30': 30 };

export type Tier = { id: BadgeId; family: BadgeFamilyId; tier: 1 | 2 | 3; target: number };

/** Finished workouts logged in this app (imported ones are not counted: their split per lift would inflate it). */
export const WORKOUT_TIERS: readonly Tier[] = [
  { id: 'workouts-t1', family: 'workouts', tier: 1, target: 10 },
  { id: 'workouts-t2', family: 'workouts', tier: 2, target: 50 },
  { id: 'workouts-t3', family: 'workouts', tier: 3, target: 100 },
];

/** Total lifted in lb over those workouts' working sets: 1k, 10k, 100k lb. */
export const LIFTED_TIERS: readonly Tier[] = [
  { id: 'lifted-t1', family: 'lifted', tier: 1, target: 1_000 },
  { id: 'lifted-t2', family: 'lifted', tier: 2, target: 10_000 },
  { id: 'lifted-t3', family: 'lifted', tier: 3, target: 100_000 },
];

export const TIERS: readonly Tier[] = [...WORKOUT_TIERS, ...LIFTED_TIERS];
