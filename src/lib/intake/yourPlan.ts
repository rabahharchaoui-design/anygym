// "Your plan" (PLAN 3.5, SPEC 14 step 14): the intake answers as the generator's input, and the plain
// words on what it built. Every word comes from what the generator really did (Applied), never from
// what the answers merely asked for. Pure.
import type { Applied, GeneratorInput } from '../generator';
import type { Pattern } from '../swap';
import { gymKitOf } from './planFit';
import { goalsOf, type IntakeAnswers } from './funnel';
import { EASY_ON, labelOf, type FocusId, type GoalId, type PlaceAnswer } from './options';
import { FINISHER_MINUTES, FOCUS_RULES } from '../generatorRules';

/** Every answer the generator uses: goals, level, days, time, equipment, focus, go easy on, loved and never, style, cardio. */
export function generatorInputOf(a: IntakeAnswers): GeneratorInput {
  const input: GeneratorInput = { goals: goalsOf(a), gym: gymKitOf(a) };
  if (a.experience) input.experience = a.experience;
  if (a.days !== undefined) input.days = a.days;
  if (a.minutes !== undefined) input.minutes = a.minutes;
  if (a.focus?.length) input.focus = a.focus;
  if (a.easyOn?.length) input.easyOn = a.easyOn;
  if (a.love?.length) input.love = a.love;
  if (a.never?.length) input.never = a.never;
  if (a.style) input.style = a.style;
  if (a.cardio) input.cardio = a.cardio;
  if (a.cardioFavorites?.length) input.cardioFavorites = a.cardioFavorites;
  if (a.place) input.place = a.place;
  return input;
}

export const GOAL_WORD: Record<GoalId, string> = {
  muscle: 'muscle',
  strength: 'strength',
  fat_loss: 'fat loss',
  tone: 'tone up',
  health: 'stay healthy',
  athletic: 'athletic',
  race: 'race',
  comeback: 'comeback',
};

/** The Main goal leads the plan (SPEC 14): the words open with it. */
const BUILT_FOR: Record<GoalId, string> = {
  muscle: 'Built to build muscle',
  strength: 'Built to get stronger',
  fat_loss: 'Built to lose fat',
  tone: 'Built to tone up',
  health: 'Built to stay healthy',
  athletic: 'Built for athletic performance',
  race: 'Built around your race training',
  comeback: 'Built to get you back into it',
};

const PLACE_WORD: Record<PlaceAnswer, string> = {
  full: 'full gym',
  mix: 'full gym days',
  hotel: 'hotel friendly',
  home: 'home friendly',
  outdoors: 'no equipment needed',
};

/** What a missing pattern is, in plain words. */
const GAP_WORD: Record<Pattern, string> = {
  squat: 'squats',
  hinge: 'hip hinges',
  lunge: 'lunges',
  'horizontal push': 'presses',
  'vertical push': 'overhead presses',
  'horizontal pull': 'rows',
  'vertical pull': 'pull ups',
  'chest isolation': 'chest flies',
  'lateral delt': 'side raises',
  'rear delt': 'rear shoulder raises',
  biceps: 'curls',
  triceps: 'triceps moves',
  'quads isolation': 'leg extensions',
  'hamstrings isolation': 'leg curls',
  glutes: 'glute moves',
  calves: 'calf raises',
  core: 'core moves',
};

export const list = (items: readonly string[]): string => (items.length < 2 ? (items[0] ?? '') : `${items.slice(0, -1).join(', ')} and ${items[items.length - 1]}`);
const capital = (t: string): string => t.charAt(0).toUpperCase() + t.slice(1);
const average = (ns: readonly number[]): number => (ns.length ? Math.round(ns.reduce((x, y) => x + y, 0) / ns.length) : 0);
const focusWord = (f: FocusId): string => (f === 'balance' ? 'balance' : FOCUS_RULES[f].word);
const short = (items: readonly string[], max = 3): string[] => (items.length > max ? [...items.slice(0, max - 1), 'more'] : [...items]);

