import type { DemoImages } from '../../lib/exerciseInfo';
import { assetUrl } from '../../data/exerciseInfo';
import { useDemoPhotos } from '../../hooks/usePhotos';
import { CheckIcon, InfoIcon, SwapIcon } from '../../ui/icons';
import { DeckCues, DeckPhoto } from './DeckFace';
import styles from './Deck.module.css';
import own from './Curate.module.css';

// One exercise on a deck card (PLAN 3.5f, shared by Quick, the plan day preview, the intake and
// Replace): the moving demo, then three things only: the name, sets x reps, and one why line that
// is always a fact from data/coach-facts.json. Everything else sits behind the info button.

type Props = {
  demo: DemoImages | null;
  name: string;
  /** "3 x 8 to 12 reps"; none on cards that are not a prescription (the intake). */
  sets?: string;
  /** The curated why line, and the id of the fact it is. */
  why: string;
  fact?: string;
  /** "2 of 6": read out as the card's first line, never drawn (the deck's bar shows it). */
  position?: string;
  /** The card under the top one: no ids, no info button. */
  under?: boolean;
  onInfo?: () => void;
};

export function ExerciseFace({ demo, name, sets, why, fact, position, under, onInfo }: Props) {
  return (
    <>
      {/* No sure demo: the honest words, never another exercise's photo (SPEC 4.3). */}
      <DeckPhoto demo={demo} {...(demo ? {} : { none: 'No demo for this one yet' })} />
      <DeckCues keep={<CheckIcon width={26} height={26} strokeWidth={3} />} swap={<SwapIcon width={24} height={24} strokeWidth={2.4} />} />
      <div className={`${styles.cardBody} ${own.face}`}>
        {position && <p className={own.srOnly}>{position}</p>}
        <div className={own.faceTop}>
          <h2 className={styles.cardName} data-testid={under ? undefined : 'deck-name'}>
            {name}
          </h2>
          {onInfo && !under && (
            <button type="button" className={`${own.info} pressable`} aria-label={`More about ${name}`} data-testid="deck-info" onClick={onInfo}>
              <InfoIcon width={22} height={22} strokeWidth={2} aria-hidden="true" />
            </button>
          )}
        </div>
        {sets && (
          <p className={`${styles.cardSets} num`} data-testid={under ? undefined : 'deck-sets'}>
            {sets}
          </p>
        )}
        <p className={styles.cardWhy} data-testid={under ? undefined : 'deck-why'} data-fact={fact}>
          {why}
        </p>
      </div>
    </>
  );
}

/** The start photo of a demo, still (the "Show me 6" tiles); the honest gap when there is none to show. */
export function DemoStill({ demo }: { demo: DemoImages | null }) {
  const photos = useDemoPhotos(demo);
  const src = !demo ? null : photos.kind === 'net' ? assetUrl(demo.webp[0]!) : photos.kind === 'cache' ? photos.urls[0] : null;
  return <span className={own.still}>{src ? <img src={src} alt="" decoding="async" draggable={false} /> : <span className={own.stillOff}>No photo</span>}</span>;
}
