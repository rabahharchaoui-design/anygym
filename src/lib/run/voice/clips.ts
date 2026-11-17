// The voice pack's clip list (PLAN 4.4, SPEC 12.4): every recorded clip, its id and the words it
// says. The one source: scripts/make-voice-pack.mjs records exactly this list, the composer
// (compose.ts) only ever names ids from it, and a test checks both against the shipped manifest.
// Pure, and plain enough for Node to run as it is (the generator imports this file).

export type ClipDef = {
  id: string;
  /** The words handed to the voice. */
  text: string;
  /** A lone word is recorded a little faster: said alone, a word comes out slower than in a sentence. */
  kind: 'word' | 'phrase';
};

const ONES = ['zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten', 'eleven', 'twelve', 'thirteen', 'fourteen', 'fifteen', 'sixteen', 'seventeen', 'eighteen', 'nineteen'];
const TENS = ['', '', 'twenty', 'thirty', 'forty', 'fifty', 'sixty', 'seventy', 'eighty', 'ninety'];

/** 0 to 99 in words ("forty two"). */
export function numberWords(n: number): string {
  if (n < 20) return ONES[n]!;
  const ones = n % 10;
  return ones === 0 ? TENS[Math.floor(n / 10)]! : `${TENS[Math.floor(n / 10)]} ${ONES[ones]}`;
}

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
const range = (from: number, to: number) => Array.from({ length: to - from + 1 }, (_, i) => from + i);

/** The fixed phrases, by id. Interval block names are recorded words, so a custom block is spoken by the same voice. */
export const PHRASES = {
  pace: 'Pace',
  point: 'point',
  mile: 'mile.',
  miles: 'miles.',
  kilometer: 'kilometer.',
  kilometers: 'kilometers.',
  hour: 'hour,',
  hours: 'hours,',
  hundred: 'hundred',
  per_mile: 'per mile.',
  per_kilometer: 'per kilometer.',
  run: 'Run.',
  walk: 'Walk.',
  hard: 'Hard.',
  easy: 'Easy.',
  jog: 'Jog.',
  sprint: 'Sprint.',
  rest: 'Rest.',
  last_one: 'Last one.',
  intervals_done: 'Intervals done. Keep going as long as you like.',
  run_started: 'Run started.',
  paused: 'Run paused.',
  resumed: 'Run resumed.',
  auto_paused: 'Auto paused.',
  run_finished: 'Run finished.',
  halfway: 'Halfway.',
  goal_reached: 'Goal reached.',
  // SPEC 12.5 words this cue exactly; 4.5 plays it.
  turn_around: 'Turn around.',
} as const;

export type PhraseId = keyof typeof PHRASES;

const WORD_IDS: ReadonlySet<string> = new Set(['pace', 'point', 'mile', 'miles', 'kilometer', 'kilometers', 'hour', 'hours', 'hundred']);

/** Every clip of the pack, in a fixed order. */
export const CLIPS: readonly ClipDef[] = [
  // 0 to 59, then the tens: with "hundred" they say any whole number up to 999.
  ...range(0, 59).map((n): ClipDef => ({ id: `n${n}`, text: cap(numberWords(n)), kind: 'word' })),
  ...[60, 70, 80, 90].map((n): ClipDef => ({ id: `n${n}`, text: cap(numberWords(n)), kind: 'word' })),
  // A pace's seconds under ten: "nine oh five".
  ...range(1, 9).map((n): ClipDef => ({ id: `oh${n}`, text: `oh ${numberWords(n)}.`, kind: 'word' })),
  // Times are whole clips ("Nine minutes," "twelve seconds."), so a time sounds like speech, not a list.
  ...range(1, 59).map((n): ClipDef => ({ id: `min${n}`, text: `${cap(numberWords(n))} ${n === 1 ? 'minute' : 'minutes'},`, kind: 'phrase' })),
  ...range(0, 59).map((n): ClipDef => ({ id: `sec${n}`, text: `${cap(numberWords(n))} ${n === 1 ? 'second' : 'seconds'}.`, kind: 'phrase' })),
  ...Object.entries(PHRASES).map(([id, text]): ClipDef => ({ id, text, kind: WORD_IDS.has(id) ? 'word' : 'phrase' })),
];

export const CLIP_IDS: ReadonlySet<string> = new Set(CLIPS.map((c) => c.id));

/** Where the clips are served from, under the app's base path. */
export const VOICE_DIR = 'voice';
export const clipFile = (id: string): string => `${id}.m4a`;