export type YourPlanWords = {
  /** "Built to build muscle: 3 days, about 44 min, hotel friendly, extra arm work, easy on knees." */
  reason: string;
  /** "Main muscle · Also fat loss" ("(soon)" when the Also goal changed nothing). */
  goals: string | null;
  /** What it could not do, at most two short sentences, or null. */
  warning: string | null;
  minutes: number[];
};

/** The reveal's words for a generated plan: only what the generator did (SPEC 14: two lines on why it fits). */
export function yourPlanWords(applied: Applied, a: IntakeAnswers, days: number): YourPlanWords {
  const avg = average(applied.minutes);
  const parts: string[] = [`${days} days`, `about ${avg} min`];
  if (a.place) parts.push(PLACE_WORD[a.place]);
  if (applied.focus.length) parts.push(`extra ${list(applied.focus.map((f) => focusWord(f.id)))} work`);
  const easy = applied.easyOn.map((j) => (labelOf(EASY_ON, j as (typeof EASY_ON)[number]['id']) ?? j).toLowerCase());
  if (easy.length) parts.push(`easy on ${list(short(easy, 2))}`);
  if (applied.loved.length) parts.push(applied.loved.length === 1 ? 'with an exercise you love' : `with ${applied.loved.length} exercises you love`);
  if (applied.never) parts.push(applied.never === 1 ? 'without the one you never want' : `without the ${applied.never} you never want`);
  if (applied.finisher) parts.push(`a ${FINISHER_MINUTES} min ${applied.finisher.toLowerCase()} finisher`);
  const reason = `${BUILT_FOR[applied.main]}: ${parts.join(', ')}.`;

  const goals = applied.also ? `Main ${GOAL_WORD[applied.main]} · Also ${GOAL_WORD[applied.also]}${applied.alsoUsed ? '' : ' (soon)'}` : null;

  const notes: string[] = [];
  if (applied.gaps.length) notes.push(`Nothing here for ${list(short(applied.gaps.map((g) => GAP_WORD[g])))}: that takes gear you don't have.`);
  const misses: string[] = [];
  if (applied.focusMissed.length) misses.push(`extra ${list(applied.focusMissed.map(focusWord))} work`);
  if (applied.lovedMissed.length) misses.push(applied.lovedMissed.length === 1 ? 'the exercise you love' : `${applied.lovedMissed.length} exercises you love`);
  if (misses.length) notes.push(`No room for ${list(misses)} here.`);
  const timed = a.minutes !== undefined && a.minutes < 75;
  // PLAN 3.5g: the real minutes, and what to do about it (the workout offers Make it fit at the start).
  const over = applied.over && timed ? overWords(applied.minutes, a.minutes!) : null;
  if (over) notes.push(over);
  else if (applied.restKept) notes.push('Strength days keep their long rests, so this time fits fewer lifts.');
  return { reason, goals, warning: notes.length ? capital(notes.join(' ')) : null, minutes: applied.minutes };
}

/**
 * PLAN 3.5g: "Day 1 takes about 37 min, longer than your 20. Tap Make it fit when you start." The
 * days over the time picked, with their own estimates (the reveal's numbers); null when none is.
 */
const range = (ms: readonly number[]): string => (Math.min(...ms) === Math.max(...ms) ? `about ${ms[0]}` : `${Math.min(...ms)} to ${Math.max(...ms)}`);

export function overWords(minutes: readonly number[], budget: number): string | null {
  const over = minutes.map((m, i) => ({ m, day: i + 1 })).filter((x) => x.m > budget);
  if (!over.length) return null;
  const [a, b] = over;
  const days =
    over.length === 1
      ? `Day ${a!.day} takes about ${a!.m} min`
      : over.length === 2
        ? `Day ${a!.day} takes about ${a!.m} min and Day ${b!.day} about ${b!.m}`
        : `Days ${list(over.map((x) => String(x.day)))} take ${range(over.map((x) => x.m))} min`;
  return `${days}, longer than your ${budget}. Tap Make it fit when you start.`;
}

