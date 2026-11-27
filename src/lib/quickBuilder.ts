// PLAN Q8: Quick's swipe builder, pure. The person picks the minutes, then swipes through single
// exercises (right Add, left Skip) and the time meter fills toward the chip. Built only from the
// pieces every Quick card already uses: the same gates (quickDepsFor: sure demo, Go easy on, the
// newer lifter rules; sure gear; the never list), the generator's own prescription (sets, reps or
// hold, rest), the one time estimate and Up next's reasons (upNextIdeas, its curated lines, no new copy).
import type { Concept, QuickDeps, QuickInput, QuickItem } from './quick';
import { quickDepsFor } from './quick';
import { contextOf } from './generator/context';
import { prescribe } from './generator/prescribe';
import type { Item } from './generator/types';
import { type Goal, type Profile, isCompound } from './order';
import { PATTERNS, type Pattern, workoutIdOf } from './swap';
import { rankSoft, sureGear } from './quickDeck';
import { FIT_SLACK, JOINT_WORD, fits, itemsOf, metaLine, quickAvoids } from './quickShow';
import { quickMinutes } from './quickStyles/estimate';
import { type UpNextContext, upNextIdeas } from './upNext';

/** One exercise card of the deck: the item Start stores (QuickItem, with its why line) and its ordering profile. */
export type BuilderCard = { item: QuickItem; profile: Profile; key: string };

export type BuilderPool = {
  /** Every exercise that passes the gates, mixed across movement patterns, fewest left swipes first. */
  cards: BuilderCard[];
  /** How many sure moves Go easy on left out (said, never hidden). */
  easedOut: number;
  /** "Going easy on your knees: 5 moves left out." when easedOut > 0. */
  easyLine?: string;
  /** Up next's context for the suggestions (goal, recent muscles, Go easy on, experience, sameAs). */
  next: UpNextContext;
};

const NONE = new Set(['none']);

/** The joints in plain words: "knees", "knees and lower back". */
function jointWords(easyOn: readonly string[] | undefined): string {
  const w = (easyOn ?? []).filter((j) => !NONE.has(j)).map((j) => JOINT_WORD[j] ?? j.replace(/_/g, ' '));
  return w.length <= 1 ? (w[0] ?? '') : `${w.slice(0, -1).join(', ')} and ${w[w.length - 1]}`;
}

/** Up next's goal word from the intake goals. */
const goalOf = (family: string): Goal => (family === 'strength' ? 'strength' : family === 'fat_loss' ? 'fat_loss' : 'muscle');

/**
 * The deck: every lift this gym surely has the gear for, with a sure demo, not on the never list,
 * not one Go easy on rules out, not a skill above the person's experience. Mixed across patterns (one
 * of each pattern, then the next of each) so shoulders, legs, abs and calves all come up early.
 */
export function builderPool(input: QuickInput, deps0: QuickDeps): BuilderPool {
  const base = input.base;
  const deps = quickDepsFor(base, deps0);
  const data = deps.data;
  const ctx = contextOf(base, deps);
  const seen = new Set<string>();
  const lanes: BuilderCard[][] = [];
  let easedOut = 0;
  for (const pattern of PATTERNS as readonly Pattern[]) {
    const lane: BuilderCard[] = [];
    for (const c of data.patterns[pattern]?.candidates ?? []) {
      const id = workoutIdOf(c);
      const key = data.sameAs(id);
      if (seen.has(key)) continue;
      const profile = deps.profile(id);
      if (profile.role !== 'lift' || ctx.neverKeys.has(key) || !sureGear(data, id, base.gym) || !deps0.usable(id)) continue;
      if (profile.advanced && base.experience !== '3y') continue;
      if (!deps.usable(id)) {
        if (quickAvoids(base.easyOn, profile)) {
          easedOut++;
          seen.add(key);
        }
        continue;
      }
      seen.add(key);
      const it: Item = { id, key, candidate: c, profile, pattern, sets: 0, extra: 0, rest: 0 };
      prescribe(ctx, it, false);
      const [item] = itemsOf(deps, [
        { id, pattern, sets: it.sets, ...(it.reps ? { reps: it.reps } : {}), ...(it.seconds ? { seconds: it.seconds } : {}), restSec: it.rest, ...(c.eachSide ? { eachSide: true as const } : {}), compound: isCompound(profile) },
      ]);
      if (item) lane.push({ item, profile, key });
    }
    if (lane.length) lanes.push(lane);
  }
  const mixed: BuilderCard[] = [];
  for (let i = 0; lanes.some((l) => i < l.length); i++) for (const l of lanes) if (l[i]) mixed.push(l[i]!);
  const byId = new Map(mixed.map((c) => [c.item.id, c]));
  const cards = rankSoft(mixed.map((c) => c.item.id), base.soft).map((id) => byId.get(id)!);
  const joints = jointWords(base.easyOn);
  return {
    cards,
    easedOut,
    ...(easedOut > 0 && joints ? { easyLine: `Going easy on your ${joints}: ${easedOut} ${easedOut === 1 ? 'move' : 'moves'} left out.` } : {}),
    next: { goal: goalOf(ctx.family), recent: input.recent, easyOn: base.easyOn, sameAs: data.sameAs, ...(base.experience ? { experience: base.experience } : {}) },
  };
}

