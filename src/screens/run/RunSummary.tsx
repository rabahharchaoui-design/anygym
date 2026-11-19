import { useMemo } from 'react';
import { createPortal } from 'react-dom';
import type { FinishedRun } from '../../hooks/runEngine';
import { DASHED_NOTE, RUN_TYPES, VERDICT_WORDS, drawRoute, paceUnit, runVerdict, summaryOf } from '../../lib/run';
import { fromRunPoint } from '../../lib/gps';
import { Button } from '../../ui/Button';
import { DrawnCheck } from '../../ui/celebrate';
import { RouteMap } from './RouteMap';
import { RunSplits } from './RunSplits';
import { RunFacts } from './RunFacts';
import { RunShare } from './RunShare';
import styles from './Summary.module.css';

type Props = { finished: FinishedRun; reduceMotion: boolean; onDone: () => void; onDiscard: () => void };
// The entrance is plain CSS (Summary.module.css): the page fades in and its content rises from the
// bottom, where End was held.

/**
 * What a run comes to, plainly (PLAN 4.3): distance, moving time, average pace, the splits and the
 * route with its dashed gaps, all read from the stored run. A run with no GPS or next to no
 * distance shows no numbers: it says so and offers Discard or Keep. PLAN 4.6 adds the saved check,
 * the best split, new records, the ghost result, the share card and the GPX export.
 */
export function RunSummary({ finished, reduceMotion, onDone, onDiscard }: Props) {
  const { run, unit } = finished;
  const verdict = runVerdict(run);
  const summary = useMemo(() => summaryOf(run, unit), [run, unit]);
  const route = useMemo(() => drawRoute(run.points.map(fromRunPoint), run.gaps), [run]);
  const type = RUN_TYPES.find((t) => t.value === run.type)?.label ?? 'Run';

  return createPortal(
    <section className={styles.summary} data-testid="run-summary" data-verdict={verdict} role="dialog" aria-modal="true" aria-label="Run summary">
      {verdict === 'ok' ? (
        <>
          <div className={styles.scroll}>
            <p className={styles.saved} data-testid="summary-saved">
              <DrawnCheck draw={!reduceMotion} className={styles.savedCheck} />
              Run saved
            </p>
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
            <RunFacts run={run} unit={unit} reduce={reduceMotion} />
            <RouteMap route={route} reduceMotion={reduceMotion} resize={verdict} />
            {route.dashed.length > 0 && <p className={styles.quiet}>{DASHED_NOTE}</p>}
            <RunSplits run={run} unit={unit} />
            <RunShare run={run} unit={unit} />
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
