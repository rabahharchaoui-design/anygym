import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { AnimatePresence, motion } from 'motion/react';
import { tick } from '../../ui/haptics';
import { FADE, SPRING, TAP_SPRING } from '../../ui/motion';
import styles from './Countdown.module.css';

export const COUNT_FROM = 3;
const STEP_MS = 1000;

/** Where the Start button was (viewport px): the countdown grows out of it. */
export type Origin = { x: number; y: number; size: number };

type Props = {
  origin: Origin;
  reduceMotion: boolean;
  /** Called once, after 1. */
  onDone: () => void;
  onCancel: () => void;
};

/**
 * The 3, 2, 1 before a run (SPEC 12.1). The Start button's own colour floods the screen from
 * where the button was, so it is clear what the tap started; each number springs in with a tick.
 * Cancel, or leaving the app, stops it: a run never starts by itself minutes later.
 * Reduced motion: the flood and the numbers fade, nothing moves.
 */
export function Countdown({ origin, reduceMotion, onDone, onCancel }: Props) {
  const [n, setN] = useState(COUNT_FROM);
  const ended = useRef(false);
  const cb = useRef({ onDone, onCancel });
  cb.current = { onDone, onCancel };

  useEffect(() => {
    const end = (how: 'onDone' | 'onCancel') => {
      if (ended.current) return;
      ended.current = true;
      cb.current[how]();
    };
    let left = COUNT_FROM;
    const timer = window.setInterval(() => {
      left -= 1;
      if (left <= 0) {
        window.clearInterval(timer);
        end('onDone');
        return;
      }
      tick();
      setN(left);
    }, STEP_MS);
    const onHide = () => {
      if (document.visibilityState === 'hidden') end('onCancel');
    };
    document.addEventListener('visibilitychange', onHide);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener('visibilitychange', onHide);
    };
  }, []);

  // Far enough to cover the farthest corner from the button.
  const reach = Math.hypot(Math.max(origin.x, window.innerWidth - origin.x), Math.max(origin.y, window.innerHeight - origin.y));
  const cover = (reach * 2) / origin.size + 0.1;
  return createPortal(
    <div className={styles.count} data-testid="run-countdown" role="dialog" aria-modal="true" aria-label="Starting your run">
      <motion.span
        className={styles.flood}
        style={{ left: origin.x - origin.size / 2, top: origin.y - origin.size / 2, width: origin.size, height: origin.size }}
        initial={reduceMotion ? { scale: cover, opacity: 0 } : { scale: 1, opacity: 1 }}
        animate={{ scale: cover, opacity: 1 }}
        transition={reduceMotion ? FADE : SPRING}
        aria-hidden="true"
      />
      <div className={styles.stage} role="timer" aria-live="assertive" aria-atomic="true" aria-label={`Starting in ${n}`}>
        <AnimatePresence mode="popLayout" initial>
          <motion.span
            key={n}
            className={`${styles.number} num`}
            data-testid="run-count"
            initial={reduceMotion ? { opacity: 0 } : { opacity: 0, scale: 0.6 }}
            animate={reduceMotion ? { opacity: 1 } : { opacity: 1, scale: 1 }}
            exit={reduceMotion ? { opacity: 0 } : { opacity: 0, scale: 1.2 }}
            transition={reduceMotion ? FADE : TAP_SPRING}
          >
            {n}
          </motion.span>
        </AnimatePresence>
      </div>
      <button type="button" className={`${styles.cancel} pressable`} onClick={onCancel} data-testid="run-count-cancel">
        Cancel
      </button>
    </div>,
    document.body,
  );
}
