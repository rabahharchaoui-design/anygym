import { useMemo } from 'react';
import { Navigate, useParams } from 'react-router-dom';
import { TopBar } from '../../ui/TopBar';
import { BackButton } from '../../ui/BackButton';
import { Skeleton } from '../../ui/Skeleton';
import { LoadError } from '../../components/LoadError';
import { useFinishedRuns } from '../../hooks/useRuns';
import { useReducedMotionLive } from '../../ui/useReducedMotionLive';
import { DASHED_NOTE, VERDICT_WORDS, drawRunRoute, ghostResult, ghostWords, summaryOf, titlesHeldBy, runVerdict } from '../../lib/run';
import { RouteMap } from '../run/RouteMap';
import { RunShare } from '../run/RunShare';
import { RunSplits } from '../run/RunSplits';
import { RunStats } from '../run/RunStats';
import { RunDiagExport } from './RunDiagExport';
import { runTitle, workoutDate } from './historyWords';
import styles from './History.module.css';
import run from '../run/Summary.module.css';

/**
 * One finished run (PLAN 4.6, SPEC 12.9): the whole route and its splits, the numbers, the records it holds, share and GPX.
 * PLAN M3: the same family as the finish screen: the route edge to edge first, the stat row, then the rest.
 */
export function RunDetail() {
  const { runId = '' } = useParams();
  const all = useFinishedRuns();
  const reduce = useReducedMotionLive();
  const data = all.data;
  const row = data?.runs.find((r) => r.id === runId);
  const unit = data?.unit ?? 'km';
  const route = useMemo(() => (row ? drawRunRoute(row) : null), [row]);
  if (all.ready && !all.error && !row) return <Navigate to="/history" replace />;
  const verdict = row ? runVerdict(row) : null;
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
        !all.error && <Skeleton height={180} />
      ) : verdict !== 'ok' ? (
        <p className={styles.meta} data-testid="run-detail-plain" data-verdict={verdict ?? undefined}>
          {VERDICT_WORDS[verdict ?? 'no-gps'].line}
        </p>
      ) : (
        <div data-testid="run-detail">
          <RouteMap route={route} reduceMotion={reduce} hero />
          <RunStats summary={summary} unit={unit} ids="detail" />
          {route.dashed.length > 0 && <p className={run.quiet}>{DASHED_NOTE}</p>}
          {held.length > 0 && (
            <p className={run.ghost} data-testid="detail-records">
              Your record: {held.join(', ')}
            </p>
          )}
          {ghost && <p className={run.ghost}>{ghost}</p>}
          <RunSplits run={row} unit={unit} />
          <RunShare run={row} unit={unit} />
        </div>
      )}
      {/* Also on a run with nothing to show: that is when the log matters most (PLAN 4.4d 2). */}
      {row && <RunDiagExport runId={row.id} startedAt={row.startedAt} />}
    </>
  );
}
