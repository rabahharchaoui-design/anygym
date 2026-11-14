import { Button } from '../../ui/Button';
import type { FocusFit } from '../../lib/intake/focusFit';
import { focusStateOf, type FocusReport } from '../../lib/plan/focus';
import { focusLine } from '../../lib/plan/focusWords';
import styles from './IntakeReveal.module.css';

type Props = {
  report: FocusReport;
  /** "a week", or "every 4 workouts" on a flexible rotation (lib/plan/focusWords.ts). */
  period: string;
  /** What did not fit, and the one tap that really helps (lib/intake/focusFit.ts). Null: all of it fits. */
  fit: FocusFit | null;
  onDays: (days: NonNullable<FocusFit['days']>) => void;
  onMinutes: (minutes: NonNullable<FocusFit['minutes']>) => void;
  /** Neither alone fits everything: the one tap adds both (fit.both). */
  onBoth: (days: NonNullable<FocusFit['days']>, minutes: NonNullable<FocusFit['minutes']>) => void;
};

/**
 * PLAN 3.6f: what the plan does for each focus pick, one short line each, the way a coach says it.
 * When something did not fit, that comes first with its one tap (add a day, add minutes), so it is
 * never below the list. A pick the fit line already names as getting nothing is not listed twice.
 */
export function RevealFocus({ report, period, fit, onDays, onMinutes, onBoth }: Props) {
  // focusFit names these itself ("No exercises for grip…", "…so Calves got none").
  const said = (p: FocusReport['priorities'][number]) => !!fit && p.id !== 'mobility' && ['no_move', 'no_share'].includes(focusStateOf(p));
  const lines = report.priorities.filter((p) => !said(p));
  return (
    <div className={styles.focus} data-testid="reveal-focus">
      {fit && (
        <div className={styles.fit}>
          <p className={styles.fitLine} data-testid="focus-fit">
            {fit.line}
          </p>
          {(fit.days || fit.minutes) && (
            <div className={styles.fitActions}>
              {fit.both && (
                <Button variant="secondary" data-testid="focus-add-both" onClick={() => onBoth(fit.days!, fit.minutes!)}>
                  Add a day and minutes
                </Button>
              )}
              {!fit.both && fit.days && (
                <Button variant="secondary" data-testid="focus-add-day" onClick={() => onDays(fit.days!)}>
                  Add a day
                </Button>
              )}
              {!fit.both && fit.minutes && (
                <Button variant="secondary" data-testid="focus-add-minutes" onClick={() => onMinutes(fit.minutes!)}>
                  Add minutes
                </Button>
              )}
            </div>
          )}
        </div>
      )}
      {lines.length > 0 && (
        <ul className={styles.focusList}>
          {lines.map((p) => {
            const [what, much] = focusLine(p, period);
            return (
              <li key={p.id} className={styles.focusRow} data-testid={`focus-line-${p.id}`} data-state={focusStateOf(p)}>
                <span className={styles.focusWhat}>{what}: </span>
                <span className={`${styles.focusMuch} num`}>{much}</span>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
