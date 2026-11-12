// The top of the exercise view (SPEC 20.2, PLAN 2.2b): the demo hero whose foot (name, set line, ⋯)
// stays pinned while the picture scrolls away, or, without a sure demo, a compact header with a tile.
// PLAN 3.5w: the hero never resizes after a check; short phones get the small picture from the start
// (Workout.module.css), so the set rows and the rest bar share the screen on an iPhone SE.
import { useLayoutEffect, useMemo, useRef, useState } from 'react';
import { MoreIcon } from '../../ui/icons';
import { FormDemo } from '../../components/exercise/FormDemo';
import { ExerciseSheet } from '../../components/exercise/ExerciseSheet';
import { DemoViewer } from '../../components/exercise/DemoViewer';
import type { ExerciseInfo } from '../../lib/exerciseInfo';
import type { Load } from '../../db/types';
import type { WorkoutEntry } from '../../lib/planWorkout';
import { Thumb } from './Thumb';
import styles from './ExerciseHead.module.css';

type Props = {
  name: string;
  kind: Load['kind'] | undefined;
  info: ExerciseInfo;
  /** Sure demo photos that can show (online, or kept). */
  photosOk: boolean;
  /** The demo hero (photos and room for it), else the compact header. */
  hasDemo: boolean;
  note: string;
  targetText: string;
  entry: Pick<WorkoutEntry, 'kind' | 'pairSize' | 'pairIndex'> | undefined;
  onMenu: () => void;
};

export function ExerciseHead({ name, kind, info, photosOk, hasDemo, note, targetText, entry, onMenu }: Props) {
  /** The hero folded into its compact title bar (scrolled past the picture). */
  const [folded, setFolded] = useState(false);
  const [demo, setDemo] = useState(false);
  /** The full screen demo (the hero's tap). */
  const [full, setFull] = useState(false);
  const heroRef = useRef<HTMLDivElement>(null);
  const captionRef = useRef<HTMLDivElement>(null);
  /** The hero's foot (name, set, ⋯) stays pinned when the picture scrolls away: its height, measured. */
  useLayoutEffect(() => {
    const hero = heroRef.current;
    const cap = captionRef.current;
    if (!hero || !cap) return;
    const scroller = hero.parentElement!;
    let pinPx = 0;
    const pin = () => {
      // The bar keeps 8 px of the fade above the name; the rest of the fade scrolls away.
      // Layout height, not the drawn one: a screen change scales the page while this first runs, and a
      // short foot there leaves the picture's tap target under the foot (SPEC 13.3).
      const capPx = cap.offsetHeight;
      pinPx = Math.ceil(capPx - Math.max(0, parseFloat(getComputedStyle(cap).paddingTop) - 8));
      hero.style.setProperty('--pin', `${pinPx}px`);
      hero.style.setProperty('--cap', `${Math.floor(capPx)}px`);
    };
    pin();
    // Folded once the picture has scrolled away: one attribute flip, CSS does the rest.
    const onScroll = () => setFolded(scroller.scrollTop > hero.offsetHeight - pinPx - 24);
    scroller.addEventListener('scroll', onScroll, { passive: true });
    const ro = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(pin);
    ro?.observe(cap);
    return () => {
      ro?.disconnect();
      scroller.removeEventListener('scroll', onScroll);
    };
  }, [hasDemo]);

  const titleBlock = (withNote: boolean) => (
    <div className={styles.heroText}>
      <h2 className={styles.exName}>{name}</h2>
      <p className={`${styles.exTarget} num`} data-testid="set-target">
        {targetText}
      </p>
      {/* A pair says so from the start, before any check (round 2, P9). */}
      {entry?.kind === 'pair' && entry.pairSize > 1 && (
        <p className={`${styles.pairLine} num`} data-testid="pair-line">
          {entry.pairSize > 2 ? 'Circuit' : 'Pair'} · {entry.pairIndex + 1} of {entry.pairSize}
        </p>
      )}
      {withNote && note && (
        <p className={styles.exNote} data-testid="set-plan">
          {note}
        </p>
      )}
    </div>
  );
  // The pictures are memoized elements (PLAN 2.2d): a tap on a row never re-renders them. The
  // tapped day list tile grows into them (the shared "ex-hero" view transition, SPEC 23.1).
  const heroArt = useMemo(() => (info.demo ? <FormDemo demo={info.demo} name={name} hero vtName="ex-hero" /> : null), [info.demo, name]);
  const tileArt = useMemo(
    () => (photosOk && info.demo ? <FormDemo demo={info.demo} name={name} compact vtName="ex-hero" /> : <Thumb name={name} loadType={kind} size="hero" vtName="ex-hero" />),
    [photosOk, info.demo, name, kind],
  );
  const moreButton = (
    <button type="button" className={`${styles.moreButton} pressable`} onClick={onMenu} aria-label={`More for ${name}`}>
      <MoreIcon width={22} height={22} strokeWidth={2.4} aria-hidden="true" />
    </button>
  );

  return (
    <>
      {hasDemo && info.demo ? (
        // The demo hero (PLAN 2.2b): the photos loop like a gif; the name and set ride on its foot,
        // which stays pinned (with the ⋯) while the picture scrolls away above it.
        <div className={styles.hero} ref={heroRef} data-testid="ex-hero" data-folded={folded || undefined}>
          <span className={styles.heroArt} aria-hidden="true">
            <span className={styles.heroMedia}>{heroArt}</span>
          </span>
          {/* The picture's tap target ends where the foot starts, so each has its own whole hit area
              (SPEC 13.3); a tap on the foot opens the demo too. */}
          <button type="button" className={styles.heroStage} onClick={() => setFull(true)} aria-label={`How to do ${name}`} tabIndex={folded ? -1 : undefined} />
          {/* The foot is on top of the picture (the name is what a tap lands on, SPEC 13.5) and a tap
              on it opens the demo like the picture does; the ⋯ keeps its own tap. */}
          <div
            className={styles.heroCaption}
            ref={captionRef}
            // Rides with its page above the flying photo (round 2, critic B1).
            style={{ viewTransitionName: 'ex-caption' }}
            onClick={(e) => {
              if (!folded && !(e.target as Element).closest('button')) setFull(true);
            }}
          >
            {titleBlock(false)}
            {moreButton}
          </div>
        </div>
      ) : (
        // No sure demo (SPEC 4.3): a compact header, never a broken or empty picture.
        <div className={styles.head} data-testid="ex-head">
          <button type="button" className={`${styles.heroTile} pressable`} onClick={() => setDemo(true)} aria-label={`How to do ${name}`}>
            {tileArt}
          </button>
          {titleBlock(true)}
          {moreButton}
        </div>
      )}
      {/* The plan's own note, under the picture (the hero's foot stays two lines). */}
      {hasDemo && note && (
        <p className={`${styles.exNote} ${styles.planNote}`} data-testid="set-plan">
          {note}
        </p>
      )}
      {hasDemo && info.demo && <DemoViewer open={full} onClose={() => setFull(false)} name={name} demo={info.demo} />}
      <ExerciseSheet open={demo} onClose={() => setDemo(false)} name={name} info={info} placeholder={<Thumb name={name} loadType={kind} size="hero" />} />
    </>
  );
}
