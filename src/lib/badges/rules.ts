// Which badges a finished workout earns (PLAN M18a, docs/finish-celebration.md Badges). Pure: facts
// in, badge ids out. A badge the app is not sure of is never produced (no bad data): every rule
// needs this workout to count (finished here, a working set) and reads only saved facts.
// Whether it is NEW (never awarded twice) is award.ts; storing it is db/badges.ts.
import { add } from '../load';
import { clockOf, countsAsWorkout, isComeback, weekCount, weekStreak, type WorkoutFact } from '../streak';
import { BADGE_IDS, LIFTED_TIERS, STREAK_WEEKS, WORKOUT_TIERS, type BadgeId } from './catalog';

/** A saved run, only what new-city reads (a run's city is the passport's too). */
export type RunCity = { city?: string; startedAt: number; endedAt?: number };

export type BadgeFacts = {
  /** The workout just saved. */
  workout: WorkoutFact;
  /** Every saved workout, this one included (imported ones too; the rules skip what cannot count). */
  workouts: readonly WorkoutFact[];
  /** Every saved run, for new-city. */
  runs: readonly RunCity[];
  /** New records this workout set (db/history.ts finishedWins, the live "New best" rule). */
  prs: number;
  /** The weekly goal (lib/streak weeklyGoal: the plan's, or 3). */
  goal: number;
};

const cityKey = (c: string | undefined): string => c?.trim() ?? '';

/** The first workout in a city: no earlier workout or finished run has the same town. */
function newCity(f: BadgeFacts): boolean {
  const city = cityKey(f.workout.city);
  if (!city) return false;
  const at = f.workout.startedAt;
  const workedHere = f.workouts.some((w) => w.id !== f.workout.id && countsAsWorkout(w) && cityKey(w.city) === city && w.startedAt < at);
  const ranHere = f.runs.some((r) => r.endedAt !== undefined && cityKey(r.city) === city && r.startedAt < at);
  return !workedHere && !ranHere;
}

/** Every badge this workout qualifies for at its save, in catalog order (owned ones included). */
export function earnedBy(f: BadgeFacts): BadgeId[] {
  const w = f.workout;
  if (!countsAsWorkout(w)) return [];
  // Only workouts up to this one: a later one (a restore, another tab) never earns this one anything.
  const upTo = f.workouts.filter((x) => countsAsWorkout(x) && (x.id === w.id || x.startedAt <= w.startedAt));
  const mine = upTo.some((x) => x.id === w.id) ? upTo : [...upTo, w];
  const out = new Set<BadgeId>();
  if (mine.length === 1) out.add('first-workout');
  const streak = weekStreak(mine, w.startedAt, f.goal);
  for (const [id, weeks] of Object.entries(STREAK_WEEKS)) if (streak >= weeks) out.add(id as BadgeId);
  if (weekCount(mine, w.startedAt, f.goal).complete) out.add('week-complete');
  if (f.prs > 0) out.add('new-pr');
  const clock = clockOf(w);
  if (clock === 'early') out.add('early-bird');
  if (clock === 'night') out.add('night-owl');
  if (newCity(f)) out.add('new-city');
  if (isComeback(w, mine)) out.add('comeback');
  for (const t of WORKOUT_TIERS) if (mine.length >= t.target) out.add(t.id);
  const lifted = add(...mine.map((x) => x.liftedLb));
  for (const t of LIFTED_TIERS) if (lifted >= t.target) out.add(t.id);
  return BADGE_IDS.filter((id) => out.has(id));
}
