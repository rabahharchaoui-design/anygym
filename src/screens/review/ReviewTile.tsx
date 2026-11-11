import { useEffect, useRef } from 'react';
import { DemoFrames } from '../../components/exercise/FormDemo';
import { useDemoPhotos } from '../../hooks/usePhotos';
import { useInView } from '../../hooks/useInView';
import { tick } from '../../ui/haptics';
import { mainMuscles, type Mark } from '../../lib/candidates/fastReview';
import { FIX_WORDS } from '../../lib/candidates/review';
import type { CandidateRecord } from '../../lib/candidates/types';
import styles from './ReviewGrid.module.css';

/** A hold this long opens Fix; a move past SLOP px is a scroll, not a hold. */
const HOLD_MS = 480;
const SLOP = 8;

/**
 * One tile of the review grid (PLAN 3.5i): the move's own two photo loop, its name and its main
 * muscles as a tiny chip. It counts as approved until tapped: a tap marks it Wrong (dim, red edge)
 * or clears it, a hold opens Fix. Only a tile on screen animates; its photos load lazily.
 */
export function ReviewTile({ c, mark, still, onToggle, onFix }: { c: CandidateRecord; mark: Mark | undefined; still: boolean; onToggle: () => void; onFix: () => void }) {
  const ref = useRef<HTMLButtonElement>(null);
  const inView = useInView(ref);
  const photos = useDemoPhotos(c.images);
  const hold = useRef(0);
  const start = useRef<{ x: number; y: number } | null>(null);
  const held = useRef(false);
  const stop = () => {
    window.clearTimeout(hold.current);
    start.current = null;
  };
  useEffect(() => () => window.clearTimeout(hold.current), []);

  const state = !mark ? 'Approved' : mark.decision === 'wrong' ? 'Wrong' : `Fix: ${FIX_WORDS[mark.reason]}`;
  return (
    <button
      ref={ref}
      type="button"
      className={`${styles.tile} pressable`}
      data-testid="review-tile"
      data-candidate={c.id}
      data-mark={mark?.decision}
      aria-pressed={!!mark}
      aria-label={`${c.name}. ${state}. Tap if it is wrong, hold to say what is wrong.`}
      onPointerDown={(e) => {
        held.current = false;
        start.current = { x: e.clientX, y: e.clientY };
        window.clearTimeout(hold.current);
        hold.current = window.setTimeout(() => {
          if (!start.current) return;
          start.current = null;
          held.current = true;
          tick();
          onFix();
        }, HOLD_MS);
      }}
      onPointerMove={(e) => {
        const s = start.current;
        if (s && Math.hypot(e.clientX - s.x, e.clientY - s.y) > SLOP) stop();
      }}
      onPointerUp={stop}
      onPointerCancel={stop}
      onPointerLeave={stop}
      onContextMenu={(e) => e.preventDefault()}
      onClick={() => {
        // The tap that ends a hold already opened Fix.
        if (held.current) {
          held.current = false;
          return;
        }
        tick();
        onToggle();
      }}
    >
      <span className={styles.photo}>
        {photos.kind === 'none' ? <span className={styles.photoOff}>Photo when you are back online</span> : <DemoFrames demo={c.images} photos={photos} still={still || !inView} />}
      </span>
      <span className={styles.name}>{c.name}</span>
      <span className={styles.chip} data-testid="tile-chip">
        {mark ? state : mainMuscles(c.muscleText)}
      </span>
    </button>
  );
}
