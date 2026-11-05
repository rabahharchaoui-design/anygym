import { useEffect, useMemo, useState } from 'react';
import { Sheet, SheetFooter } from '../../ui/Sheet';
import { SlidingToggle } from '../../ui/SlidingToggle';
import { Button } from '../../ui/Button';
import { Odometer } from '../../ui/Odometer';
import { profileFor } from '../../data/order';
import type { PlanDay } from '../../lib/plans';
import { AS_PLANNED, BUDGETS, changeWords, trimDay, type DayTrim, type TrimResult } from '../../lib/timeBudget';
import styles from './TimeBudgetSheet.module.css';

type Props = {
  open: boolean;
  onClose: () => void;
  /** The plan's day as written (never the trimmed one: every pick starts from the plan). */
  day: PlanDay;
  weekIndex: number;
  /** The chip picked when it opens: this workout's, else the gym's last, else the intake's. */
  initial: number | undefined;
  /** This workout's trim now, if any. */
  current: DayTrim | undefined;
  /** Sets logged per plan exercise: those are never cut. */
  logged: Readonly<Record<string, number>>;
  onApply: (minutes: number, result: TrimResult) => void;
};

const OPTIONS = BUDGETS.map((m) => ({ value: String(m), label: m >= AS_PLANNED ? '75+' : String(m) }));
const profileOf = (id: string, name: string) => profileFor(id, name);
const same = (a: DayTrim | null | undefined, b: DayTrim | null | undefined) => JSON.stringify(a ?? null) === JSON.stringify(b ?? null);

/**
 * "How much time today?" (PLAN 3.6, SPEC 7.4): five chips, the estimate updating live as one is
 * picked, what the time cuts in plain words, and Apply for this workout only. Closing it changes
 * nothing. Every number is the day list's own estimate (plans.estimateDayMinutes).
 */
export function TimeBudgetSheet({ open, onClose, day, weekIndex, initial, current, logged, onApply }: Props) {
  const [picked, setPicked] = useState<number | undefined>(initial);
  useEffect(() => {
    if (open) setPicked(initial);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);
  const result = useMemo(() => (picked === undefined ? null : trimDay(day, { budget: picked, weekIndex, profileOf, logged })), [picked, day, weekIndex, logged]);
  const planned = result?.before ?? trimDay(day, { budget: AS_PLANNED, weekIndex, profileOf }).before;
  const words = result ? changeWords(result.changes) : [];
  const unchanged = !!result && same(result.trim, current);
  const reason = picked === undefined ? 'Pick how long you have' : unchanged ? (current ? 'This workout is already set to this' : 'This is the day as planned') : undefined;

  return (
    <Sheet open={open} onClose={onClose} label="How much time today?" scroll footer clearTop>
      {open && (
        <div className={styles.body} data-testid="time-sheet">
          <h2 className={styles.title} id="time-title">
            How much time today?
          </h2>
          <SlidingToggle options={OPTIONS} value={picked === undefined ? undefined : String(picked)} onChange={(v) => setPicked(Number(v))} labelledBy="time-title" testId="time-chips" block />
          <p className={styles.unit}>Minutes</p>
          <div className={styles.result} data-testid="time-result" aria-live="polite">
            <p className={`${styles.fit} num`} data-testid="time-fit" data-over={(result && !result.fits) || undefined}>
              {result ? (
                <>
                  {result.fits ? 'Fits in ' : 'Shortest it goes: '}
                  <Odometer value={`~${result.minutes} min`} />
                </>
              ) : (
                <>
                  About <Odometer value={`~${planned} min`} />
                </>
              )}
            </p>
            <p className={`${styles.planned} num`}>As planned ~{planned} min</p>
            <ul className={styles.changes} data-testid="time-changes">
              {result && words.length === 0 && <li className={styles.none}>{picked !== undefined && picked >= AS_PLANNED ? 'The whole day, as planned.' : 'Nothing to cut. It fits as planned.'}</li>}
              {words.map((w) => (
                <li key={w} className={styles.change}>
                  {w}
                </li>
              ))}
            </ul>
          </div>
          {/* The pinned bar: Apply is always in reach, whatever the text size (the body scrolls above it). */}
          <SheetFooter>
            <div className={styles.footer}>
              <Button onClick={() => result && picked !== undefined && onApply(picked, result)} disabled={!!reason} disabledReason={reason}>
                Apply to this workout
              </Button>
              <p className={styles.note}>Your plan stays the same. Logged sets stay.</p>
            </div>
          </SheetFooter>
        </div>
      )}
    </Sheet>
  );
}
