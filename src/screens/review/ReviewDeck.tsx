import { useState } from 'react';
import { SwipeDeck, type Decision } from '../../components/deck/SwipeDeck';
import { DeckButtons } from '../../components/deck/DeckButtons';
import { CheckIcon, XIcon } from '../../ui/icons';
import type { CandidateDecision } from '../../lib/candidates/review';
import type { CandidateRecord } from '../../lib/candidates/types';
import { CandidateCard } from './CandidateCard';

/**
 * The one by one deck (PLAN 3.5e, swipe friendly in 3.5i): a full height card, a light flick
 * decides (right approves, left is wrong), the next card is already drawn underneath, and nothing
 * asks "are you sure" (Undo is in the header for 5 seconds). The buttons mirror the swipe.
 */
export function ReviewDeck({ cards, note, reduced, onDecide, onFix }: { cards: readonly CandidateRecord[]; note: (id: string) => string; reduced: boolean; onDecide: (id: string, d: CandidateDecision) => void; onFix: (c: CandidateRecord) => void }) {
  const [fling, setFling] = useState<{ kind: Decision; n: number } | null>(null);
  const top = cards[0];
  if (!top) return null;
  const press = (kind: Decision) => setFling((f) => ({ kind, n: (f?.n ?? 0) + 1 }));
  return (
    <>
      <SwipeDeck
        items={cards}
        index={0}
        canSwap
        light
        reduced={reduced}
        onDecide={(d) => onDecide(top.id, d === 'keep' ? 'approve' : 'wrong')}
        onNothingToSwap={() => undefined}
        fling={fling}
        label={(c) => `${c.name}. Swipe right to approve, left if it is wrong.`}
        renderCard={(c, at) => <CandidateCard c={c} under={at.under} note={note(c.id)} />}
      />
      <DeckButtons
        left={{ kind: 'swap', testId: 'candidate-wrong', onClick: () => press('swap'), icon: <XIcon width={20} height={20} strokeWidth={2.6} aria-hidden="true" />, label: <span>Wrong</span> }}
        middle={{ kind: 'other', testId: 'candidate-fix', onClick: () => onFix(top), icon: null, label: <span>Fix</span> }}
        right={{ kind: 'keep', testId: 'candidate-approve', onClick: () => press('keep'), icon: <CheckIcon width={20} height={20} strokeWidth={2.8} aria-hidden="true" />, label: <span>Approve</span> }}
      />
    </>
  );
}
