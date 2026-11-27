// Never awarded twice (PLAN M18a): of the badges a workout qualifies for, only those not owned yet
// are new. The database write (db/badges.ts) applies the same rule inside its transaction, so a
// double Finish, a reload during Finish or a second tab can never store one twice.
import type { BadgeId } from './catalog';

/** A stored badge: its id (the art slug), when it was earned, and the workout that earned it. */
export type EarnedBadge = { id: BadgeId; earnedAt: number; sessionId: string };

/** The badges of `earned` that are not in `owned`, in the order given, each once. */
export function newBadges(earned: readonly BadgeId[], owned: Iterable<BadgeId>): BadgeId[] {
  const have = new Set(owned);
  const out: BadgeId[] = [];
  for (const id of earned) {
    if (have.has(id)) continue;
    have.add(id);
    out.push(id);
  }
  return out;
}
