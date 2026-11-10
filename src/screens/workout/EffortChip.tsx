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

export function EffortChip({ sessionId, exerciseId, onAnswered, compact = false }: { sessionId: string; exerciseId: string; onAnswered?: () => void; /** PLAN 3.8c: the one-row version on the day list (no hints, no note). */ compact?: boolean }) {
  const id = useId();
  const box = useRef<HTMLDivElement>(null);
  const reduce = useReducedMotionLive();
  // PLAN 3.8b/3.8c: on a roomy phone the prompt sits under the last set, which can be behind the "Nice.
  // Next" chip and the rest bar: scroll just enough to clear them, but never when that would push the
  // guide ("Beat last time") or the set table out of the first screen. Then it stays below the fold
  // (the day list offers the same question under the exercise's row).
  useEffect(() => {
    if (compact) return;
    const el = box.current;
    if (!el) return;
    const t = window.setTimeout(() => {
      const buttons = el.querySelector<HTMLElement>('[data-row]') ?? el;
      let scroller: HTMLElement | null = el.parentElement;
      while (scroller && !(scroller.scrollHeight > scroller.clientHeight + 2 && /auto|scroll/.test(getComputedStyle(scroller).overflowY))) scroller = scroller.parentElement;
      if (!scroller) return;
      const covers = Array.from(document.querySelectorAll<HTMLElement>('[data-testid="next-chip"], [data-testid="rest-timer"]')).map((c) => c.getBoundingClientRect().top);
      const cover = Math.min(window.innerHeight, ...covers);
      const keep = document.querySelector<HTMLElement>('[data-testid="set-next"]') ?? document.querySelector<HTMLElement>('[data-testid="set-row"]');
      const floor = scroller.getBoundingClientRect().top + 8;
      // The whole prompt if that still leaves the guide in view, else just the three buttons.
      const need = [el, buttons].map((x) => x.getBoundingClientRect().bottom + 4 - cover).find((n) => n <= 0 || !keep || keep.getBoundingClientRect().top - n >= floor);
      if (need === undefined || need <= 0) return;
      scroller.scrollBy({ top: need, behavior: reduce ? 'auto' : 'smooth' });
    }, 150);
    return () => window.clearTimeout(t);
    // Once per time it appears; a later motion setting change must not scroll the page.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const live = useLive(() => effortOf(sessionId, exerciseId), [sessionId, exerciseId]);
  const [failed, setFailed] = useState(false);
  // Shown at once on a tap (the write follows), so the press answers within a frame.
  const [optimistic, setOptimistic] = useState<{ value: Effort | null } | null>(null);
  const effort = optimistic ? optimistic.value : (live.data?.effort ?? null);
  const last = live.data?.last ?? null;
  const lastTap = useRef<{ e: Effort; at: number } | null>(null);
  const pick = (e: Effort) => {
    // SPEC 13.3: a double tap never undoes itself. A repeat of the same chip within 600 ms is ignored, and
    // on the day list row a tap never clears (the row goes away after the first save).
    const now = Date.now();
    const prev = lastTap.current;
    lastTap.current = { e, at: now };
    if (prev && prev.e === e && now - prev.at < 600) return;
    if (compact && effort === e) return;
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
    <div ref={box} className={styles.effort} data-compact={compact || undefined} role="group" aria-labelledby={id} data-testid={compact ? 'list-effort' : 'effort'}>
      <span id={id} className={styles.q}>
        How did that feel?
      </span>
      <div className={styles.row} data-row>
        {EFFORTS.map((e) => (
          <button
            key={e}
            type="button"
            className={`${styles.choice} pressable`}
            aria-pressed={effort === e}
            aria-label={`${EFFORT_WORDS[e]}: ${EFFORT_HINT[e]}`}
            data-default={(!effort && last === e) || undefined}
            data-testid={compact ? `list-effort-${e}` : `effort-${e}`}
            disabled={!live.ready}
            onClick={() => pick(e)}
          >
            <span className={styles.label}>{EFFORT_WORDS[e]}</span>
            {!compact && <span className={styles.hint}>{EFFORT_HINT[e]}</span>}
          </button>
        ))}
      </div>
      {(!compact || failed) && (
        <span className={styles.note} role="status" data-testid={compact ? 'list-effort-error' : 'effort-note'}>
          {note}
        </span>
      )}
    </div>
  );
}
