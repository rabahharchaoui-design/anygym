import { WEEKDAYS, type WeekdayId } from '../lib/intake/options';
import { Chip } from '../ui/Chip';
import styles from './WeekdayChips.module.css';

type Props = {
  value: readonly WeekdayId[];
  onChange: (days: WeekdayId[]) => void;
  /** Accessible name of the group ("Weekdays", "Days this week"). */
  label: string;
  /** Test id prefix: `${prefix}-mon`. */
  testIdPrefix: string;
  /** The days that can be picked (Today's week: today on). Absent: every day. */
  open?: readonly WeekdayId[];
};

/**
 * PLAN 3.6f: the week as seven one tap chips, four across then three (48 pt tall, thumb sized on a
 * 320 pt phone, at 130% text too). One component for the intake's "Same days each week" and Today's
 * "Which days this week?".
 */
export function WeekdayChips({ value, onChange, label, testIdPrefix, open }: Props) {
  return (
    <div className={styles.week} role="group" aria-label={label}>
      {WEEKDAYS.map((d) => (
        <Chip key={d.id} label={d.label} picked={value.includes(d.id)} onPress={() => onChange(value.includes(d.id) ? value.filter((id) => id !== d.id) : [...value, d.id])} testId={`${testIdPrefix}-${d.id}`} disabled={open ? !open.includes(d.id) : undefined} />
      ))}
    </div>
  );
}
