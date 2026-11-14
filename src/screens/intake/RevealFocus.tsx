import { RevealFit } from './RevealFit';
import type { IntakeAnswers } from '../../lib/intake/funnel';
import type { WeekdayId } from '../../lib/intake/options';
import type { FocusFit } from '../../lib/intake/focusFit';
import { focusStateOf, type FocusReport } from '../../lib/plan/focus';
import { focusCaption, focusRow, focusRowOrder } from '../../lib/plan/focusWords';
import { focusSummary } from '../../lib/plan/focusPriority';
import styles from './IntakeReveal.module.css';

type Props = {
  report: FocusReport;
  /** "a week", or "every 4 workouts" on a flexible rotation (lib/plan/focusWords.ts). */
  period: string;
  /** What did not fit, and the one tap that really helps (lib/intake/focusFit.ts). Null: all of it fits. */
  fit: FocusFit | null;
  /** "Same days each week": the weekdays picked, so a day more asks for its weekday. */
  weekdays?: readonly WeekdayId[];
  /** Rebuilds the plan with a day, minutes or both more. */
  onApply: (patch: Pick<IntakeAnswers, 'days' | 'minutes' | 'weekdays'>) => void;
  /** The "which day do you add?" question is open for this step (null: closed). */
  onAsking?: (patch: Pick<IntakeAnswers, 'days' | 'minutes' | 'weekdays'> | null) => void;
};

/**
 * PLAN 3.6f: what the plan does for each focus pick, each row a glance: the name, its number, and a
 * quiet state ("+6 extra" in the accent, "plenty", "no extra", "no exercises yet"). The picks that
 * got extra come first and those with no exercises last, in rank order inside each;
 * an area's muscles sit on a second quiet line. When something did not fit, that comes first with
 * its one tap (add a day, add minutes), so it is never below the list.
 */
export function RevealFocus({ report, period, fit, weekdays, onApply, onAsking }: Props) {
  // Who really got the most and why, composed from the result (never the promise made before the plan existed).
  const summary = focusSummary(report, !!fit?.named);
  return (
    <div className={styles.focus} data-testid="reveal-focus">
      {fit && <RevealFit fit={fit} onApply={onApply} {...(onAsking ? { onAsking } : {})} {...(weekdays ? { weekdays } : {})} />}
      {summary && (
        <p className={styles.focusSummary} data-testid="focus-summary">
          {summary}
        </p>
      )}
      <p className={styles.focusCaption}>{focusCaption(period)}</p>
      <ul className={styles.focusList}>
        {focusRowOrder(report.priorities).map((p) => {
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
