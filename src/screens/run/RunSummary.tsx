import { useMemo } from 'react';
import { createPortal } from 'react-dom';
import type { FinishedRun } from '../../hooks/runEngine';
import { DASHED_NOTE, RUN_TYPES, VERDICT_WORDS, drawRunRoute, runVerdict, summaryOf, type RunVerdict } from '../../lib/run';
import { Button } from '../../ui/Button';
import { DrawnCheck } from '../../ui/celebrate';
import { RouteMap } from './RouteMap';
import { RunSplits } from './RunSplits';
import { RunFacts } from './RunFacts';
import { useRunShare } from './RunShare';
import { RunStats } from './RunStats';
import { workoutDate } from '../history/historyWords';
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
  const verdict = runVerdict(finished.run);

  return createPortal(
    <section className={styles.summary} data-testid="run-summary" data-verdict={verdict} role="dialog" aria-modal="true" aria-label="Run summary">
      {verdict === 'ok' ? <Saved finished={finished} reduceMotion={reduceMotion} onDone={onDone} /> : <Plain verdict={verdict} onDone={onDone} onDiscard={onDiscard} />}
    </section>,
    document.body,
  );
}

/**
 * A run with numbers (PLAN M3), in the order of a good run summary: the saved check and the day,
 * the route as the hero across the top half, the stat row, what it earned, the splits with the best
 * one marked, Export GPX; Share card and Done stay docked at the foot, so Done is always in reach.
 */
function Saved({ finished, reduceMotion, onDone }: Omit<Props, 'onDiscard'>) {
  const { run, unit } = finished;
  const summary = useMemo(() => summaryOf(run, unit), [run, unit]);
  const route = useMemo(() => drawRunRoute(run), [run]);
  const type = RUN_TYPES.find((t) => t.value === run.type)?.label ?? 'Run';
  const share = useRunShare({ run, unit });
  return (
    <>
      <div className={styles.scroll}>
        <header className={styles.head}>
          <h2 className={styles.saved} data-testid="summary-saved">
            <DrawnCheck draw={!reduceMotion} className={styles.savedCheck} />
            Run saved
          </h2>
          <p className={`${styles.kind} num`}>
            {workoutDate(run.startedAt)} · {type}
            {run.goal ? ` · ${run.goal}` : ''}
          </p>
        </header>
        <RouteMap route={route} reduceMotion={reduceMotion} resize="ok" hero />
        <RunStats summary={summary} unit={unit} ids="summary" />
        {route.dashed.length > 0 && <p className={styles.quiet}>{DASHED_NOTE}</p>}
        <RunFacts run={run} unit={unit} reduce={reduceMotion} />
        <RunSplits run={run} unit={unit} />
        <div className={styles.more}>{share.gpxButton}</div>
        {share.note}
      </div>
      <div className={styles.actions} data-pair>
        {share.shareButton}
        <Button size="md" onClick={onDone} data-testid="summary-done">
          Done
        </Button>
      </div>
      {share.sheet}
    </>
  );
}

/** No GPS, or next to no distance: no numbers, said plainly, with Discard or Keep. */
function Plain({ verdict, onDone, onDiscard }: { verdict: Exclude<RunVerdict, 'ok'>; onDone: () => void; onDiscard: () => void }) {
  return (
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
  );
}
