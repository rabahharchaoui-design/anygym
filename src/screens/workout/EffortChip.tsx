// "How did that feel?" after the last set of an exercise (PLAN 3.8, SPEC 15): Easy (3+ reps left),
// Good (1 to 2), Hard (none). One optional tap, never per set; tapping it again clears it. Last
// time's tap is offered as the default (a dashed edge) but only a tap saves anything.
import { useEffect, useId, useRef, useState } from 'react';
import { useReducedMotionLive } from '../../ui/useReducedMotionLive';
import { useLive } from '../../hooks/useLive';
import { effortOf, saveEffort } from '../../db/coach';
import { EFFORTS, EFFORT_HINT, EFFORT_WORDS, type Effort } from '../../lib/coach';
import { tick } from '../../ui/haptics';
import styles from './Effort.module.css';

export function EffortChip({ sessionId, exerciseId, onAnswered }: { sessionId: string; exerciseId: string; onAnswered?: () => void }) {
  const id = useId();
  const box = useRef<HTMLDivElement>(null);
  const reduce = useReducedMotionLive();
  // PLAN 3.8b: it appears under the last set, which on a short phone can be below the fold behind the
  // "Nice. Next" chip and the rest bar: bring it into view once (nearest: no move if already seen).
  useEffect(() => {
    box.current?.scrollIntoView({ block: 'nearest', behavior: reduce ? 'auto' : 'smooth' });
    // Once per time it appears; a later motion setting change must not scroll the page.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const live = useLive(() => effortOf(sessionId, exerciseId), [sessionId, exerciseId]);
  const [failed, setFailed] = useState(false);
  // Shown at once on a tap (the write follows), so the press answers within a frame.
  const [optimistic, setOptimistic] = useState<{ value: Effort | null } | null>(null);
  const effort = optimistic ? optimistic.value : (live.data?.effort ?? null);
  const last = live.data?.last ?? null;
  const pick = (e: Effort) => {
    const value = effort === e ? null : e;
    tick();
    setFailed(false);
    setOptimistic({ value });
    saveEffort(sessionId, exerciseId, value).then(
      () => {
        setOptimistic(null);
        // PLAN 3.8b: an answer lets the finished exercise move on (clearing one does not).
        if (value) onAnswered?.();
      },
      () => {
        setOptimistic(null);
        setFailed(true);
      },
    );
  };
  const note = failed ? 'Could not save that. Try again.' : effort ? 'Thanks. The coach uses this for next week.' : last ? `Last time: ${EFFORT_WORDS[last]}. Optional.` : 'Optional. It helps the coach set next week.';
  return (
    <div ref={box} className={styles.effort} role="group" aria-labelledby={id} data-testid="effort">
      <span id={id} className={styles.q}>
        How did that feel?
      </span>
      <div className={styles.row}>
        {EFFORTS.map((e) => (
          <button
            key={e}
            type="button"
            className={`${styles.choice} pressable`}
            aria-pressed={effort === e}
            aria-label={`${EFFORT_WORDS[e]}: ${EFFORT_HINT[e]}`}
            data-default={(!effort && last === e) || undefined}
            data-testid={`effort-${e}`}
            disabled={!live.ready}
            onClick={() => pick(e)}
          >
            <span className={styles.label}>{EFFORT_WORDS[e]}</span>
            <span className={styles.hint}>{EFFORT_HINT[e]}</span>
          </button>
        ))}
      </div>
      <span className={styles.note} role="status" data-testid="effort-note">
        {note}
      </span>
    </div>
  );
}
