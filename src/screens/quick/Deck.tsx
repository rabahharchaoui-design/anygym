import { SwipeDeck, type Decision } from '../../components/deck/SwipeDeck';
import { DeckButtons as SharedButtons } from '../../components/deck/DeckButtons';
import type { QuickItem } from '../../lib/quick';
import { CheckIcon, NeverIcon, SwapIcon } from '../../ui/icons';
import { Card, itemLine } from './DeckCard';

// Quick workout's curate deck (PLAN 3.5a, SPEC 20.3) on the shared swipe deck (components/deck):
// right keeps, left swaps, a hold hides ("Never show"). PLAN 3.5f: the card face keeps to the name,
// sets x reps and one why line; the rest is behind its info button, and Hide is a button under the deck.

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
  onInfo: (item: QuickItem) => void;
  fling: { kind: Decision; n: number } | null;
};

export function Deck({ onNever, onInfo, ...rest }: Props) {
  return (
    <SwipeDeck
      {...rest}
      onNever={onNever}
      label={(top) => `${top.name}. ${itemLine(top)}. ${top.why}`}
      renderCard={(item, at) => <Card item={item} position={at.position} of={at.of} under={at.under} onInfo={() => onInfo(item)} />}
    />
  );
}

/** Under the deck, mirroring the swipe: Swap (glass, left), Hide (the hold, as a button), Keep (lime, right). */
export function DeckButtons({ onSwap, onKeep, onNever, swapNote, leaving }: { onSwap: () => void; onKeep: () => void; onNever: () => void; swapNote?: string | null; leaving?: boolean }) {
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
      middle={{ kind: 'other', testId: 'deck-never', onClick: onNever, ariaLabel: 'Never show me this', icon: <NeverIcon width={20} height={20} strokeWidth={2} aria-hidden="true" />, label: <span>Hide</span> }}
      right={{ kind: 'keep', testId: 'deck-keep', onClick: onKeep, icon: <CheckIcon width={20} height={20} strokeWidth={2.8} aria-hidden="true" />, label: <span>Keep</span> }}
    />
  );
}
