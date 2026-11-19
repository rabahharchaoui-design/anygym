import { useMemo } from 'react';
import type { Run } from '../../db/types';
import { useFinishCelebration } from '../../hooks/useFinishCelebration';
import { useFinishedRuns } from '../../hooks/useRuns';
import type { DistanceUnit } from '../../lib/intake/answers';
import { ghostResult, ghostWords, newCityMoment, recordMoments } from '../../lib/run';
import { BigMoment, MomentCard } from '../../ui/celebrate';
import { LoadError } from '../../components/LoadError';
import styles from './Summary.module.css';

type Props = { run: Run; unit: DistanceUnit; reduce: boolean };

/**
 * What this run earned, read from the saved runs (PLAN 4.6, SPEC 12.9): the new personal records
 * (the biggest gets the whole screen once, the rest are cards), a stamp for a first run in a city,
 * and the ghost result when it raced one. Each shows only when the stored points can prove it; a
 * run that earned nothing leaves no gap and no placeholder; a failed read says so with Try again.
 */
export function RunFacts({ run, unit, reduce }: Props) {
  const all = useFinishedRuns();
  const runs = all.data?.runs;
  const moments = useMemo(() => {
    if (!runs) return undefined;
    const stamp = newCityMoment(run, runs);
    return [...recordMoments(run, runs, unit), ...(stamp ? [stamp] : [])];
  }, [run, runs, unit]);
  const ghost = useMemo(() => (runs ? ghostWords(ghostResult(run, runs), unit) : null), [run, runs, unit]);
  const cele = useFinishCelebration(run.id, moments, true);
  // PLAN 4.6a: the saved runs could not be read, so nothing here can be proved: say so, never a silent gap.
  const failed = all.error ? <LoadError text="Could not load your run records" onRetry={all.retry} /> : null;
  if (!cele.settled && !ghost) return failed;
  return (
    <>
      {failed}
      {ghost && (
        <p className={styles.ghost} data-testid="summary-ghost">
          {ghost}
        </p>
      )}
      {cele.lead && <MomentCard moment={cele.lead} arrival={cele.leadArrival} reduce={reduce} testId="summary-win" />}
      {cele.others.length > 0 && (
        <ul className={styles.wins} aria-label="New bests">
          {cele.others.map((m, i) => (
            <MomentCard key={m.id} moment={m} arrival={cele.otherArrival} size="row" as="li" delay={0.2 + 0.08 * i} reduce={reduce} testId="summary-win-row" />
          ))}
        </ul>
      )}
      {cele.big && <BigMoment moment={cele.big} reduce={reduce} onSettle={cele.onSettle} onDone={cele.onDone} />}
    </>
  );
}
