// What the coach says on Today (SPEC 15): the single most useful recommendation right now, never
// more than one coach card at a time, and nothing at all without real data.
//
// PRIORITY (tested): welcome back > missed days > lighter week (deload) > level up (or, with Auto
// level up on, the quiet "Leveled up" card) > plateau. With no card, one Coach line may show (a
// recovery note when today's plan day works muscles trained yesterday); with nothing, nothing.
import type { Region } from '../bodyArt';
import { liftClass, weighted } from './classify';
import { nextWeight } from './increment';
import { leveledUpTitle, levelUpTitle, weeklyLevelUp, type LevelUpDecision } from './levelUp';
import { MISSED_AT, missedCardId, missedTitle, missedWorkouts } from './missed';
import { learnedScale } from './outcome';
import { WELCOME_BACK_DAYS, daysOff, deloadCardId, deloadChanges, deloadSignal, plateauOf, welcomeCardId, welcomeChanges, type Plateau } from './recovery';
import { lastPicked } from './sets';
import { weeklyRate } from './strength';
import { weekStart } from './time';
import type { ChangeRecord, Lift, PlannedChange } from './types';

export type CoachInput = {
  now: number;
  lifts: readonly Lift[];
  /** Start times of finished, dated workouts (imported history has no dates and is left out). */
  dates: readonly number[];
  changes: readonly ChangeRecord[];
  /** Cards the user already answered (dismissed, or used). */
  closed: ReadonlySet<string>;
  autoLevelUp: boolean;
  /** A workout in progress: Today shows Resume, the coach waits. */
  activeWorkout: boolean;
  /** The plan in use, for missed days. */
  plan?: { daysPerWeek: number; weekdays?: readonly string[] };
  /** Main muscles worked yesterday (logged sets) and in today's plan day, for the recovery note. */
  recovery?: { yesterday: readonly Region[]; next: readonly Region[]; nameOf: (r: Region) => string };
};

export type CoachCard =
  | { kind: 'welcome_back'; id: string; days: number; changes: PlannedChange[] }
  | { kind: 'missed_days'; id: string; missed: number; title: string }
  | { kind: 'deload'; id: string; text: string; changes: PlannedChange[] }
  | { kind: 'level_up'; id: string; title: string; decision: LevelUpDecision }
  | { kind: 'leveled_up'; id: string; title: string; weekKey: string; changes: ChangeRecord[] }
  | { kind: 'plateau'; id: string; plateau: Plateau };

export type CoachKind = CoachCard['kind'];
export const PRIORITY: readonly CoachKind[] = ['welcome_back', 'missed_days', 'deload', 'level_up', 'leveled_up', 'plateau'];

export type CoachToday = {
  card: CoachCard | null;
  /** One quiet line, only when there is no card. */
  line: string | null;
  /** Auto level up is on and last week earned raises not applied yet: apply these, then the Leveled up card shows. */
  autoApply: LevelUpDecision | null;
};

export const leveledCardId = (weekKey: string): string => `leveled:${weekKey}`;

