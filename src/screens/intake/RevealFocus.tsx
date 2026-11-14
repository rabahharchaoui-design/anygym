import { Button } from '../../ui/Button';
import type { FocusFit } from '../../lib/intake/focusFit';
import { focusStateOf, type FocusReport } from '../../lib/plan/focus';
import { focusCaption, focusRow } from '../../lib/plan/focusWords';
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
 * PLAN 3.6f: what the plan does for each focus pick, in rank order, each row a glance: the name, its
 * number, and a quiet state ("+6 extra" in the accent, "plenty", "no extra yet", "no exercises yet");
 * an area's muscles sit on a second quiet line. When something did not fit, that comes first with
 * its one tap (add a day, add minutes), so it is never below the list.
 */
export function RevealFocus({ report, period, fit, onDays, onMinutes, onBoth }: Props) {
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
      <p className={styles.focusCaption}>{focusCaption(period)}</p>
      <ul className={styles.focusList}>
        {report.priorities.map((p) => {
          const row = focusRow(p);
          return (
            <li key={p.id} className={styles.focusRow} data-testid={`focus-line-${p.id}`} data-state={focusStateOf(p)}>
              <span className={styles.focusTop}>
                <span className={styles.focusWhat}>{row.name}</span>{' '}
                <span className={styles.focusGot}>
                  {row.amount && <span className={`${styles.focusMuch} num`}>{row.amount}</span>}
                  {row.amount && row.tag && ' '}
                  {row.tag && (
                    <span className={`${styles.focusTag} num`} data-extra={p.extra > 0 || undefined}>
                      {row.tag}
                    </span>
                  )}
                </span>
              </span>
              {row.detail && <span className={styles.focusDetail}> {row.detail}</span>}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
