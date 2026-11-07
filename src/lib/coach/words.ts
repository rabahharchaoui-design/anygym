// The coach's words (SPEC 13.1, SPEC 6): plain, and never the internal strength estimate.

/** Words the coach must never show: SPEC 6 says no estimated 1 rep max is ever shown. */
export const HIDDEN_WORDS = /\b(e?1\s?rm|one rep max|estimat\w*|rpe|rir)\b/i;

/** True when a line is fit to show (no internal estimate, no jargon). */
export const showable = (line: string): boolean => !HIDDEN_WORDS.test(line);

/** First timers (SPEC 15): no fake numbers, a light test set first. */
export const START_LIGHT = "Start light: 10 easy reps, then we'll set your number";
/** Reps of the test set. */
export const TEST_SET_REPS = 10;

/** After the test set: the number for the rest of the sets. */
export const yourNumber = (weight: string): string => `Your number: ${weight} for the rest of your sets`;
/** After the test set, when the same weight is the right one. */
export const KEEP_NUMBER = 'Your number: keep this weight for the rest of your sets';

export const AUTO_LEVEL_UP_HINT =
  'When you hit all your reps on a lift for a week, AnyGym adds a little weight for next week on its own (about 5% on big leg lifts, 2.5 to 5% on upper body, more reps first on small exercises). You can always change any weight.';
