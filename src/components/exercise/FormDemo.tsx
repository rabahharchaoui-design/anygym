import { useState } from 'react';
import { PauseIcon, PlayIcon } from '../../ui/icons';
import type { DemoImages } from '../../lib/exerciseInfo';
import { frameCount } from '../../lib/demoSequence';
import { useDemoPhotos, type Photos } from '../../hooks/usePhotos';
import { Picture } from './DemoPicture';
import { DemoSteps } from './DemoSteps';
import { DemoStage } from './DemoStage';
import styles from './FormDemo.module.css';

type Props = {
  demo: DemoImages;
  name: string;
  /** The small tile: no pause (the tile opens the sheet instead). */
  compact?: boolean;
  /** The big picture on top of the workout's exercise view (PLAN 2.2b): fills its box, no pause. */
  hero?: boolean;
  /** View transition name, so the workout tile grows into the sheet's demo. */
  vtName?: string;
  /** A tap on the photo opens the full screen viewer (never a silent pause). */
  onOpen?: () => void;
  /**
   * In the exercise sheet (PLAN 2.0k): a fixed compact height instead of the full width 3:2 box, so
   * the first How to cue shows in the first screen; the photo is uncropped in that box.
   */
  fit?: boolean;
};

/**
 * The demo's two photos (start and end) stacked, the end one crossfading in on the form demo's own
 * loop (1.35 s, 0.15 s fade). One loop for every preview (PLAN 3.5h): the hero, the sheet, the
 * workout tiles, Up next, the Replace list and the Quick deck card. Our source has two photos per
 * exercise, so this is a two frame loop. `still`: the start photo only, nothing animates (off
 * screen, or a deck card that is not in play). Reduced motion stops the loop in CSS.
 * PLAN D1: a 3 or 4 frame sequence loops the same way, one 1.5 s slot per frame, each frame
 * crossfading in over the one before it (pure CSS, so a list of tiles costs no renders).
 */
export function DemoFrames({ demo, photos, name, lazy = true, sync = false, still = false, fit = 'contain' }: { demo: DemoImages; photos: Photos; name?: string; lazy?: boolean; sync?: boolean; still?: boolean; fit?: 'contain' | 'cover' }) {
  // Modifier classes on the frames themselves (no wrapper box: the frames lay out in whatever box shows them).
  const mods = [fit === 'cover' ? styles.cover : '', still ? styles.still : ''].filter(Boolean).join(' ');
  const n = frameCount(demo);
  // Offline with a frame of the sequence not kept: the start photo still, never a loop with a hole.
  const whole = photos.kind !== 'cache' || photos.urls.slice(0, n).every(Boolean);
  if (n > 2 && !whole) return <Picture demo={demo} i={0} photos={photos} alt={name ? `${name}, start position` : ''} lazy={lazy} sync={sync} className={[styles.frame, mods].filter(Boolean).join(' ')} />;
  if (n > 2) {
    // Frame i shows in slot i: a mid frame holds until the next one covers it, the last fades out to the start photo.
    const step = (i: number) => (i === 0 ? '' : `${styles.step} ${styles[`d${i}`]} ${styles[i === n - 1 ? `last${n}` : `mid${n}`]}`);
    return (
      <>
        {Array.from({ length: n }, (_, i) => (
          <Picture key={i} demo={demo} i={i} photos={photos} alt={i === 0 && name ? `${name}, start position` : ''} lazy={lazy} sync={sync && i === 0} className={[styles.frame, step(i), mods].filter(Boolean).join(' ')} />
        ))}
      </>
    );
  }
  const cls = (end: boolean) => [styles.frame, end ? styles.end : '', mods].filter(Boolean).join(' ');
  return (
    <>
      <Picture demo={demo} i={0} photos={photos} alt={name ? `${name}, start position` : ''} lazy={lazy} sync={sync} className={cls(false)} />
      <Picture demo={demo} i={1} photos={photos} alt={name ? `${name}, end position` : ''} lazy={lazy} className={cls(true)} />
    </>
  );
}

/**
 * The form demo (SPEC 4.4): start and end photos crossfading in a loop (1.35 s, 0.15 s fade,
 * 1.35 s; round 2 P4: a short fade never shows a double exposure in a still), tap to pause. No position counter or dots (PLAN 2.2b). Reduced motion shows
 * both side by side (the tile and the hero then show the start photo still). The loop is pure CSS,
 * so it costs no renders and stays on the compositor.
 */
export function FormDemo({ demo, name, compact = false, hero = false, vtName, onOpen, fit = false }: Props) {
  const [paused, setPaused] = useState(false);
  const photos = useDemoPhotos(demo);
  const frames = <DemoFrames demo={demo} photos={photos} name={name} />;
  // The hero's frames load at once (the list tile already fetched frame 1): never lazy, never late.
  const heroFrames = <DemoFrames demo={demo} photos={photos} name={name} lazy={false} sync />;
  if (hero) {
    // The whole photo, never cropped (feet and bar stay in), over a soft blurred copy that fills the box.
    return (
      <span className={styles.hero} data-testid="demo-hero">
        <Picture demo={demo} i={0} photos={photos} alt="" lazy={false} fill className={styles.heroFill ?? ''} />
        {/* Only the sharp photo carries the shared name (critic B1): the blurred bands stay in the
            page, so the slot is never an empty black box while the photo flies in. */}
        <span className={styles.heroPhoto} data-testid="hero-photo" style={vtName ? { viewTransitionName: vtName } : undefined}>
          {heroFrames}
        </span>
      </span>
    );
  }
  if (compact) {
    return (
      <span className={styles.tile} data-testid="demo-tile" style={vtName ? { viewTransitionName: vtName } : undefined}>
        {frames}
      </span>
    );
  }
  // PLAN D1: a 3 or 4 frame sequence steps with a position and Previous / Next (DemoSteps.tsx).
  if (frameCount(demo) > 2) return <DemoSteps demo={demo} name={name} onOpen={onOpen} fit={fit} />;
  return (
    <div className={styles.wrap} data-testid="form-demo" data-paused={paused || undefined} data-fit={fit || undefined} style={vtName ? { viewTransitionName: vtName } : undefined}>
      <DemoStage className={styles.stage ?? ''} name={name} onOpen={onOpen}>
        {frames}
      </DemoStage>
      {/* Pause is a visible glyph in the corner, never a hidden tap on the photo (hidden with reduced motion: nothing moves). */}
      <button type="button" className={`${styles.pause} pressable`} onClick={() => setPaused((p) => !p)} aria-pressed={paused} aria-label={paused ? 'Play demo' : 'Pause demo'}>
        {paused ? <PlayIcon width={14} height={14} strokeWidth={2.6} fill="currentColor" aria-hidden="true" /> : <PauseIcon width={14} height={14} strokeWidth={2.6} fill="currentColor" aria-hidden="true" />}
      </button>
    </div>
  );
}