/** One answer on the deck, in order. `from`: the deck card, or the suggestion shown after an add. */
export type BuilderStep = { kind: 'add' | 'skip'; id: string; from: 'deck' | 'suggestion' };

/** Start: hidden with nothing kept; shown once something is; the main button once the minutes are full. */
export type StartState = 'hidden' | 'ready' | 'full';

export type Suggestion = { card: BuilderCard; reason: string; fact: string };

export type BuilderView = {
  kept: QuickItem[];
  /** The estimate of what is kept (the one estimator), 0 when nothing is. */
  minutes: number;
  /** "3 exercises · ~22 min" (metaLine). */
  meta: string;
  /** The card on top of the deck (null: nothing left that fits the minutes). */
  current: BuilderCard | null;
  /** After an add from the deck: Up next's best next move that still fits, with its reason line. */
  suggestion: Suggestion | null;
  /** How many cards are left that still fit. */
  left: number;
  start: StartState;
};

/** The estimate of a list of items (0 for none). */
export const builtMinutes = (items: readonly QuickItem[]): number => (items.length ? quickMinutes(items) : 0);

/** Whether adding `next` keeps the workout within the minutes (FIT_SLACK over, at most). */
export const addFits = (items: readonly QuickItem[], next: QuickItem, budget: number): boolean => fits(quickMinutes([...items, next]), budget);

/** What the screen shows after `steps`, at `budget` minutes. Pure: Undo is dropping the last step. */
export function builderView(pool: BuilderPool, steps: readonly BuilderStep[], budget: number): BuilderView {
  const byId = new Map(pool.cards.map((c) => [c.item.id, c]));
  const answered = new Set(steps.map((s) => s.id));
  const keptCards = steps.filter((s) => s.kind === 'add').flatMap((s) => (byId.has(s.id) ? [byId.get(s.id)!] : []));
  const kept = keptCards.map((c) => c.item);
  const minutes = builtMinutes(kept);
  const deck = pool.cards.filter((c) => !answered.has(c.item.id) && addFits(kept, c.item, budget));
  const last = steps[steps.length - 1];
  let suggestion: Suggestion | null = null;
  if (last && last.kind === 'add' && last.from === 'deck' && deck.length) {
    const idea = upNextIdeas(keptCards.map((c) => c.profile), deck.map((c) => c.profile), pool.next, 0)[0];
    const card = idea ? deck.find((c) => c.item.id === idea.profile.id) : undefined;
    if (idea && card) suggestion = { card, reason: idea.reason, fact: idea.fact };
  }
  const full = kept.length > 0 && (minutes >= budget - FIT_SLACK || deck.length === 0);
  return {
    kept,
    minutes,
    meta: metaLine(kept, minutes),
    current: suggestion ? null : (deck[0] ?? null),
    suggestion,
    left: deck.length,
    start: kept.length === 0 ? 'hidden' : full ? 'full' : 'ready',
  };
}

/** The concept Start stores (startBuilt): a non plan Quick workout, so the plan never moves on (M19a). */
export const builtConcept = (view: Pick<BuilderView, 'kept'>): Pick<Concept, 'items'> & { id: 'focus'; variant: 'custom' } => ({ id: 'focus', variant: 'custom', items: view.kept });
