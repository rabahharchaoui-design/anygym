// The why note on every Quick workout card (PLAN 3.5f): each card's line and its two "more"
// sentences are a fact from data/coach-facts.json (lib/coachFacts.ts picks it from where the move
// sits in the workout). Pure. Run again after anything changes the workout (a swap, a card hidden),
// so a note is always true of the workout as it is now.
import { notesFor, type CoachFact, type NoteItem } from './coachFacts';
import type { Profile } from './order';
import type { QuickItem } from './quick';

export type NoteDeps = { profileOf: (id: string, name?: string) => Profile; facts: readonly CoachFact[] };

export function withNotes<T extends QuickItem>(items: readonly T[], deps: NoteDeps): T[] {
  const read: NoteItem[] = items.map((it) => ({
    profile: deps.profileOf(it.id, it.name),
    ...(it.group !== undefined ? { group: it.group } : {}),
    ...(it.seconds !== undefined && it.reps === undefined ? { timed: true } : {}),
    ...(it.from ? { swappedFor: { from: it.from, ...(it.close ? { close: true } : {}) } } : it.standsIn ? { standsIn: it.standsIn } : {}),
  }));
  const notes = notesFor(deps.facts, read);
  return items.map((it, i) => ({ ...it, why: notes[i]!.why, fact: notes[i]!.fact, more: notes[i]!.more }));
}

/** "2 min 30 s", "1 min", "45 s". */
export function restWords(sec: number): string {
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return [m ? `${m} min` : '', s ? `${s} s` : ''].filter(Boolean).join(' ') || '0 s';
}

/** What sits behind a card's info button besides its fact (PLAN 3.5f: the face keeps to three things): how it is done and its rest. */
export function detailRows(item: QuickItem, items: readonly QuickItem[]): string[] {
  const mates = item.group === undefined ? [] : items.filter((x) => x !== item && x.group === item.group);
  const rows: string[] = [];
  if (mates.length === 1) rows.push(`Done back to back with ${mates[0]!.name}`);
  else if (mates.length > 1) rows.push(`One of ${mates.length + 1} moves done in a round`);
  if (item.restSec > 0) rows.push(mates.length === 1 ? `Rest ${restWords(item.restSec)} after both` : mates.length > 1 ? `Rest ${restWords(item.restSec)} after each round` : `Rest ${restWords(item.restSec)} between sets`);
  return rows;
}
