import { blockEffort, blockLabel, countdown, type IntervalReading } from '../../lib/run';
import { Ring } from '../../ui/Ring';
import styles from './Intervals.module.css';

type Props = { reading: IntervalReading; /** Paused by hand: the block stands still. */ paused: boolean };

/**
 * The current interval block (SPEC 12.7): a big ring that empties as the block runs out, the block's
 * name (RUN, WALK) over the countdown, and which round it is. The ring and the name wear the
 * block's colour: the accent for a push, amber for an easy block.
 */
export function IntervalFace({ reading, paused }: Props) {
  const block = reading.block;
  if (!block) return null;
  const name = blockLabel(block.name);
  const left = countdown(reading.leftMs);
  return (
    <div
      className={styles.face}
      data-testid="interval-face"
      data-effort={blockEffort(block.name)}
      data-block={block.name}
      data-index={reading.index}
      data-paused={paused || undefined}
      role="timer"
      aria-label={`${name}. ${left} left. Round ${reading.round} of ${reading.rounds}.`}
    >
      <Ring fraction={reading.left} size={200} stroke={11} glideMs={paused ? 0 : 250} className={styles.ring}>
        <span className={styles.inner}>
          {/* A new block's name comes in on its own (keyed), so the switch is seen as well as heard. */}
          <span key={reading.index} className={styles.name} data-testid="interval-name">
            {name.toUpperCase()}
          </span>
          <span className={`${styles.count} num`} data-testid="interval-count">
            {left}
          </span>
          <span className={styles.round} data-testid="interval-round">
            {reading.round} of {reading.rounds}
          </span>
        </span>
      </Ring>
    </div>
  );
}

/** After the last block: one quiet line, the run goes on as a free run. */
export function IntervalsDone() {
  return (
    <p className={styles.done} data-testid="intervals-done">
      Intervals done. Keep going as long as you like.
    </p>
  );
}
