import { Link } from 'react-router-dom';
import { CheckIcon } from '../../ui/icons';
import { useNav } from '../../ui/nav';
import type { WeekRow } from './weekRows';
import { dayTitle } from './planWords';
import styles from './PlanWeek.module.css';

type Props = {
  rows: readonly WeekRow[];
  /** "Today" or "Next", at the right of the day up next. */
  next: string;
  /** The plan's viewer: every row opens it. */
  to: string;
  label: string;
};

const SAY: Record<WeekRow['state'], string> = { done: ', done', partial: ', part done', next: '', todo: '' };

/**
 * Board 10: the active plan's days as plain rows split by hairlines. A small "Day 1" on the left, the
 * day's name in bold, a small tick at the right for a day done in this pass, the day up next marked by
 * a short ice blue bar at the left edge and the word "Today" (or "Next" on a rotation). No boxes.
 */
export function PlanWeek({ rows, next, to, label }: Props) {
  const go = useNav();
  return (
    <ol className={styles.week} aria-label={label} data-testid="plan-week">
      {rows.map((r) => (
        <li key={r.n} className={styles.item} data-state={r.state} data-testid={`week-row-${r.n}`}>
          <Link
            to={to}
            className={`${styles.row} pressable`}
            aria-label={`${dayTitle(r.n, r.name)}${r.state === 'next' ? `, ${next.toLowerCase()}` : SAY[r.state]}`}
            onClick={(e) => {
              e.preventDefault();
              go(to);
            }}
          >
            <span className={`${styles.day} num`} aria-hidden="true">
              Day {r.n}
            </span>
            <span className={styles.name} aria-hidden="true">
              {r.name}
            </span>
            <span className={styles.mark} aria-hidden="true">
              {r.state === 'next' ? next : r.state === 'done' ? <CheckIcon className={styles.tick} /> : r.state === 'partial' ? 'Part done' : null}
            </span>
          </Link>
        </li>
      ))}
    </ol>
  );
}
