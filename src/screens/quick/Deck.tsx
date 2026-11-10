import { SwipeDeck, type Decision } from '../../components/deck/SwipeDeck';
import { DeckButtons as SharedButtons } from '../../components/deck/DeckButtons';
import type { QuickItem } from '../../lib/quick';
import { CheckIcon, NeverIcon, SwapIcon } from '../../ui/icons';
import { Card, itemLine } from './DeckCard';
import styles from '../../components/deck/Deck.module.css';

// Quick workout's curate deck (PLAN 3.5a, SPEC 20.3) on the shared swipe deck (components/deck):
// right keeps, left swaps, a hold is "Never show".

export { LONG_PRESS_MS, type Decision } from '../../components/deck/SwipeDeck';
export { itemLine };

type Props = {
  items: readonly QuickItem[];
  index: number;
  /** Left swipe has something to put in (else the card shakes and Swap says so). */
  canSwap: boolean;
  reduced: boolean;
  onDecide: (d: Decision) => void;
  onFlyStart?: (d: Decision) => void;
  onNever: () => void;
  onNothingToSwap: () => void;
  fling: { kind: Decision; n: number } | null;
};

export function Deck({ onNever, ...rest }: Props) {
  return (
    <SwipeDeck
      {...rest}
      onNever={onNever}
      label={(top) => `${top.name}. ${itemLine(top)}. ${top.why}`}
      renderCard={(item, at) => (
        <Card
          item={item}
          position={at.position}
          of={at.of}
          under={at.under}
          action={
            at.under ? undefined : (
              // In the words, never over the photo (round 2, P12): the figure is never covered.
              <button type="button" className={`${styles.never} pressable`} aria-label="Never show me this" data-testid="deck-never" onClick={onNever}>
                <NeverIcon width={18} height={18} strokeWidth={2} aria-hidden="true" />
                <span>Never show</span>
              </button>
            )
          }
        />
      )}
    />
  );
}

/** The two buttons under the deck: Swap (glass, left) and Keep (lime, right), mirroring the swipe. */
export function DeckButtons({ onSwap, onKeep, swapNote, leaving }: { onSwap: () => void; onKeep: () => void; swapNote?: string | null; leaving?: boolean }) {
  return (
    <SharedButtons
      leaving={leaving}
      left={{
        kind: 'swap',
        testId: 'deck-swap',
        onClick: onSwap,
        note: !!swapNote,
        icon: <SwapIcon width={20} height={20} strokeWidth={2.2} aria-hidden="true" />,
        // Nothing else fits: the button itself says so for a moment (round 2, B2), no toast.
        label: (
          <span aria-live="polite" data-testid="swap-label">
            {swapNote ?? 'Swap'}
          </span>
        ),
      }}
      right={{ kind: 'keep', testId: 'deck-keep', onClick: onKeep, icon: <CheckIcon width={20} height={20} strokeWidth={2.8} aria-hidden="true" />, label: <span>Keep</span> }}
    />
  );
}
