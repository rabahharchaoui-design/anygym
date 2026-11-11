// The why notes on exercise cards (PLAN 3.5f): every line a card shows comes from the curated list
// in data/coach-facts.json (src/data/coachFacts.ts binds it). Pure: this file only picks the fact
// that is true of where a move sits in its workout, and fills the fact's {words} from the card's
// own sure data (its name, the muscle it trains, the move it follows or stands in for). No note is
// ever written here.
import type { Pattern } from './swap';
import { type Profile, isCompound, liftWord, muscleWord } from './order';

// 'next': Up next's reason (lib/upNext.ts); 'idea': an idea card's line where no logged rest says more (lib/quickFocus.ts).
export const FACT_ROLES = ['first', 'angle', 'compound', 'finish', 'isolation', 'late', 'pair', 'circuit', 'hold', 'swap', 'close', 'standin', 'about', 'other', 'next', 'idea'] as const;
/** Where a move sits: the day's first big lift, a second angle, the finish of a big lift, one of a pair... */
export type FactRole = (typeof FACT_ROLES)[number];

export type CoachFact = {
  id: string;
  role: FactRole;
  /** Only for these movement patterns (none: any). */
  patterns?: Pattern[];
  /** The card face: one short plain line. */
  line: string;
  /** Behind the info button: two sentences. */
  more: string;
};
export type FactFile = { version: number; about?: string; facts: CoachFact[] };

export const FACT_WORDS = ['name', 'muscle', 'lift', 'from', 'partner', 'reason'] as const;
export type FactWords = Partial<Record<(typeof FACT_WORDS)[number], string>>;

/** The words a role always has (roleAt fills them); every other word may be missing. */
const SURE_WORDS: Record<FactRole, readonly string[]> = { first: [], angle: [], compound: [], finish: ['muscle', 'lift'], isolation: [], late: [], pair: ['partner'], circuit: [], hold: [], swap: ['from'], close: ['from'], standin: ['from', 'reason'], about: [], other: [], next: [], idea: [] };

/** A card's note: the fact it came from and its two texts, words filled in. */
export type Note = { fact: string; why: string; more: string };

const wordsIn = (text: string): string[] => [...text.matchAll(/\{(\w+)\}/g)].map((m) => m[1]!);
export const fill = (text: string, words: FactWords): string => text.replace(/\{(\w+)\}/g, (_, k: string) => words[k as keyof FactWords] ?? '');

/** Words a training note never uses: nothing medical, no promise about the body (SPEC 14: never medical advice). */
const MEDICAL = /\b(injur\w*|pain\w*|heal\w*|cure\w*|prevent\w*|treat\w*|therap\w*|doctor\w*|disease\w*|rehab\w*|diagnos\w*|medic\w*|hormone\w*|testosterone)\b/i;
/** Jargon the app never shows (SPEC 13.1). */
const JARGON = /\b(superset\w*|hypertrophy|RPE|RIR|progressive overload|volume)\b/i;

