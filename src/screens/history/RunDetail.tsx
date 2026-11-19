import { useMemo } from 'react';
import { Navigate, useParams } from 'react-router-dom';
import { TopBar } from '../../ui/TopBar';
import { BackButton } from '../../ui/BackButton';
import { Skeleton } from '../../ui/Skeleton';
import { LoadError } from '../../components/LoadError';
import { useFinishedRuns } from '../../hooks/useRuns';
import { useReducedMotionLive } from '../../ui/useReducedMotionLive';
import { DASHED_NOTE, drawRoute, ghostResult, ghostWords, paceUnit, summaryOf, titlesHeldBy, runVerdict } from '../../lib/run';
import { fromRunPoint } from '../../lib/gps';
import { RouteMap } from '../run/RouteMap';
import { RunShare } from '../run/RunShare';
import { RunSplits } from '../run/RunSplits';
import { runTitle, workoutDate } from './historyWords';
import styles from './History.module.css';
import run from '../run/Summary.module.css';

/** One finished run (PLAN 4.6, SPEC 12.9): the whole route and its splits, the numbers, the records it holds, share and GPX. */
export function RunDetail() {
  const { runId = '' } = useParams();
  const all = useFinishedRuns();
  const reduce = useReducedMotionLive();
  const data = all.data;
  const row = data?.runs.find((r) => r.id === runId);
  const unit = data?.unit ?? 'km';
  const route = useMemo(() => (row ? drawRoute(row.points.map(fromRunPoint), row.gaps) : null), [row]);
  if (all.ready && !all.error && !row) return <Navigate to="/history" replace />;
  const ok = row ? runVerdict(row) === 'ok' : false;
  const summary = row ? summaryOf(row, unit) : null;
  const held = row && data ? titlesHeldBy(row, data.runs) : [];
  const ghost = row && data ? ghostWords(ghostResult(row, data.runs), unit) : null;
  return (
    <>
      <TopBar title={row ? runTitle(row) : 'Run'} leading={<BackButton to="/history" label="Back to History" />}>
        {row && <p className={`${styles.meta} num`}>{workoutDate(row.startedAt)}</p>}
      </TopBar>
      {all.error ? <LoadError text="Could not load this run" onRetry={all.retry} /> : null}
      {!row || !summary || !route ? (
        !all.error && <Skeleton height={180} radius={20} />
      ) : !ok ? (
        <p className={styles.meta} data-testid="run-detail-plain">
          This run has no distance to show: the phone had no GPS for it.
        </p>
      ) : (
        <div data-testid="run-detail">
          <dl className={run.facts}>
            <div className={run.fact}>
              <dd className="num" data-testid="detail-distance">{summary.distance} {unit}</dd>
              <dt>Distance</dt>
            </div>
            <div className={run.fact}>
              <dd className="num" data-testid="detail-time">{summary.time}</dd>
              <dt>Moving time</dt>
            </div>
            <div className={run.fact}>
              <dd className="num" data-testid="detail-pace">{summary.pace}</dd>
              <dt>Average pace {paceUnit(unit)}</dt>
            </div>
          </dl>
          {held.length > 0 && (
            <p className={run.ghost} data-testid="detail-records">
              Your record: {held.join(', ')}
            </p>
          )}
          {ghost && <p className={run.ghost}>{ghost}</p>}
          <RouteMap route={route} reduceMotion={reduce} />
          {route.dashed.length > 0 && <p className={run.quiet}>{DASHED_NOTE}</p>}
          <RunSplits run={row} unit={unit} />
          <RunShare run={row} unit={unit} />
        </div>
      )}
    </>
  );
}
