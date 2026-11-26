// PLAN Q3a0 (SPEC 20.3): each of Quick's eight targets as a workout, built only from the existing
// pieces: the one area days (quickFocus.ts: Chest, Back and Leg day; the push and pull days of
// FALLBACK_RULES for Push and Pull), the Full body circuit style card and the card builder for Abs.
// Pure. No bad data: a target this gym cannot build honestly is an explicit "not available" with
// its reason, never a padded workout or a nearer day under the target's name.
import { AREA_RULES, FALLBACK_RULES, type SessionArea } from './order';
import { focusCard } from './quickFocus';
import { BUILD, chipOf, newerOf, styleCard, TARGET_TITLE, targetMenu, type QuickTargetId, type TargetEntry, type TrainTargetId } from './quickCards';
import { buildCard, densityFor, STYLES } from './quickStyles';
import { fits, gearOf, itemsOf, mainMuscles } from './quickShow';
import { QUICK_MINUTES, type Concept, type QuickDeps, type QuickInput } from './quick';
import type { Slot } from './generatorRules';
import type { LoggedWorkout } from './recovery';

/** Why a target cannot be built here. */
export type TargetMissing = 'few-moves' | 'no-fit';

export type TargetBuild =
  | { ok: true; target: QuickTargetId; builds: TrainTargetId; concept: Concept }
  | { ok: false; target: QuickTargetId; builds: TrainTargetId; reason: TargetMissing; words: string };

/** The words a target that is not available shows. */
export function missingWords(target: TrainTargetId, reason: TargetMissing, minutes: number): string {
  const what = target === 'full' ? 'a full body workout' : `a ${TARGET_TITLE[target].toLowerCase()} workout`;
  return reason === 'few-moves' ? `Not enough moves we can show you here for ${what}.` : `${TARGET_TITLE[target]} does not fit ${minutes} min here. Try another time.`;
}

/** Abs: core moves only, the card builder's own rules (sure demos and gear, the minutes). */
const ABS_SLOTS: readonly Slot[] = [{ pattern: 'core' }, { pattern: 'core', variant: true }, { pattern: 'core', variant: true }, { pattern: 'core', variant: true }, { pattern: 'core', variant: true }];
const ABS_REST = { group: 45, single: 45, floor: 30, cap: 60 };

function absCard(input: QuickInput, deps: QuickDeps): Concept | null {
  const density = densityFor(input.minutes);
  const built = buildCard({ name: 'abs', slots: ABS_SLOTS, shape: 'circuit', input: { ...input.base, noFallback: true }, want: density.max, density, maxSets: 3, rest: ABS_REST }, BUILD(deps), input.minutes);
  if (!built) return null;
  // The name is true of every move: an Abs workout holds core moves only.
  if (built.items.some((it) => deps.profile(it.id).pattern !== 'core')) return null;
  const items = itemsOf(deps, built.items);
  return {
    id: 'focus',
    variant: 'abs',
    variantLabel: 'abs',
    focus: 'Abs',
    title: TARGET_TITLE.abs,
    line: '',
    items,
    minutes: built.minutes,
    over: false,
    chip: chipOf(null, items),
    effort: 2,
    gear: gearOf(items.map((it) => it.id), deps.data, input.base.gym),
    primary: mainMuscles(items, deps),
    ...(built.short ? { short: built.short } : {}),
    ...(newerOf(input.base) ? { newer: true } : {}),
  };
}

const AREA_OF: Partial<Record<TrainTargetId, SessionArea>> = { chest: 'chest', back: 'back', legs: 'legs' };

/** One train target's workout, or null when it cannot be built honestly here. */
function buildOne(target: TrainTargetId, input: QuickInput, deps: QuickDeps): Concept | null {
  const area = AREA_OF[target];
  if (area) {
    const c = focusCard(area, input, deps);
    // A nearer day (a push day for Chest) is not the target picked: not available instead.
    return c && c.variant === area && c.title === AREA_RULES[area].title ? c : null;
  }
  if (target === 'push') return focusCard('chest', input, deps, FALLBACK_RULES.chest);
  if (target === 'pull') return focusCard('back', input, deps, FALLBACK_RULES.back);
  if (target === 'full') {
    for (const v of STYLES.circuit.variants) {
      const c = styleCard(STYLES.circuit, v, input, deps);
      if (c) return c;
    }
    return null;
  }
  return absCard(input, deps);
}

/** Why `target` was not built: another time chip would build it (no fit), or none would (too few sure moves). */
function reasonOf(target: TrainTargetId, input: QuickInput, deps: QuickDeps): TargetMissing {
  return QUICK_MINUTES.some((m) => m !== input.minutes && buildOne(target, { ...input, minutes: m }, deps)) ? 'no-fit' : 'few-moves';
}

/**
 * The workout a menu entry starts (Best for today: the target it builds), or "not available" with the
 * reason. A built workout always fits the minutes picked (an area day may be shorter: `short`).
 */
export function buildTarget(entry: Pick<TargetEntry, 'id' | 'builds'>, input: QuickInput, deps: QuickDeps): TargetBuild {
  const c = buildOne(entry.builds, input, deps);
  if (c && fits(c.minutes, input.minutes)) return { ok: true, target: entry.id, builds: entry.builds, concept: c };
  const reason = c ? 'no-fit' : reasonOf(entry.builds, input, deps);
  return { ok: false, target: entry.id, builds: entry.builds, reason, words: missingWords(entry.builds, reason, input.minutes) };
}

/** One row of the target menu with the workout it starts (or why it cannot). */
export type TargetRow = { entry: TargetEntry; build: TargetBuild };

/** The whole menu from the log, each entry with its build, in menu order (the Q3a1 screen reads this). */
export function targetRows(log: readonly LoggedWorkout[], now: number, input: QuickInput, deps: QuickDeps): TargetRow[] {
  return targetMenu(log, now).targets.map((entry) => ({ entry, build: buildTarget(entry, input, deps) }));
}
