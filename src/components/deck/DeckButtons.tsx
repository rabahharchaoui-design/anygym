import type { ReactNode } from 'react';
import styles from './Deck.module.css';
import own from './Curate.module.css';

// The round buttons under a swipe deck (PLAN 3.5a, shared since 3.5e): they mirror the swipe, left
// (glass) and right (lime), with an optional middle one. Fixed 56 pt, they never give way to the card.

export type DeckButton = { label: ReactNode; icon: ReactNode; onClick: () => void; testId: string; kind: 'keep' | 'swap' | 'other'; note?: boolean; ariaLabel?: string };

/** The buttons under the deck, mirroring the swipe: the left one (glass), an optional middle one, the right one (lime). */
export function DeckButtons({ left, middle, right, leaving }: { left: DeckButton; middle?: DeckButton; right: DeckButton; leaving?: boolean }) {
  const one = (b: DeckButton) => (
    <button type="button" className={`${styles.round} pressable`} data-kind={b.kind} data-note={b.note ? '' : undefined} onClick={b.onClick} data-testid={b.testId} aria-label={b.ariaLabel}>
      {b.icon}
      {b.label}
    </button>
  );
  return (
    <div className={`${styles.deckButtons} ${middle ? own.three : ''}`} data-leaving={leaving || undefined} data-three={middle ? '' : undefined}>
      {one(left)}
      {middle && one(middle)}
      {one(right)}
    </div>
  );
}
