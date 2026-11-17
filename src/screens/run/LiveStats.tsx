import { useLayoutEffect, useRef } from 'react';
import type { DistanceUnit } from '../../lib/intake/answers';
import type { TrackerReading } from '../../lib/gps';
import { formatDistance, formatPace, paceUnit, spokenPace, type GoalProgress } from '../../lib/run';
import { formatElapsed } from '../../lib/timer';
import styles from './Live.module.css';

export type Metric = 'distance' | 'time' | 'pace';
export const METRICS: readonly Metric[] = ['distance', 'time', 'pace'];
export const nextMetric = (m: Metric): Metric => METRICS[(METRICS.indexOf(m) + 1) % METRICS.length]!;

/** The one line of state over the numbers. Null while the run simply goes on: nothing to say. */
export type LiveNote = { tone: 'paused' | 'auto' | 'wait'; text: string } | null;

type Props = {
  reading: TrackerReading;
  unit: DistanceUnit;
  big: Metric;
  note: LiveNote;
  goal: GoalProgress | null;
  /** Paused by hand: the numbers step back. */
  paused: boolean;
};

type Face = { value: string; label: string; spoken: string };

function faceOf(metric: Metric, r: TrackerReading, unit: DistanceUnit): Face {
  if (metric === 'distance') {
    const value = formatDistance(r.distanceM, unit);
    return { value, label: unit === 'mi' ? 'Miles' : 'Kilometers', spoken: `${value} ${unit === 'mi' ? 'miles' : 'kilometers'}` };
  }
  if (metric === 'time') {
    const value = formatElapsed(r.movingSec);
    return { value, label: 'Time', spoken: `${value} moving time` };
  }
  return { value: formatPace(r.currentPace, unit), label: `Pace ${paceUnit(unit)}`, spoken: `Pace: ${spokenPace(r.currentPace, unit)}` };
}

/**
 * The stats page (SPEC 12.2): pure black, one giant number, two smaller ones under it. A tap
 * anywhere on the numbers cycles which one is big; the new big number rises from the row below
 * (where it was small) and the row settles, so it is plain what changed. Plain CSS, so it runs on
 * the compositor; reduced motion fades only.
 */
export function LiveStats({ reading, unit, big, note, goal, paused }: Props) {
  const small = METRICS.filter((m) => m !== big);
  const bigFace = faceOf(big, reading, unit);
  // The giant number never spills past the screen: if it would (very large text, a long time), it
  // is scaled down to fit, whole.
  const bigRef = useRef<HTMLSpanElement>(null);
  useLayoutEffect(() => {
    const el = bigRef.current;
    const box = el?.closest<HTMLElement>(`.${styles.stats}`);
    if (!el || !box) return;
    const fit = () => {
      const k = Math.min(1, box.clientWidth / Math.max(1, el.offsetWidth));
      el.style.transform = k < 1 ? `scale(${k})` : '';
    };
    fit();
    const ro = typeof ResizeObserver === 'function' ? new ResizeObserver(fit) : null;
    ro?.observe(el);
    ro?.observe(box);
    return () => ro?.disconnect();
  }, [big, bigFace.value.length]);
  return (
    <div className={styles.stats} data-testid="live-stats" data-paused={paused || undefined}>
      <p className={styles.note} data-tone={note?.tone} data-testid="live-note" role="status">
        {note?.text ?? ''}
      </p>
      <div key={big} className={styles.bigBox}>
        <span ref={bigRef} className={`${styles.big} num`} data-len={bigFace.value.length > 5 ? 'long' : 'short'} data-testid="live-big" data-metric={big} aria-label={bigFace.spoken}>
          {bigFace.value}
        </span>
        <span className={styles.bigLabel} data-testid="live-big-label">
          {bigFace.label}
        </span>
      </div>
      <div className={styles.pair}>
        {small.map((m) => {
          const f = faceOf(m, reading, unit);
          return (
            <div key={m} className={styles.smallBox} data-testid={`live-small-${m}`}>
              <span className={`${styles.small} num`} aria-label={f.spoken}>
                {f.value}
              </span>
              <span className={styles.smallLabel}>{f.label}</span>
            </div>
          );
        })}
      </div>
      {goal && (
        <div className={styles.goal} data-testid="live-goal" data-reached={goal.reached || undefined}>
          <span className={styles.goalBar} role="progressbar" aria-label={goal.label} aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(goal.fraction * 100)}>
            <span className={styles.goalFill} style={{ transform: `scaleX(${goal.fraction})` }} />
          </span>
          <span className={styles.goalLine}>
            <span data-testid="live-goal-line">{goal.line}</span>
            <span className={styles.goalLabel}>{goal.label}</span>
          </span>
        </div>
      )}
    </div>
  );
}
