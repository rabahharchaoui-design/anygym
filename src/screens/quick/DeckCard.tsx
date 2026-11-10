import type { ReactNode } from 'react';
import type { QuickItem } from '../../lib/quick';
import { setsText } from '../../lib/plans';
import { assetUrl, demoFor } from '../../data/exerciseInfo';
import { useDemoPhotos } from '../../hooks/usePhotos';
import { DemoFrames } from '../../components/exercise/FormDemo';
import { CheckIcon, SwapIcon } from '../../ui/icons';
import styles from './Quick.module.css';
import own from './DeckCard.module.css';

// One Quick deck card's face (PLAN 3.5a, split from Deck.tsx in 3.5h): the moving demo photo, the
// keep and swap cues, and the words. Deck.tsx owns the drag, the flight and the buttons.

const amount = (it: QuickItem) => setsText({ sets: it.sets, ...(it.reps !== undefined ? { reps: it.reps } : {}), ...(it.seconds !== undefined ? { seconds: it.seconds } : {}) });

export const itemLine = (it: QuickItem): string => `${amount(it)}${it.reps !== undefined ? ' reps' : ''}${it.eachSide ? ' each side' : ''}`;

/**
 * The whole demo photo, never cropped: a head or the dumbbell over it is never cut off (round 2,
 * P12). PLAN 3.5h: the same moving demo as the exercise screen (the start and end photos
 * crossfading, FormDemo's DemoFrames); the soft fill behind stays the start photo, drawn once.
 */
function Photo({ id }: { id: string }) {
  const demo = demoFor(id);
  const photos = useDemoPhotos(demo);
  const src = !demo ? null : photos.kind === 'net' ? assetUrl(demo.webp[0]!) : photos.kind === 'cache' ? photos.urls[0] : null;
  return (
    <div className={styles.photo} data-demo={demo ? '' : undefined}>
      {src && demo ? (
        <>
          {/* Round 3 (P5): the same photo, soft and dim, fills the box: no dark bands, nothing cropped. */}
          <img className={styles.photoFill} src={src} alt="" decoding="async" draggable={false} aria-hidden="true" />
          <span className={own.moving} data-testid="deck-demo">
            <DemoFrames demo={demo} photos={photos} lazy={false} />
          </span>
        </>
      ) : (
        <span className={styles.photoOff}>Photo when you are back online</span>
      )}
    </div>
  );
}

export function Card({ item, position, of, under, action }: { item: QuickItem; position: number; of: number; under?: boolean; action?: ReactNode }) {
  // 3.5b round 4 (M10): only a swap the person made; a plan move the gym changed says why on its line.
  const swapped = item.swapped === true;
  return (
    <>
      <Photo id={item.id} />
      <span className={styles.edge} data-side="keep" aria-hidden="true" />
      <span className={styles.edge} data-side="swap" aria-hidden="true" />
      {/* Round 3 (P4): the chip sits toward the screen's centre, so it stays in view as the card leaves. */}
      <span className={styles.cue} data-side="keep" aria-hidden="true">
        <CheckIcon width={26} height={26} strokeWidth={3} />
      </span>
      <span className={styles.cue} data-side="swap" aria-hidden="true">
        <SwapIcon width={24} height={24} strokeWidth={2.4} />
      </span>
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
