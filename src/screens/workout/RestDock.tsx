import { useEffect, useRef } from 'react';
import { motion, useReducedMotion } from 'motion/react';
import { FADE, SHEET_SPRING } from '../../ui/motion';
import { useNow } from '../../hooks/useNow';
import { REST_STEP_SEC, isRestDone, remainingSec, restFraction, type Rest } from '../../lib/rest';
import { formatElapsed } from '../../lib/timer';
import { playTone } from '../../lib/tone';
import { Ring } from '../../ui/Ring';
import { Odometer } from '../../ui/Odometer';
import { CheckIcon } from '../../ui/icons';
import { buzz } from '../../ui/haptics';
import styles from './Workout.module.css';

type Props = {
  rest: Rest;
  onExtend: () => void;
  onShorten: () => void;
  onSkip: () => void;
  onDone: () => void;
};

/** How long "Rest over" stays before the bar goes away. */
const DONE_LINGER_MS = 2500;

/** Rest timer (SPEC 5.1, 21.1): a slim bar at the bottom with a ring countdown, −15, +15 and Skip, a soft tone at 0. */
export function RestDock({ rest, onExtend, onShorten, onSkip, onDone }: Props) {
  const reduce = useReducedMotion();
  const now = useNow(250);
  const done = isRestDone(rest, now);
  // Tone only when we watched it reach 0, not when reopening the app long after.
  const sawRunning = useRef(!isRestDone(rest, Date.now()));
  // The latest onDone, read when the linger ends: the screen passes a new callback on every render
  // (its clock ticks each second), which must not restart the 2.5 s wait (PLAN 1.7h).
  const onDoneRef = useRef(onDone);
  onDoneRef.current = onDone;

  useEffect(() => {
    if (!done) {
      sawRunning.current = true;
      return;
    }
    if (sawRunning.current) {
      sawRunning.current = false;
      playTone();
      buzz([120, 80, 120]);
    }
    const t = window.setTimeout(() => onDoneRef.current(), DONE_LINGER_MS);
    return () => window.clearTimeout(t);
  }, [done]);

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
      <Ring fraction={fraction} size={44} stroke={5} glideMs={260} full={done}>
        {done ? <CheckIcon width={20} height={20} strokeWidth={3} /> : null}
      </Ring>
      <div className={styles.restText}>
        <span className={styles.restLabel}>{done ? 'Rest over' : 'Rest'}</span>
        <span className={`${styles.restClock} num`} data-testid="rest-clock">
          {done ? 'Go' : <Odometer value={formatElapsed(left)} />}
        </span>
      </div>
      <button type="button" className={`${styles.restButton} pressable`} onClick={onShorten} disabled={done} aria-label={`Take off ${REST_STEP_SEC} seconds`}>
        −{REST_STEP_SEC}
      </button>
      <button type="button" className={`${styles.restButton} pressable`} onClick={onExtend} aria-label={`Add ${REST_STEP_SEC} seconds`}>
        +{REST_STEP_SEC}
      </button>
      <button type="button" className={`${styles.restButton} pressable`} onClick={onSkip}>
        {done ? 'Close' : 'Skip'}
      </button>
    </motion.div>
  );
}
