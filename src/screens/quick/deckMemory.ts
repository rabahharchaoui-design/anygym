// Quick workout across a reload (PLAN 3.5f round 2): the minutes picked stay in the URL, and an open
// deck (which idea, the card on top, the swaps so far) is kept for this tab only, so a reload comes
// back to the same card. Cleared when the workout starts or the person goes back.
import type { Curating } from './useDeck';

const KEY = 'anygym.quickDeck';

/** What is kept: the deck without its idea (found again by its key among the ideas of the same minutes). */
export type SavedDeck = { min: number; key: string; deck: Omit<Curating, 'concept'> };

function store(): Storage | null {
  try {
    return window.sessionStorage;
  } catch {
    return null;
  }
}

export function saveDeck(saved: SavedDeck): void {
  try {
    store()?.setItem(KEY, JSON.stringify(saved));
  } catch {
    // Storage full or blocked: a reload starts at the ideas, as before.
  }
}

export function loadDeck(): SavedDeck | null {
  try {
    const raw = store()?.getItem(KEY);
    if (!raw) return null;
    const s = JSON.parse(raw) as SavedDeck;
    const d = s?.deck;
    const ok = typeof s.min === 'number' && typeof s.key === 'string' && d && Array.isArray(d.items) && typeof d.index === 'number' && d.index >= 0 && d.index <= d.items.length;
    return ok ? s : null;
  } catch {
    return null;
  }
}

export function clearDeck(): void {
  try {
    store()?.removeItem(KEY);
  } catch {
    // Nothing to clear.
  }
}
