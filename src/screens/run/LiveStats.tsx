import type { DistanceUnit } from '../../lib/intake/answers';
import type { TrackerReading } from '../../lib/gps';
import { formatDistance, formatPace, paceUnit, spokenPace, type GoalProgress, type IntervalReading, type LiveNoteWords } from '../../lib/run';
import { formatElapsed } from '../../lib/timer';
import { DataField } from '../../ui/DataField';
import { Divider } from '../../ui/Divider';
import { IntervalFace, IntervalsDone } from './IntervalFace';
import styles from './Live.module.css';
import iv from './Intervals.module.css';

export type Metric = 'distance' | 'time' | 'pace';
export const METRICS: readonly Metric[] = ['distance', 'time', 'pace'];
export const nextMetric = (m: Metric): Metric => METRICS[(METRICS.indexOf(m) + 1) % METRICS.length]!;

type Props = {
  reading: TrackerReading;
  unit: DistanceUnit;
  big: Metric;
  /** The one line of state over the numbers (lib/run/liveNote). Null while the run simply goes on. */
  note: LiveNoteWords;
  goal: GoalProgress | null;
  /** Paused by hand: the numbers step back. */
  paused: boolean;
  /** An interval run (SPEC 12.7): where its blocks are. Null on every other run. */
  intervals: IntervalReading | null;
};

type Face = { label: string; value: string; unit?: string; spoken: string };

function faceOf(metric: Metric, r: TrackerReading, unit: DistanceUnit): Face {
  if (metric === 'distance') {
    const value = formatDistance(r.distanceM, unit);
    return { label: 'Distance', value, unit, spoken: `${value} ${unit === 'mi' ? 'miles' : 'kilometers'}` };
  }
  if (metric === 'time') {
    const value = formatElapsed(r.movingSec);
    return { label: 'Time', value, spoken: `${value} moving time` };
  }
  // No trusted pace prints "--": DataField shows that as its honest blank.
  return { label: 'Pace', value: formatPace(r.currentPace, unit), unit: paceUnit(unit), spoken: `Pace: ${spokenPace(r.currentPace, unit)}` };
}

/**
 * The stats page (SPEC 12.2, PLAN M2, board 06): full width fields stacked from the top, a small
 * capital label, a giant number and its unit, a hairline between them. The big one (distance by
 * default) is on top at hero size; a tap anywhere on the numbers makes the next one big and it moves
 * to the top. A number the run cannot trust yet (no pace at the start, after a GPS gap) is the data
 * field's honest blank. During interval blocks the ring is on top and the three numbers sit in one
 * row under it.
 */
export function LiveStats({ reading, unit, big, note, goal, paused, intervals }: Props) {
  const blocks = intervals && !intervals.done ? intervals : null;
  const rest = METRICS.filter((m) => m !== big);
  const field = (m: Metric, size: 'hero' | 'large' | 'medium') => {
    const f = faceOf(m, reading, unit);
    const hero = size === 'hero';
    return (
      <DataField
        key={m}
        label={f.label}
        value={f.value}
        unit={f.unit}
        size={size}
        spoken={f.spoken}
        className={styles.field}
        testId={hero ? 'live-big-field' : `live-small-${m}`}
        labelTestId={hero ? 'live-big-label' : undefined}
        numberTestId={hero ? 'live-big' : undefined}
        numberData={hero ? { 'data-metric': m } : undefined}
      />
    );
  };
  return (
    <div className={styles.stats} data-testid="live-stats" data-paused={paused || undefined} data-blocks={blocks ? true : undefined}>
      <p className={styles.note} data-tone={note?.tone} data-testid="live-note" role="status">
        {note?.text ?? ''}
      </p>
      {blocks ? (
        <>
          <IntervalFace reading={blocks} paused={paused} />
          <div className={iv.trio}>{METRICS.map((m) => field(m, 'medium'))}</div>
        </>
      ) : (
        <div key={big} className={styles.stack}>
          {field(big, 'hero')}
          {rest.map((m) => (
            <div key={m} className={styles.rest}>
              <Divider />
              {field(m, 'large')}
            </div>
          ))}
        </div>
      )}
      {intervals?.done && <IntervalsDone />}
      {goal && (
        <div className={styles.goal} data-testid="live-goal" data-reached={goal.reached || undefined}>
          <span className={styles.goalLine}>
            <span data-testid="live-goal-line">{goal.line}</span>
            <span className={styles.goalLabel}>{goal.label}</span>
          </span>
          <span className={styles.goalBar} role="progressbar" aria-label={goal.label} aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(goal.fraction * 100)}>
            <span className={styles.goalFill} style={{ transform: `scaleX(${goal.fraction})` }} />
          </span>
        </div>
      )}
    </div>
  );
}
