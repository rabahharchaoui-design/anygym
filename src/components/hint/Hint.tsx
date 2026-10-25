import { useEffect, useSyncExternalStore } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import { HINT_TEXT, hints, type HintId } from '../../lib/hints';
import { FADE } from '../../ui/motion';
import styles from './Hint.module.css';

type Props = {
  id: HintId;
  /** Where the bubble sits; the parent positions it (absolute, no layout shift). */
  className?: string;
  /** Arrow points down (bubble above its target) or up (bubble below it). */
  point?: 'down' | 'up';
  /** Where the arrow sits: the middle of the bubble, or near its right end (a target at the right edge). */
  arrow?: 'center' | 'end';
  /** Compact: one short line that fits over a column header (the set table). */
  compact?: boolean;
};

const POP = { type: 'spring', visualDuration: 0.22, bounce: 0.2 } as const;

/**
 * First time hint (SPEC 13.5): one short line in a soft bubble, shown once. Any tap anywhere
 * dismisses it, so it never blocks the control underneath (it does not take pointer events).
 */
export function Hint({ id, className, point = 'down', arrow = 'center', compact = false }: Props) {
  const reduce = useReducedMotion();
  const active = useSyncExternalStore(hints.subscribe, hints.active, () => null) === id;

  useEffect(() => {
    hints.claim(id);
    return () => hints.release(id);
  }, [id]);

  useEffect(() => {
    if (!active) return;
    const done = () => hints.dismiss(id);
    const events = ['pointerdown', 'touchstart', 'mousedown', 'keydown'] as const;
    for (const e of events) document.addEventListener(e, done, { capture: true, passive: true });
    return () => {
      for (const e of events) document.removeEventListener(e, done, { capture: true });
    };
  }, [active, id]);

  return (
    <div className={`${styles.anchor} ${className ?? ''}`} aria-live="polite">
      <AnimatePresence>
        {active && (
          <motion.p
            key={id}
            className={styles.bubble}
            data-point={point}
            data-arrow={arrow}
            data-compact={compact || undefined}
            data-testid="hint"
            data-hint={id}
            initial={reduce ? { opacity: 0 } : { opacity: 0, scale: 0.94, y: point === 'down' ? 4 : -4 }}
            animate={reduce ? { opacity: 1 } : { opacity: 1, scale: 1, y: 0 }}
            exit={reduce ? { opacity: 0, transition: FADE } : { opacity: 0, scale: 0.97, transition: { duration: 0.14 } }}
            transition={reduce ? FADE : POP}
          >
            {HINT_TEXT[id]}
          </motion.p>
        )}
      </AnimatePresence>
    </div>
  );
}
