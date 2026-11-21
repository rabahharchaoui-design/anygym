import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Button } from '../../ui/Button';
import { buzz } from '../../ui/haptics';
import styles from './Countdown.module.css';

export const COUNT_FROM = 3;
const STEP_MS = 1000;
/** GO stays this long, then the screen goes dark into the live run. */
export const GO_MS = 650;
/** The last part of GO: the layer darkens to the live screen's black. */
const DARK_MS = 220;
/** One light tick on Android, the same as ui/haptics tick; on iPhone the best effort switch tick. */
const BEAT_TICK = [8];

/** 3, 2, 1, then 0: GO. */
type Beat = number;

type Props = {
  reduceMotion: boolean;
  /** Called once, after GO. */
  onDone: () => void;
  onCancel: () => void;
};

/**
 * The 3, 2, 1, GO before a run (SPEC 12.1, PLAN 4.4a, Monolith board 05 in PLAN M2). A full screen
 * flat graphite layer with one giant white number at a time (about 60% of the screen height); each
 * arrives with a tick and a short scale and fade (CSS keyframes on transform and opacity only, so the
 * compositor runs them and nothing is measured or injected). GO is the one ice word, then the layer
 * darkens into the live screen's black. The beats are timed
 * from the first frame, so a slow phone never stretches the count. Cancel, or leaving the app,
 * stops it: a run never starts by itself minutes later. Reduced motion: fades only.
 *
 * The tick of the first number is the caller's: it fires inside the tap that opened the countdown
 * (iPhone plays a tick only inside a tap, PLAN 4.4c). 2, 1 and GO arrive on their own, so they use
 * the best effort buzz; whether iPhone plays those is up to the phone.
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
    for (let k = 1; k <= COUNT_FROM; k += 1) {
      at(k * STEP_MS, () => {
        buzz(BEAT_TICK);
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
        <Button variant="quiet" className={styles.cancel} onClick={onCancel} data-testid="run-count-cancel" disabled={go}>
          Cancel
        </Button>
      </div>
      <span className={styles.black} aria-hidden="true" />
    </div>,
    document.body,
  );
}