/** Everything wrong with a facts file, in words (empty: fine). */
export function validateFacts(file: FactFile, patterns: readonly string[]): string[] {
  const out: string[] = [];
  const ids = new Set<string>();
  for (const f of file.facts) {
    const at = `fact ${f.id}`;
    if (!/^[a-z]+(-[a-z]+)+$/.test(f.id)) out.push(`${at}: id must be words joined by dashes`);
    if (ids.has(f.id)) out.push(`${at}: id used twice`);
    ids.add(f.id);
    if (!(FACT_ROLES as readonly string[]).includes(f.role)) out.push(`${at}: unknown role ${f.role}`);
    for (const p of f.patterns ?? []) if (!patterns.includes(p)) out.push(`${at}: unknown pattern ${p}`);
    if (!f.line.trim() || f.line.length > 90) out.push(`${at}: the line is 1 to 90 characters`);
    if (/[.!?]$/.test(f.line.trim())) out.push(`${at}: the line has no full stop`);
    const sentences = f.more.split(/(?<=[.!?])\s+/).filter(Boolean);
    if (sentences.length !== 2) out.push(`${at}: more is exactly two sentences`);
    for (const text of [f.line, f.more]) {
      for (const w of wordsIn(text)) if (!(FACT_WORDS as readonly string[]).includes(w)) out.push(`${at}: unknown word {${w}}`);
      if (MEDICAL.test(text)) out.push(`${at}: medical wording`);
      if (JARGON.test(text)) out.push(`${at}: jargon`);
      if (/["“”]/.test(text)) out.push(`${at}: no quotes`);
    }
    for (const w of wordsIn(f.more)) if (!wordsIn(f.line).includes(w)) out.push(`${at}: more uses {${w}} the line does not`);
  }
  // Every role has a fact for any pattern that needs only the words that role always has, so every card always gets one.
  for (const role of FACT_ROLES) {
    const sure = new Set<string>(['name', ...SURE_WORDS[role]]);
    if (!file.facts.some((f) => f.role === role && !f.patterns && wordsIn(f.line).every((w) => sure.has(w)))) out.push(`role ${role}: no plain fact`);
  }
  return out;
}

/**
 * The fact for a role: the first one written for this pattern whose words the card has, else the
 * first for any pattern. Always one (validateFacts: every role has a plain fact).
 */
export function pickFact(facts: readonly CoachFact[], role: FactRole, pattern: Pattern | null, words: FactWords): CoachFact {
  const can = (f: CoachFact) => f.role === role && wordsIn(f.line).every((w) => !!words[w as keyof FactWords]);
  const fact = facts.find((f) => can(f) && !!pattern && !!f.patterns?.includes(pattern)) ?? facts.find((f) => can(f) && !f.patterns) ?? facts.find((f) => f.role === 'other' && wordsIn(f.line).length === 0);
  if (!fact) throw new Error(`No coach fact for ${role}`);
  return fact;
}

export const noteOf = (fact: CoachFact, words: FactWords): Note => ({ fact: fact.id, why: fill(fact.line, words), more: fill(fact.more, words) });

/**
 * A fact chosen by its id (Up next's reasons, an idea card's line): the claim is the file's own
 * sentence, only the names in {braces} are filled in. A missing id or word is a bug, never a made up line.
 */
export function noteById(facts: readonly CoachFact[], id: string, words: FactWords = {}): Note {
  const fact = facts.find((f) => f.id === id);
  if (!fact) throw new Error(`No coach fact ${id}`);
  const missing = wordsIn(fact.line).filter((w) => !words[w as keyof FactWords]);
  if (missing.length) throw new Error(`Coach fact ${id} needs {${missing.join('}, {')}}`);
  return noteOf(fact, words);
}

/** One move of a workout, as the notes read it. */
export type NoteItem = {
  profile: Profile;
  /** Items sharing a group are done back to back. */
  group?: number;
  /** A hold, counted in seconds. */
  timed?: boolean;
  /** The person swapped it in for this move (by name); `close`: not the same movement pattern. */
  swappedFor?: { from: string; close?: boolean };
  /** A plan move the gym or the person's answers replaced: what it stands in for, and why. */
  standsIn?: { from: string; reason: string };
};

const firstWord = (p: Profile): string | undefined => (p.targets[0] ? muscleWord(p.targets[0]) : undefined);

/** Where item `i` sits in its workout, and the words its fact may use. */
export function roleAt(items: readonly NoteItem[], i: number): { role: FactRole; words: FactWords } {
  const it = items[i]!;
  const p = it.profile;
  const muscle = firstWord(p);
  const words: FactWords = { name: p.name, ...(muscle ? { muscle } : {}) };
  if (it.swappedFor) return { role: it.swappedFor.close ? 'close' : 'swap', words: { ...words, from: it.swappedFor.from } };
  if (it.standsIn) return { role: 'standin', words: { ...words, from: it.standsIn.from, reason: it.standsIn.reason } };
  if (p.role !== 'lift') return { role: 'other', words };
  if (i === 0 && isCompound(p) && (it.group === undefined || items.filter((x) => x.group === it.group).length < 3)) return { role: 'first', words };
  if (it.group !== undefined) {
    const mates = items.filter((x) => x !== it && x.group === it.group);
    if (mates.length >= 2) return { role: 'circuit', words };
    if (mates.length === 1) return { role: 'pair', words: { ...words, partner: mates[0]!.profile.name } };
  }
  if (it.timed) return { role: 'hold', words };
  const before = items.slice(0, i).map((x) => x.profile);
  if (isCompound(p)) return { role: before.some((q) => isCompound(q) && q.targets.some((m) => p.targets.includes(m))) ? 'angle' : 'compound', words };
  if (p.tier >= 3) return { role: 'late', words };
  const anchor = before.find((q) => isCompound(q) && p.targets.some((m) => q.targets.includes(m) || q.helpers.includes(m)));
  if (anchor) {
    const shared = p.targets.find((m) => anchor.targets.includes(m) || anchor.helpers.includes(m))!;
    return { role: 'finish', words: { ...words, muscle: muscleWord(shared), lift: liftWord(anchor) } };
  }
  return { role: 'isolation', words };
}

/** The note of every move of a workout, in order: each one a fact from the file. */
export function notesFor(facts: readonly CoachFact[], items: readonly NoteItem[]): Note[] {
  return items.map((it, i) => {
    const { role, words } = roleAt(items, i);
    return noteOf(pickFact(facts, role, it.profile.pattern, words), words);
  });
}

/** What a move is, on its own (the intake's and Replace's cards): its pattern's "about" fact. */
export function aboutNote(facts: readonly CoachFact[], p: Pick<Profile, 'name' | 'pattern'>): Note {
  const words: FactWords = { name: p.name };
  return noteOf(pickFact(facts, 'about', p.pattern, words), words);
}

/** Replace's cards: the same movement as the one it would stand in for (or the closest the gym has). */
export function swapNote(facts: readonly CoachFact[], p: Pick<Profile, 'name' | 'pattern'>, from: string, close = false): Note {
  const words: FactWords = { name: p.name, from };
  return noteOf(pickFact(facts, close ? 'close' : 'swap', p.pattern, words), words);
}
