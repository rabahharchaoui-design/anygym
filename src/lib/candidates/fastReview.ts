// The fast review (PLAN 3.5i). Pure. Two piles: the moves the pre check was unsure about ("Check
// carefully", one by one in the swipe deck, shown first) and all the others (the grid, 9 per screen,
// everything approved unless G taps it). Nothing here approves anything: a screen's rows are only
// written when G taps Approve.
import { NOTE_MAX, FIX_REASONS, decisionRow, type CandidateReviewRow, type FixReason } from './review';

/** Tiles per grid screen (3 × 3). */
export const GRID = 9;

/** data/candidate-precheck.json: the ids to check carefully, and why. */
export interface Precheck {
  checkCarefully: string[];
  notes: Record<string, string>;
}

export const NO_PRECHECK: Precheck = { checkCarefully: [], notes: {} };

/** The file as it must look; anything else (missing, empty, broken) is "nothing to check carefully". */
export function parsePrecheck(v: unknown): Precheck {
  if (typeof v !== 'object' || v === null) return NO_PRECHECK;
  const r = v as Record<string, unknown>;
  const ids = Array.isArray(r.checkCarefully) ? r.checkCarefully.filter((x): x is string => typeof x === 'string' && x.length > 0) : [];
  const notes: Record<string, string> = {};
  if (typeof r.notes === 'object' && r.notes !== null) {
    for (const [id, why] of Object.entries(r.notes as Record<string, unknown>)) if (typeof why === 'string' && why.trim()) notes[id] = why.trim();
  }
  return { checkCarefully: [...new Set(ids)], notes };
}

/** The two piles, each in the review order. Ids the pre check names that are not candidates are ignored. */
export function splitPiles(order: readonly string[], precheck: Precheck): { careful: string[]; grid: string[] } {
  const flagged = new Set(precheck.checkCarefully);
  return { careful: order.filter((id) => flagged.has(id)), grid: order.filter((id) => !flagged.has(id)) };
}

export interface GridScreen {
  /** The next 9 undecided moves (fewer on the last screen). */
  ids: string[];
  /** The screen after this one (its photos are fetched ahead). */
  next: string[];
  /** 1 based. */
  screen: number;
  screens: number;
}

/** The screen G is on: decided moves are skipped, so a reload opens exactly here. */
export function gridScreen(pile: readonly string[], decided: ReadonlySet<string>, size = GRID): GridScreen {
  const left = pile.filter((id) => !decided.has(id));
  const screen = Math.floor((pile.length - left.length) / size) + 1;
  return { ids: left.slice(0, size), next: left.slice(size, size * 2), screen, screens: screen - 1 + Math.ceil(left.length / size) };
}

/** "Screen 3 of 32". */
export const screenText = (g: GridScreen): string => `Screen ${g.screen} of ${g.screens}`;

/** A tile G marked on the screen he is on (not saved as a decision until Approve). */
export type Mark = { decision: 'wrong' } | { decision: 'fix'; reason: FixReason; note: string };
export type Marks = Record<string, Mark>;

/** A tap: an approved tile becomes Wrong; a Wrong or Fix tile is cleared. */
export function toggleWrong(marks: Marks, id: string): Marks {
  const next = { ...marks };
  if (next[id]) delete next[id];
  else next[id] = { decision: 'wrong' };
  return next;
}

/** Only the marks of tiles on this screen count. */
export function marksOn(ids: readonly string[], marks: Marks): Marks {
  const out: Marks = {};
  for (const id of ids) if (marks[id]) out[id] = marks[id];
  return out;
}

/** The rows Approve writes: every tile of the screen, approved unless marked. */
export function screenRows(ids: readonly string[], marks: Marks, at: number): CandidateReviewRow[] {
  return ids.map((id) => {
    const m = marks[id];
    if (!m) return decisionRow(id, 'approve', at);
    return m.decision === 'fix' ? decisionRow(id, 'fix', at, { reason: m.reason, note: m.note }) : decisionRow(id, 'wrong', at);
  });
}

/** The button's words, with the real counts: "Approve 9", "Approve 7, 2 wrong", "Save 9 wrong". */
export function approveLabel(ids: readonly string[], marks: Marks): string {
  const wrong = ids.filter((id) => marks[id]).length;
  const ok = ids.length - wrong;
  if (!wrong) return `Approve ${ok}`;
  return ok ? `Approve ${ok}, ${wrong} wrong` : `Save ${wrong} wrong`;
}

/** The deck's place: "23 of 288" (the card on top, of the whole pile). */
export function deckProgress(pile: readonly string[], decided: ReadonlySet<string>): string {
  const done = pile.filter((id) => decided.has(id)).length;
  return `${Math.min(done + 1, pile.length)} of ${pile.length}`;
}

/** The tile's tiny chip: the main muscles only ("Chest, triceps · Front delts" → "Chest, triceps"). */
export const mainMuscles = (text: string | undefined): string => (text ?? '').split(' · ')[0]!.trim();

export type ReviewMode = 'grid' | 'deck';

/** Where G is, kept on the phone between visits: grid or one by one, and the marks on his screen. */
export interface ReviewPlace {
  mode: ReviewMode;
  marks: Marks;
}

export const START_PLACE: ReviewPlace = { mode: 'grid', marks: {} };

/** A stored place as it must look; anything else starts fresh (grid, nothing marked). */
export function parsePlace(v: unknown): ReviewPlace {
  if (typeof v !== 'object' || v === null) return START_PLACE;
  const r = v as Record<string, unknown>;
  const marks: Marks = {};
  if (typeof r.marks === 'object' && r.marks !== null) {
    for (const [id, raw] of Object.entries(r.marks as Record<string, unknown>)) {
      if (typeof raw !== 'object' || raw === null) continue;
      const m = raw as Record<string, unknown>;
      if (m.decision === 'wrong') marks[id] = { decision: 'wrong' };
      else if (m.decision === 'fix' && (FIX_REASONS as readonly unknown[]).includes(m.reason)) marks[id] = { decision: 'fix', reason: m.reason as FixReason, note: typeof m.note === 'string' ? m.note.slice(0, NOTE_MAX) : '' };
    }
  }
  return { mode: r.mode === 'deck' ? 'deck' : 'grid', marks };
}
