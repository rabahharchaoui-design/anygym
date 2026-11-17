import { useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import type { FinishedRun } from '../../hooks/runEngine';
import { RUN_TYPES, VERDICT_WORDS, drawRoute, paceUnit, runVerdict, summaryOf } from '../../lib/run';
import { fromRunPoint } from '../../lib/gps';
import { Button } from '../../ui/Button';
import { MapCredit, MapOfflineChip, RunMap } from './RunMap';
import styles from './Summary.module.css';

type Props = { finished: FinishedRun; reduceMotion: boolean; onDone: () => void; onDiscard: () => void };
// The entrance is plain CSS (Summary.module.css): the page fades in and its content rises from the
// bottom, where End was held.

const NO_INSET = { top: 0, bottom: 0 };
const noop = () => undefined;

/**
 * What a run comes to, plainly (PLAN 4.3): distance, moving time, average pace, the splits and the
 * route with its dashed gaps, all read from the stored run. A run with no GPS or next to no
 * distance shows no numbers: it says so and offers Discard or Keep. The full finish screen, the
 * share card and the export come later (4.6).
 */
export function RunSummary({ finished, reduceMotion, onDone, onDiscard }: Props) {
  const { run, unit } = finished;
  const verdict = runVerdict(run);
  const summary = useMemo(() => summaryOf(run, unit), [run, unit]);
  const route = useMemo(() => drawRoute(run.points.map(fromRunPoint), run.gaps), [run]);
  const [offline, setOffline] = useState(false);
  const type = RUN_TYPES.find((t) => t.value === run.type)?.label ?? 'Run';

  return createPortal(
    <section className={styles.summary} data-testid="run-summary" data-verdict={verdict} role="dialog" aria-modal="true" aria-label="Run summary">
      {verdict === 'ok' ? (
        <>
          <div className={styles.scroll}>
            <p className={styles.kind}>
              {type}
              {run.goal ? ` · ${run.goal}` : ''}
            </p>
            <h2 className={styles.distance}>
              <span className={`${styles.distanceValue} num`} data-testid="summary-distance">
                {summary.distance}
              </span>
              <span className={styles.distanceUnit}>{unit}</span>
            </h2>
            <dl className={styles.facts}>
              <div className={styles.fact}>
                <dd className="num" data-testid="summary-time">
                  {summary.time}
                </dd>
                <dt>Moving time</dt>
              </div>
              <div className={styles.fact}>
                <dd className="num" data-testid="summary-pace">
                  {summary.pace}
                </dd>
                <dt>Average pace {paceUnit(unit)}</dt>
              </div>
            </dl>
            <div className={styles.map} data-testid="summary-map" data-solid={route.solid.length} data-dashed={route.dashed.length}>
              <RunMap here={null} recentre={0} reduceMotion={reduceMotion} inset={NO_INSET} onOffline={setOffline} onMoved={noop} route={route} still />
              <div className={styles.mapNotes}>
                <MapCredit />
                {offline && <MapOfflineChip />}
              </div>
            </div>
            {route.dashed.length > 0 && <p className={styles.quiet}>Dashed: GPS was lost or the run was paused there. That stretch is not counted as moving time.</p>}
            <h3 className={styles.heading}>Splits</h3>
            {summary.splits.length === 0 ? (
              <p className={styles.quiet} data-testid="summary-no-splits">
                No full {unit === 'mi' ? 'mile' : 'kilometer'} yet. Splits show from the first one.
              </p>
            ) : (
              <ol className={styles.splits} data-testid="summary-splits">
                {summary.splits.map((s) => (
                  <li key={s.n} className={styles.split}>
                    <span>
                      {unit === 'mi' ? 'Mile' : 'Km'} {s.n}
                    </span>
                    <span className="num">{s.time}</span>
                  </li>
                ))}
              </ol>
            )}
          </div>
          <div className={styles.actions}>
            <Button size="lg" onClick={onDone} data-testid="summary-done">
              Done
            </Button>
          </div>
        </>
      ) : (
        <>
          <div className={styles.plain}>
            <h2 className={styles.plainTitle} data-testid="summary-plain">
              {VERDICT_WORDS[verdict].title}
            </h2>
            <p className={styles.plainLine}>{VERDICT_WORDS[verdict].line}</p>
          </div>
          <div className={styles.actions}>
            <Button size="lg" onClick={onDiscard} data-testid="summary-discard">
              Discard
            </Button>
            <Button variant="secondary" size="lg" onClick={onDone} data-testid="summary-keep">
              Keep it anyway
            </Button>
          </div>
        </>
      )}
    </section>,
    document.body,
  );
}