/** Every card that could show right now, in PRIORITY order (the first one shows). */
export function candidates(input: CoachInput): { cards: CoachCard[]; autoApply: LevelUpDecision | null } {
  const { now, lifts, dates, changes, closed } = input;
  const cards: CoachCard[] = [];
  let autoApply: LevelUpDecision | null = null;
  if (input.activeWorkout || !dates.length) return { cards, autoApply };
  const open = (id: string) => !closed.has(id);
  const last = Math.max(...dates);
  const off = daysOff(dates, now) ?? 0;

  if (off >= WELCOME_BACK_DAYS) {
    const id = welcomeCardId(last);
    const list = welcomeChanges(lifts, dates, now);
    if (open(id) && list.length) cards.push({ kind: 'welcome_back', id, days: off, changes: list });
  }
  if (input.plan) {
    const missed = missedWorkouts({ last, now, weekdays: input.plan.weekdays, daysPerWeek: input.plan.daysPerWeek });
    const id = missedCardId(last);
    if (missed >= MISSED_AT && open(id)) cards.push({ kind: 'missed_days', id, missed, title: missedTitle(missed) });
  }
  if (off < WELCOME_BACK_DAYS) {
    const signal = deloadSignal(lifts, dates, changes, now);
    const id = deloadCardId(now);
    const list = signal ? deloadChanges(lifts, now) : [];
    if (signal && open(id) && list.length) cards.push({ kind: 'deload', id, text: signal.text, changes: list });
  }
  // Codex 3.8 #1: no automatic raise while the coach is asking for rest or a decision.
  const recovering = cards.length > 0 || off >= WELCOME_BACK_DAYS || (off < WELCOME_BACK_DAYS && deloadSignal(lifts, dates, changes, now) !== null);
  const decision = off < WELCOME_BACK_DAYS ? weeklyLevelUp(lifts, changes, now) : null;
  if (decision && decision.earned.length) {
    const used = changes.filter((c) => c.cardId === decision.cardId);
    const live = used.filter((c) => c.undoneAt === undefined);
    if (input.autoLevelUp) {
      if (!used.length && open(decision.cardId) && !recovering) autoApply = decision;
    } else if (!live.length && open(decision.cardId)) cards.push({ kind: 'level_up', id: decision.cardId, title: levelUpTitle(decision.earned.length), decision });
  }
  // Codex 3.8 #5: the Leveled up card comes from the stored automatic changes made this week, not from
  // whether the lifts still qualify (training them again never hides See changes and Undo).
  const autoThisWeek = changes.filter((c) => c.source === 'auto' && c.appliedAt >= weekStart(now));
  for (const week of [...new Set(autoThisWeek.map((c) => c.weekKey))]) {
    const mine = autoThisWeek.filter((c) => c.weekKey === week);
    const id = leveledCardId(week);
    const kept = mine.filter((c) => c.undoneAt === undefined).length;
    if (kept && open(id)) cards.push({ kind: 'leveled_up', id, title: leveledUpTitle(kept), weekKey: week, changes: mine });
  }
  for (const lift of [...lifts].sort((a, b) => (b.sessions[0]?.date ?? 0) - (a.sessions[0]?.date ?? 0))) {
    const p = plateauOf(lift, now);
    if (p && open(p.cardId)) {
      cards.push({ kind: 'plateau', id: p.cardId, plateau: p });
      break;
    }
  }
  cards.sort((a, b) => PRIORITY.indexOf(a.kind) - PRIORITY.indexOf(b.kind));
  return { cards, autoApply };
}

/** The one card (or none) and, without a card, the one line (or none). */
export function coachToday(input: CoachInput): CoachToday {
  const { cards, autoApply } = candidates(input);
  const card = cards[0] ?? null;
  return { card, line: card || autoApply ? null : recoveryLine(input), autoApply };
}

/** "You trained chest yesterday, and today works it again. Go a little lighter on it." or null. */
export function recoveryLine(input: Pick<CoachInput, 'recovery' | 'activeWorkout'>): string | null {
  const r = input.recovery;
  if (!r || input.activeWorkout) return null;
  const both = [...new Set(r.next.filter((x) => r.yesterday.includes(x)))];
  if (!both.length) return null;
  const names = [...new Set(both.map(r.nameOf))].slice(0, 2);
  const list = names.length === 2 ? `${names[0]} and ${names[1]}` : names[0]!;
  return `You trained ${list} yesterday, and today works ${names.length === 2 ? 'them' : 'it'} again. Go a little lighter if ${names.length === 2 ? 'they feel' : 'it feels'} tired.`;
}

/**
 * One real example for the Auto level up sheet ("Squat: 185 → 195 lb next week"), from the user's
 * own lifts: a raise last week earned, else what a raise would be on the most recent lift. null
 * when no lift can show one (say so honestly).
 */
export function autoExample(lifts: readonly Lift[], changes: readonly ChangeRecord[], now: number): PlannedChange | null {
  const earned = weeklyLevelUp(lifts, changes, now)?.earned[0];
  if (earned) return earned;
  const recent = [...lifts].filter((l) => l.setup && weighted(l.loadKind) && liftClass(l.pattern)).sort((a, b) => (b.sessions[0]?.date ?? 0) - (a.sessions[0]?.date ?? 0));
  for (const l of recent) {
    const at = lastPicked(l.sessions[0]);
    if (!at || at.unit !== l.setup!.unit) continue;
    const to = nextWeight(l.loadKind, at.value, { cls: liftClass(l.pattern)!, rate: weeklyRate(l.sessions, at.unit, now), sessions: l.sessions.length, scale: learnedScale(l, changes), easy: false }, l.setup!, at.load.added ?? 0);
    if (to === null) continue;
    return { key: l.key, exerciseId: l.exerciseId, name: l.name, loadKind: l.loadKind, unit: at.unit, from: at.value, to, reason: '', source: 'auto' };
  }
  return null;
}
