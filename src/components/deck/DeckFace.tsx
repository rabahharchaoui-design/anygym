import type { ReactNode } from 'react';
import { assetUrl } from '../../data/exerciseInfo';
import type { DemoImages } from '../../lib/exerciseInfo';
import { useDemoPhotos } from '../../hooks/usePhotos';
import { DemoFrames } from '../exercise/FormDemo';
import styles from './Deck.module.css';
import own from './DeckPhoto.module.css';

// The parts every deck card face shares (PLAN 3.5a, split from the Quick deck in 3.5h, shared in
// 3.5e): the moving demo photo and the keep and swap cues the drag fades in. The words are the face's own.

/**
 * The whole demo photo, never cropped: a head or the dumbbell over it is never cut off (round 2,
 * P12). PLAN 3.5h: the same moving demo as the exercise screen (the start and end photos
 * crossfading, FormDemo's DemoFrames); the soft fill behind stays the start photo, drawn once.
 * No demo: the honest words instead, never another exercise's photo.
 */
export function DeckPhoto({ demo, none = 'Photo when you are back online' }: { demo: DemoImages | null; none?: string }) {
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
        <span className={styles.photoOff}>{none}</span>
      )}
    </div>
  );
}

/** The glow and chip on each side; the drag sets --keep and --swap on the card (SwipeDeck). */
export function DeckCues({ keep, swap }: { keep: ReactNode; swap: ReactNode }) {
  return (
    <>
      <span className={styles.edge} data-side="keep" aria-hidden="true" />
      <span className={styles.edge} data-side="swap" aria-hidden="true" />
      {/* Round 3 (P4): the chip sits toward the screen's centre, so it stays in view as the card leaves. */}
      <span className={styles.cue} data-side="keep" aria-hidden="true">
        {keep}
      </span>
      <span className={styles.cue} data-side="swap" aria-hidden="true">
        {swap}
      </span>
    </>
  );
}
