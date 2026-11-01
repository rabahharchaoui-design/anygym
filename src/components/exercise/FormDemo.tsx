import { useState } from 'react';
import { PauseIcon, PlayIcon } from '../../ui/icons';
import { assetUrl } from '../../data/exerciseInfo';
import type { DemoImages } from '../../lib/exerciseInfo';
import { useDemoPhotos, type Photos } from '../../hooks/usePhotos';
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
};

/**
 * One picture: WebP with a JPG fallback online; offline only the URL the cache holds, so nothing
 * ever fails to load (gate s2: a failed load logs an error in WebKit). Sized by its box, so nothing
 * shifts when it loads.
 */
function Picture({ demo, i, photos, className, alt, lazy = true, fill = false }: { demo: DemoImages; i: 0 | 1; photos: Photos; className: string; alt: string; lazy?: boolean; fill?: boolean }) {
  // The blurred fill behind the hero is not a frame of the demo.
  const frame = fill ? undefined : i;
  if (photos.kind === 'net') {
    return (
      <picture className={className} data-frame={frame} aria-hidden={alt ? undefined : true}>
        <source srcSet={assetUrl(demo.webp[i])} type="image/webp" />
        <img src={assetUrl(demo.jpg[i])} alt={alt} loading={lazy ? 'lazy' : undefined} decoding="async" width={640} height={427} draggable={false} />
      </picture>
    );
  }
  const url = photos.kind === 'cache' ? photos.urls[i] : null;
  // Not kept (or still asking the cache): the frame stays empty, never a broken picture.
  if (!url) return i === 0 ? <span className={className} data-frame={frame} aria-hidden="true" /> : null;
  return (
    <picture className={className} data-frame={frame} aria-hidden={alt ? undefined : true}>
      <img src={url} alt={alt} decoding="async" width={640} height={427} draggable={false} />
    </picture>
  );
}

/**
 * The form demo (SPEC 4.4): start and end photos crossfading in a loop (1.2 s, 0.35 s fade,
 * 1.2 s, ease in out), tap to pause. No position counter or dots (PLAN 2.2b). Reduced motion shows
 * both side by side (the tile and the hero then show the start photo still). The loop is pure CSS,
 * so it costs no renders and stays on the compositor.
 */
export function FormDemo({ demo, name, compact = false, hero = false, vtName, onOpen }: Props) {
  const [paused, setPaused] = useState(false);
  const photos = useDemoPhotos(demo);
  const frames = (
    <>
      <Picture demo={demo} i={0} photos={photos} alt={`${name}, start position`} className={styles.frame ?? ''} />
      <Picture demo={demo} i={1} photos={photos} alt={`${name}, end position`} className={`${styles.frame} ${styles.end ?? ''}`} />
    </>
  );
  if (hero) {
    // The whole photo, never cropped (feet and bar stay in), over a soft blurred copy that fills the box.
    return (
      <span className={styles.hero} data-testid="demo-hero" style={vtName ? { viewTransitionName: vtName } : undefined}>
        <Picture demo={demo} i={0} photos={photos} alt="" lazy={false} fill className={styles.heroFill ?? ''} />
        {frames}
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
  return (
    <div className={styles.wrap} data-testid="form-demo" data-paused={paused || undefined} style={vtName ? { viewTransitionName: vtName } : undefined}>
      {onOpen ? (
        <button type="button" className={`${styles.stage} pressable`} onClick={onOpen} aria-label={`Show ${name} full screen`} data-testid="demo-stage">
          {frames}
        </button>
      ) : (
        <div className={styles.stage} data-testid="demo-stage">
          {frames}
        </div>
      )}
      {/* Pause is a visible glyph in the corner, never a hidden tap on the photo (hidden with reduced motion: nothing moves). */}
      <button type="button" className={`${styles.pause} pressable`} onClick={() => setPaused((p) => !p)} aria-pressed={paused} aria-label={paused ? 'Play demo' : 'Pause demo'}>
        {paused ? <PlayIcon width={14} height={14} strokeWidth={2.6} fill="currentColor" aria-hidden="true" /> : <PauseIcon width={14} height={14} strokeWidth={2.6} fill="currentColor" aria-hidden="true" />}
      </button>
    </div>
  );
}
