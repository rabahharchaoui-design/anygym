import type { ReactNode } from 'react';
import type { QuickItem } from '../../lib/quick';
import { setsText } from '../../lib/plans';
import { demoFor } from '../../data/exerciseInfo';
import { DeckCues, DeckPhoto } from '../../components/deck/DeckFace';
import { CheckIcon, SwapIcon } from '../../ui/icons';
import styles from '../../components/deck/Deck.module.css';

// One Quick deck card's face (PLAN 3.5a, split from Deck.tsx in 3.5h): the moving demo photo, the
// keep and swap cues, and the words. The shared deck (components/deck) owns the drag, the flight and the buttons.

const amount = (it: QuickItem) => setsText({ sets: it.sets, ...(it.reps !== undefined ? { reps: it.reps } : {}), ...(it.seconds !== undefined ? { seconds: it.seconds } : {}) });

export const itemLine = (it: QuickItem): string => `${amount(it)}${it.reps !== undefined ? ' reps' : ''}${it.eachSide ? ' each side' : ''}`;

export function Card({ item, position, of, under, action }: { item: QuickItem; position: number; of: number; under?: boolean; action?: ReactNode }) {
  // 3.5b round 4 (M10): only a swap the person made; a plan move the gym changed says why on its line.
  const swapped = item.swapped === true;
  return (
    <>
      <DeckPhoto demo={demoFor(item.id)} />
      <DeckCues keep={<CheckIcon width={26} height={26} strokeWidth={3} />} swap={<SwapIcon width={24} height={24} strokeWidth={2.4} />} />
      <div className={styles.cardBody}>
        <p className={`${styles.cardEyebrow} num`}>
          {position} of {of}
          {swapped && <span className={styles.swappedTag}>Swapped in</span>}
          {action}
        </p>
        <h2 className={styles.cardName} data-testid={under ? undefined : 'deck-name'}>
          {item.name}
        </h2>
        <p className={`${styles.cardSets} num`} data-testid={under ? undefined : 'deck-sets'}>
          {itemLine(item)}
        </p>
        <p className={styles.cardWhy}>{item.why}</p>
      </div>
    </>
  );
}
