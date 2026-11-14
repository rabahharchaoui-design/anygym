import { useState } from 'react';
import { Button } from '../../ui/Button';
import { WeekdayChips } from '../../components/WeekdayChips';
import type { FocusFit } from '../../lib/intake/focusFit';
import type { IntakeAnswers } from '../../lib/intake/funnel';
import type { WeekdayId } from '../../lib/intake/options';
import { addDayWords, cleanWeekdays, freeWeekdays } from '../../lib/plan/weekdays';
import styles from './IntakeReveal.module.css';

type Patch = Pick<IntakeAnswers, 'days' | 'minutes' | 'weekdays'>;
type Props = {
  fit: FocusFit;
  /** "Same days each week": the weekdays picked now. Absent on a flexible or week to week schedule. */
  weekdays?: readonly WeekdayId[];
  /** Rebuilds the plan with these answers changed. */
  onApply: (patch: Patch) => void;
  /** The weekday question is open for this step (null: closed), so the card can name the plan as it will be. */
  onAsking?: (patch: Patch | null) => void;
};

/**
 * What did not fit and the one tap that really helps (lib/intake/focusFit.ts). On a fixed schedule
 * a day more needs its weekday (round 3, critic 2): the chips open in place and one tap adds the
 * day and rebuilds, so the weekdays always number the plan's days.
 */
export function RevealFit({ fit, weekdays, onApply, onAsking }: Props) {
  const [asking, setAskingState] = useState<Patch | null>(null);
  const setAsking = (patch: Patch | null) => { setAskingState(patch); onAsking?.(patch); };
  const [picked, setPicked] = useState<WeekdayId[]>([]);
  const add = (patch: Patch) => {
    // A flexible plan, or minutes only: nothing more to ask.
    if (!weekdays || patch.days === undefined || weekdays.length >= patch.days) return onApply(patch);
    setPicked(cleanWeekdays(weekdays));
    setAsking(patch);
  };
  const choose = (next: WeekdayId[]) => {
    const days = cleanWeekdays(next);
    if (asking && days.length === asking.days) {
      setAsking(null);
      onApply({ ...asking, weekdays: days });
    } else setPicked(days);
  };
  const addDays = fit.addDays ? `Add ${fit.addDays} days` : 'Add a day';
  return (
    <div className={styles.fit}>
      <p className={styles.fitLine} data-testid="focus-fit">
        {fit.line}
      </p>
      {asking ? (
        <div className={styles.fitAsk} data-testid="focus-add-which">
          <p className={styles.fitLine}>{fit.addDays ? 'Which days do you add?' : 'Which day do you add?'}</p>
          <WeekdayChips value={picked} onChange={choose} label="Day to add" testIdPrefix="focus-add" open={freeWeekdays(weekdays)} />
          <p className={styles.fitNote} aria-live="polite">
            {addDayWords(asking.days!, picked.length)}
          </p>
        </div>
      ) : (
        (fit.days || fit.minutes) && (
          <div className={styles.fitActions}>
            {fit.both && (
              <Button variant="secondary" data-testid="focus-add-both" onClick={() => add({ days: fit.days!, minutes: fit.minutes! })}>
                {addDays} and minutes
              </Button>
            )}
            {!fit.both && fit.days && (
              <Button variant="secondary" data-testid="focus-add-day" onClick={() => add({ days: fit.days! })}>
                {addDays}
              </Button>
            )}
            {!fit.both && fit.minutes && (
              <Button variant="secondary" data-testid="focus-add-minutes" onClick={() => onApply({ minutes: fit.minutes! })}>
                Add minutes
              </Button>
            )}
          </div>
        )
      )}
    </div>
  );
}
