import { useEffect, useRef, type Dispatch, type SetStateAction } from 'react';
import { useSearchParams } from 'react-router-dom';
import { cardKey, chipFor, type Concept, type QuickMinutes } from '../../lib/quick';
import { clearDeck, loadDeck, saveDeck } from './deckMemory';
import type { Curating } from './useDeck';

// PLAN 3.5f round 2: Quick workout across a reload. The minutes picked go into the URL (in place, no
// new history entry), and a URL with other minutes picks them; the open deck
// is saved on every change and, once the ideas are worked out again, the same idea at the same
// minutes opens on the same card with the swaps so far. Back (no deck) clears it. Never for Preview.

type Props = {
  minutes: number | null;
  setMinutes: (m: QuickMinutes) => void;
  chip: number;
  preview: boolean;
  /** Every idea of these minutes (the cards and More ideas), null while they are worked out. */
  ideas: readonly Concept[] | null;
  stage: Curating | null;
  setStage: Dispatch<SetStateAction<Curating | null>>;
};

export function useKeptDeck({ minutes, setMinutes, chip, preview, ideas, stage, setStage }: Props) {
  const [params, setParams] = useSearchParams();
  const urlMin = params.get('min');
  // Opened (or navigated) with minutes in the URL: those are the minutes.
  useEffect(() => {
    if (urlMin && !preview) setMinutes(chipFor(Number(urlMin)));
  }, [urlMin, preview, setMinutes]);
  // Minutes picked: the URL says so, so a reload keeps them.
  useEffect(() => {
    if (!minutes || preview || urlMin === String(minutes)) return;
    setParams(
      (p) => {
        const next = new URLSearchParams(p);
        next.set('min', String(minutes));
        return next;
      },
      { replace: true },
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [minutes, preview]);

  const restored = useRef(false);
  useEffect(() => {
    if (restored.current || !ideas || preview) return;
    restored.current = true;
    const saved = loadDeck();
    const concept = saved && saved.min === chip ? ideas.find((c) => cardKey(c) === saved.key) : undefined;
    if (saved && concept) setStage({ ...saved.deck, concept });
    else clearDeck();
  }, [ideas, preview, chip, setStage]);

  useEffect(() => {
    if (!restored.current || preview) return;
    if (!stage) return clearDeck();
    const { concept, ...deck } = stage;
    saveDeck({ min: chip, key: cardKey(concept), deck });
  }, [stage, chip, preview]);
}
