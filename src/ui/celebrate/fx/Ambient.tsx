import { useEffect, useRef } from 'react';
import styles from './fx.module.css';

export type AmbientProps = { reduce?: boolean | null; className?: string };

/**
 * Calm drifting glass (PLAN 3.6h): a few faint panes and one soft ice blue light that move slowly
 * behind a summary. CSS transforms only (the compositor moves them; nothing is redrawn), it stops
 * while the page is hidden, and under reduced motion it is a still picture. It fills its
 * positioned parent, sits behind the content and takes no taps.
 */
export function Ambient({ reduce, className }: AmbientProps) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el || reduce) return;
    const sync = () => {
      el.dataset.state = document.visibilityState === 'hidden' ? 'paused' : 'running';
    };
    sync();
    document.addEventListener('visibilitychange', sync);
    return () => document.removeEventListener('visibilitychange', sync);
  }, [reduce]);
  return (
    <div ref={ref} className={`${styles.ambient} ${className ?? ''}`} aria-hidden="true" data-fx="ambient" data-state={reduce ? 'still' : 'running'} data-testid="celebrate-ambient">
      <span className={styles.light} />
      <span className={styles.pane} data-n="1" />
      <span className={styles.pane} data-n="2" />
      <span className={styles.pane} data-n="3" />
      <span className={styles.pane} data-n="4" />
    </div>
  );
}
