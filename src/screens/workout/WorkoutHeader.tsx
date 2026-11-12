import { useLayoutEffect, useRef, useState } from 'react';
import { BackButton } from '../../ui/BackButton';
import { IconButton } from '../../ui/IconButton';
import { ChevronDown } from '../../ui/icons';
import { Odometer } from '../../ui/Odometer';
import { formatTotal, totalLifted } from '../../lib/load';
import { formatElapsed } from '../../lib/timer';
import { workSetCount } from '../../lib/workSets';
import type { useNav } from '../../ui/nav';
import type { Workout } from './useWorkout';
import styles from './Workout.module.css';

type Props = {
  w: Workout;
  now: number;
  exerciseId: string | null;
  go: ReturnType<typeof useNav>;
  onBack: () => void;
  onFinish: () => void;
};

/** The live header: back (or minimize), the clock, the sets and Total lifted line, and Finish. */
export function WorkoutHeader({ w, now, exerciseId, go, onBack, onFinish }: Props) {
  // The stats line drops the words "Total lifted" when the full line would wrap (round 2, P5).
  const statsRef = useRef<HTMLDivElement>(null);
  const measureRef = useRef<HTMLSpanElement>(null);
  const [tight, setTight] = useState(false);
  useLayoutEffect(() => {
    const box = statsRef.current;
    const m = measureRef.current;
    if (!box || !m || typeof ResizeObserver === 'undefined') return;
    const fit = () => {
      const room = box.clientWidth - (parseFloat(getComputedStyle(box).paddingLeft) || 0);
      setTight(m.scrollWidth > room + 0.5);
    };
    fit();
    const ro = new ResizeObserver(fit);
    ro.observe(box);
    ro.observe(m);
    return () => ro.disconnect();
  }, [w.ready]);

  const startedAt = w.session?.startedAt;
  const unit = w.gym?.unit ?? 'lb';
  // Warm ups never count toward Total lifted (SPEC 21.1).
  const lifted = totalLifted(w.sets.filter((s) => s.kind !== 'warmup'), unit);
  return (
    <header className={styles.topBar}>
      {exerciseId ? (
        <BackButton onPress={onBack} label="Back to the list" />
      ) : (
        // Back to the tabs; the workout keeps going (the resume bar brings it back).
        <IconButton label="Minimize workout" onPress={() => go('/', { kind: 'down' })}>
          <ChevronDown strokeWidth={2.4} />
        </IconButton>
      )}
      <div className={styles.stats} ref={statsRef}>
        <span className={`${styles.clock} num`} data-testid="elapsed" role="timer" aria-live="off">
          {startedAt ? formatElapsed((now - startedAt) / 1000) : w.error ? '' : '0:00'}
        </span>
        <span className={`${styles.statLine} num`} data-testid="live-stats">
          {/* No count the app is not sure of while a read failed (PLAN 1.7h). */}
          {w.error ? null : (
            <>
              <Odometer value={workSetCount(w.sets)} /> {workSetCount(w.sets) === 1 ? 'set' : 'sets'}
              {lifted > 0 ? (
                <>
                  {' · '}
                  {/* Large text on a narrow phone: "1 set · 1,080 lb" on screen, one line (round 2, P5);
                      the words stay for screen readers, hidden by clip-path (round 4: not an
                      overflow clip, which would read as cut off text). */}
                  {tight ? <span className={styles.srText}>Total lifted </span> : 'Total lifted '}
                  {formatTotal(lifted, unit)}
                </>
              ) : (
                ''
              )}
            </>
          )}
        </span>
        {/* The full line as plain text, unseen: does it fit on one line? */}
        <span ref={measureRef} className={`${styles.statLine} ${styles.statMeasure} num`} aria-hidden="true">
          {`${workSetCount(w.sets)} ${workSetCount(w.sets) === 1 ? 'set' : 'sets'}${lifted > 0 ? ` · Total lifted ${formatTotal(lifted, unit)}` : ''}`}
        </span>
      </div>
      <button type="button" className={`${styles.finish} pressable`} onClick={onFinish}>
        Finish
      </button>
    </header>
  );
}
