import { useMemo, useState } from 'react';
import { TopBar } from '../../ui/TopBar';
import { BackButton } from '../../ui/BackButton';
import { Skeleton } from '../../ui/Skeleton';
import { Segmented } from '../../ui/Segmented';
import { EmptyState } from '../../ui/EmptyState';
import { LoadError } from '../../components/LoadError';
import { useFinishedRuns } from '../../hooks/useRuns';
import { useReducedMotionLive } from '../../ui/useReducedMotionLive';
import { formatElapsed } from '../../lib/timer';
import { currentCity, distanceWithUnit, heatmapRoute, measurableRuns, recordBoard, runsInCity } from '../../lib/run';
import { RouteMap } from '../run/RouteMap';
import { workoutDate } from './historyWords';
import styles from './History.module.css';

/**
 * Run records and the heatmap (PLAN 4.6, SPEC 12.9). Records: the best each distance was ever run,
 * "Not yet" where no run has covered it. Heatmap: every run in the current city (the city of the
 * latest run that has one); runs with no stored city are drawn together as "All runs", never given a guessed city.
 */
export function RunRecords() {
  const all = useFinishedRuns();
  const reduce = useReducedMotionLive();
  const [view, setView] = useState<'records' | 'heatmap'>('records');
  const runs = all.data?.runs;
  const unit = all.data?.unit ?? 'km';
  const board = useMemo(() => (runs ? recordBoard(runs) : []), [runs]);
  const city = runs ? currentCity(runs) : null;
  const shown = useMemo(() => (runs ? (city ? runsInCity(runs, city) : measurableRuns(runs)) : []), [runs, city]);
  const geo = useMemo(() => heatmapRoute(shown), [shown]);
  return (
    <>
      <TopBar title="Run records" leading={<BackButton to="/history" label="Back to History" />} />
      {all.error ? <LoadError text="Could not load runs" onRetry={all.retry} /> : null}
      {!all.ready ? (
        <Skeleton height={180} />
      ) : (
        <>
          <Segmented
            label="View"
            value={view}
            onChange={setView}
            options={[
              { value: 'records', label: 'Records' },
              { value: 'heatmap', label: 'Heatmap' },
            ]}
          />
          {view === 'records' ? (
            <ul className={`${styles.list} ${styles.afterSwitch}`} aria-label="Personal records" data-testid="run-records">
              {board.map((s) => (
                <li key={s.id} className={styles.record} data-testid="run-record" data-held={s.hit ? true : undefined}>
                  <span className={styles.rowTitle}>{s.title}</span>
                  <span className={`${styles.rowCount} num`}>{s.hit ? (s.id === 'long' ? distanceWithUnit(s.hit.value, unit) : formatElapsed(s.hit.value)) : 'Not yet'}</span>
                  {s.hit && <span className={`${styles.rowSub} num`}>{workoutDate(s.hit.endedAt)}</span>}
                </li>
              ))}
            </ul>
          ) : geo.bounds ? (
            <section className={styles.afterSwitch} aria-label="Heatmap" data-testid="run-heatmap">
              <p className={styles.meta}>{city ? `${city}: ${shown.length} ${shown.length === 1 ? 'run' : 'runs'}` : `All runs: ${shown.length}`}</p>
              <RouteMap route={geo} reduceMotion={reduce} many resize={shown.length} />
            </section>
          ) : (
            <EmptyState scene="history" title="No routes yet" next="Runs with a GPS route show up here, all on one map." />
          )}
        </>
      )}
    </>
  );
}
