import { useMemo } from 'react';
import type { Run } from '../../db/types';
import type { DistanceUnit } from '../../lib/intake/answers';
import { SPLIT_GAP, bestSplitIndexes, summaryOf } from '../../lib/run';
import styles from './Summary.module.css';

/**
 * The splits of a stored run (SPEC 12.9): each full mile or km, the best one marked "Best" (two or
 * more timed splits, a split with a GPS gap is never the best), and "GPS gap" where a split has no
 * honest time. Used by the finish screen and the run's detail.
 */
export function RunSplits({ run, unit }: { run: Run; unit: DistanceUnit }) {
  const summary = useMemo(() => summaryOf(run, unit), [run, unit]);
  const best = useMemo(() => (summary.splits.filter((x) => x.time !== null).length > 1 ? bestSplitIndexes(run) : []), [run, summary]);
  return (
    <>
      <h3 className={styles.heading}>Splits</h3>
      {summary.splits.length === 0 ? (
        <p className={styles.quiet} data-testid="summary-no-splits">
          No full {summary.splitUnit === 'mi' ? 'mile' : 'kilometer'} yet. Splits show from the first one.
        </p>
      ) : (
        <ol className={styles.splits} data-testid="summary-splits">
          {summary.splits.map((s) => (
            <li key={s.n} className={styles.split} data-gap={s.time === null || undefined} data-best={best.includes(s.n - 1) || undefined}>
              <span>
                {summary.splitUnit === 'mi' ? 'Mile' : 'Km'} {s.n}
                {best.includes(s.n - 1) && <span className={styles.best}>Best</span>}
              </span>
              {s.time === null ? <span className={styles.splitGap}>{SPLIT_GAP}</span> : <span className="num">{s.time}</span>}
            </li>
          ))}
        </ol>
      )}
      {summary.anyGap && (
        <p className={styles.quiet} data-testid="summary-gap-note">
          GPS gap: part of that split has no time, so no split time is shown for it.
        </p>
      )}
    </>
  );
}
