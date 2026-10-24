import { useEffect, useRef } from 'react';
import { motion, useReducedMotion } from 'motion/react';
import { FADE, SHEET_SPRING } from '../../components/motion';
import { useNow } from '../../hooks/useNow';
import { REST_STEP_SEC, isRestDone, remainingSec, restFraction, type Rest } from '../../lib/rest';
import { formatElapsed } from '../../lib/timer';
import { playTone } from '../../lib/tone';
import styles from './Workout.module.css';

type Props = { rest: Rest; onExtend: () => void; onSkip: () => void; onDone: () => void };

const R = 19;
const C = 2 * Math.PI * R;
/** How long "Rest over" stays before the bar goes away. */
const DONE_LINGER_MS = 2500;

/** Rest timer (SPEC 5.1): a small ring countdown in the bottom bar, +15 s and Skip, a soft tone at 0. */
export function RestDock({ rest, onExtend, onSkip, onDone }: Props) {
  const reduce = useReducedMotion();
  const now = useNow(250);
  const done = isRestDone(rest, now);
  // Tone only when we watched it reach 0, not when reopening the app long after.
  const sawRunning = useRef(!isRestDone(rest, Date.now()));

  useEffect(() => {
    if (!done) {
      sawRunning.current = true;
      return;
    }
    if (sawRunning.current) {
      sawRunning.current = false;
      playTone();
      navigator.vibrate?.([120, 80, 120]);
    }
    const t = window.setTimeout(onDone, DONE_LINGER_MS);
    return () => window.clearTimeout(t);
  }, [done, onDone]);

  const left = remainingSec(rest, now);
  const fraction = restFraction(rest, now);

  return (
    <motion.div
      className={styles.rest}
      data-done={done}
      data-testid="rest-timer"
      role="timer"
      aria-label={done ? 'Rest over' : `Rest, ${left} seconds left`}
      initial={reduce ? { opacity: 0 } : { opacity: 0, y: 24 }}
      animate={reduce ? { opacity: 1 } : { opacity: 1, y: 0 }}
      exit={reduce ? { opacity: 0 } : { opacity: 0, y: 24, transition: { duration: 0.16 } }}
      transition={reduce ? FADE : SHEET_SPRING}
    >
      <svg className={styles.restRing} viewBox="0 0 48 48" aria-hidden="true">
        <circle cx="24" cy="24" r={R} className={styles.restTrack} />
        <circle
          cx="24"
          cy="24"
          r={R}
          className={styles.restProgress}
          strokeDasharray={C}
          strokeDashoffset={C * (1 - fraction)}
          transform="rotate(-90 24 24)"
        />
      </svg>
      <div className={styles.restText}>
        <span className={styles.restLabel}>{done ? 'Rest over' : 'Rest'}</span>
        <span className={`${styles.restClock} num`} data-testid="rest-clock">
          {done ? 'Go' : formatElapsed(left)}
        </span>
      </div>
      <button type="button" className={`${styles.restButton} pressable`} onClick={onExtend} aria-label={`Add ${REST_STEP_SEC} seconds`}>
        +{REST_STEP_SEC} s
      </button>
      <button type="button" className={`${styles.restButton} pressable`} onClick={onSkip}>
        {done ? 'Close' : 'Skip'}
      </button>
    </motion.div>
  );
}
