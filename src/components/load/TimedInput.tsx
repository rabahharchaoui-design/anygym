import { useEffect, useState } from 'react';
import type { Load, Unit } from '../../db/types';
import { timedLoad } from '../../lib/load';
import {
  STOPPED,
  elapsedMs,
  formatClock,
  ringProgress,
  startWatch,
  stopWatch,
  wholeSeconds,
  type Stopwatch,
} from '../../lib/timer';
import { useTapGuard } from '../../hooks/useTapGuard';
import base from './LoadInput.module.css';
import styles from './TimedInput.module.css';

type Props = {
  unit: Unit;
  /** Optional target hold in seconds, drawn as a ring. */
  targetSeconds?: number;
  onChange: (load: Load) => void;
  /** Whole seconds held, on stop and on reset. */
  onSeconds: (seconds: number) => void;
};

const R = 104;
const C = 2 * Math.PI * R;
const TICK_MS = 200;

/** Timed (SPEC 5.2, 13.6): "Hold for" and a big start/stop timer, only on timed exercises. Time is read from Date.now(), so it stays right in the background. */
export function TimedInput({ unit, targetSeconds, onChange, onSeconds }: Props) {
  const [watch, setWatch] = useState<Stopwatch>(STOPPED);
  const [now, setNow] = useState(() => Date.now());
  const running = watch.startedAt !== null;

  useEffect(() => {
    if (!running) return;
    const tick = () => setNow(Date.now());
    const id = window.setInterval(tick, TICK_MS);
    document.addEventListener('visibilitychange', tick);
    return () => {
      window.clearInterval(id);
      document.removeEventListener('visibilitychange', tick);
    };
  }, [running]);

  const ms = elapsedMs(watch, now);
  const seconds = wholeSeconds(ms);
  const progress = ringProgress(ms, targetSeconds);

  const toggle = useTapGuard(() => {
    const t = Date.now();
    setNow(t);
    if (watch.startedAt === null) {
      setWatch(startWatch(watch, t));
      return;
    }
    const stopped = stopWatch(watch, t);
    setWatch(stopped);
    onChange(timedLoad(unit));
    onSeconds(wholeSeconds(stopped.accumulated));
  });

  const reset = () => {
    setWatch(STOPPED);
    setNow(Date.now());
    onSeconds(0);
  };

  const action = running ? 'Stop' : ms > 0 ? 'Start again' : 'Start';

  return (
    <div className={base.root}>
      <p className={`${base.label} ${styles.title}`} data-testid="picker-title">
        Hold for
      </p>
      <button
        type="button"
        className={`${styles.dial} pressable`}
        data-running={running}
        onClick={toggle}
        aria-label={`${action} timer`}
      >
        <svg className={styles.ring} viewBox="0 0 240 240" aria-hidden="true">
          <circle cx="120" cy="120" r={R} className={styles.track} />
          {targetSeconds ? (
            <circle
              cx="120"
              cy="120"
              r={R}
              className={styles.progress}
              data-done={progress >= 1}
              strokeDasharray={C}
              strokeDashoffset={C * (1 - progress)}
              transform="rotate(-90 120 120)"
            />
          ) : null}
        </svg>
        <span className={styles.face}>
          <span className={`${styles.clock} num`} data-testid="timer-clock" role="timer" aria-live="off">
            {formatClock(seconds)}
          </span>
          <span className={styles.action}>{action}</span>
        </span>
      </button>

      <div className={styles.footer}>
        <p className={base.sub} data-testid="timer-seconds">
          {seconds} s{targetSeconds ? ` of ${targetSeconds} s` : ''}
        </p>
        <button type="button" className={`${base.link} pressable`} onClick={reset} disabled={running || ms === 0}>
          Reset
        </button>
      </div>
    </div>
  );
}
