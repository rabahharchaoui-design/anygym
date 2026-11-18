import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { tick } from '../../ui/haptics';
import styles from './Countdown.module.css';

export const COUNT_FROM = 3;
const STEP_MS = 1000;
/** GO stays this long, then the screen goes dark into the live run. */
export const GO_MS = 650;
/** The last part of GO: the layer darkens to the live screen's black. */
const DARK_MS = 220;

/** 3, 2, 1, then 0: GO. */
type Beat = number;

type Props = {
  reduceMotion: boolean;
  /** Called once, after GO. */
  onDone: () => void;
  onCancel: () => void;
};

/**
 * The 3, 2, 1, GO before a run (SPEC 12.1, PLAN 4.4a). A full screen graphite layer with one giant
 * ice number at a time; each arrives with a tick and a short scale and fade (CSS keyframes on
 * transform and opacity only, so the compositor runs them and nothing is measured or injected).
 * GO lights the whole layer ice, then it darkens into the live screen's black. The beats are timed
 * from the first frame, so a slow phone never stretches the count. Cancel, or leaving the app,
 * stops it: a run never starts by itself minutes later. Reduced motion: fades only.
 */
export function Countdown({ reduceMotion, onDone, onCancel }: Props) {
  const [beat, setBeat] = useState<Beat>(COUNT_FROM);
  const [dark, setDark] = useState(false);
  const ended = useRef(false);
  const cb = useRef({ onDone, onCancel });
  cb.current = { onDone, onCancel };

  useEffect(() => {
    const end = (how: 'onDone' | 'onCancel') => {
      if (ended.current) return;
      ended.current = true;
      cb.current[how]();
    };
    const t0 = performance.now();
    const timers: number[] = [];
    // Each beat lands at its own time from the start: a late timer never pushes the next one.
    const at = (ms: number, fn: () => void) => timers.push(window.setTimeout(fn, Math.max(0, t0 + ms - performance.now())));
    tick();
    for (let k = 1; k <= COUNT_FROM; k += 1) {
      at(k * STEP_MS, () => {
        tick();
        setBeat(COUNT_FROM - k);
      });
    }
    const goAt = COUNT_FROM * STEP_MS;
    at(goAt + GO_MS - DARK_MS, () => setDark(true));
    at(goAt + GO_MS, () => end('onDone'));
    const onHide = () => {
      if (document.visibilityState === 'hidden') end('onCancel');
    };
    document.addEventListener('visibilitychange', onHide);
    return () => {
      for (const t of timers) window.clearTimeout(t);
      document.removeEventListener('visibilitychange', onHide);
    };
  }, []);

  const go = beat === 0;
  const label = go ? 'Go' : `Starting in ${beat}`;
  return createPortal(
    <div
      className={styles.count}
      data-testid="run-countdown"
      data-beat={go ? 'go' : beat}
      data-dark={dark || undefined}
      data-reduce={reduceMotion || undefined}
      role="dialog"
      aria-modal="true"
      aria-label="Starting your run"
    >
      <span className={styles.glow} aria-hidden="true" />
      <span className={styles.ice} aria-hidden="true" />
      <p className={styles.kicker} aria-hidden="true">
        {go ? 'Run' : 'Get ready'}
      </p>
      <div className={styles.stage} role="timer" aria-live="assertive" aria-atomic="true" aria-label={label}>
        {/* A new key for every beat: the browser starts its arrival animation afresh. */}
        <span key={beat} className={`${styles.number} num`} data-go={go || undefined} data-testid="run-count">
          {go ? 'GO' : beat}
        </span>
      </div>
      <div className={styles.foot}>
        <span className={styles.pips} aria-hidden="true">
          {Array.from({ length: COUNT_FROM }, (_, i) => (
            <span key={i} className={styles.pip} data-on={i <= COUNT_FROM - beat || undefined} />
          ))}
        </span>
        <button type="button" className={`${styles.cancel} pressable`} onClick={onCancel} data-testid="run-count-cancel" disabled={go}>
          Cancel
        </button>
      </div>
      <span className={styles.black} aria-hidden="true" />
    </div>,
    document.body,
  );
}
