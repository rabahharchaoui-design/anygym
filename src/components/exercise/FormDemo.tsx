import { useState } from 'react';
import { assetUrl } from '../../data/exerciseInfo';
import type { DemoImages } from '../../lib/exerciseInfo';
import styles from './FormDemo.module.css';

type Props = {
  demo: DemoImages;
  name: string;
  /** The small tile in the workout header: no dots, no pause (the tile opens the sheet instead). */
  compact?: boolean;
  /** View transition name, so the workout tile grows into the sheet's demo. */
  vtName?: string;
};

/** One photo: WebP with a JPG fallback, lazy, sized up front so nothing shifts when it loads. */
function Photo({ demo, i, name, className }: { demo: DemoImages; i: 0 | 1; name: string; className: string }) {
  return (
    <picture className={className} data-frame={i}>
      <source srcSet={assetUrl(demo.webp[i])} type="image/webp" />
      <img src={assetUrl(demo.jpg[i])} alt={`${name}, ${i === 0 ? 'start' : 'end'} position`} loading="lazy" decoding="async" width={640} height={427} draggable={false} />
    </picture>
  );
}

/**
 * The form demo (SPEC 4.4): start and end photos crossfading in a loop (1.2 s, 0.35 s fade,
 * 1.2 s, ease in out), tap to pause, a "1 / 2" dot pair. Reduced motion shows both side by side
 * (the compact tile then shows the start photo still). The loop is pure CSS, so it costs no
 * renders and stays on the compositor.
 */
export function FormDemo({ demo, name, compact = false, vtName }: Props) {
  const [paused, setPaused] = useState(false);
  const frames = (
    <>
      <Photo demo={demo} i={0} name={name} className={styles.frame ?? ''} />
      <Photo demo={demo} i={1} name={name} className={`${styles.frame} ${styles.end ?? ''}`} />
    </>
  );
  if (compact) {
    return (
      <span className={styles.tile} data-testid="demo-tile" style={vtName ? { viewTransitionName: vtName } : undefined}>
        {frames}
      </span>
    );
  }
  return (
    <div className={styles.wrap} data-testid="form-demo" data-paused={paused || undefined} style={vtName ? { viewTransitionName: vtName } : undefined}>
      <button type="button" className={`${styles.stage} pressable`} onClick={() => setPaused((p) => !p)} aria-pressed={paused} aria-label={paused ? 'Play demo' : 'Pause demo'}>
        {frames}
      </button>
      <div className={styles.dots} aria-hidden="true" data-testid="demo-dots">
        <span className={styles.dot} />
        <span className={`${styles.dot} ${styles.dotEnd}`} />
        <span className={styles.count}>{paused ? 'Paused' : '1 / 2'}</span>
      </div>
    </div>
  );
}
