import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { useNav } from '../../ui/nav';
import type { RowFacts } from './historyWords';
import styles from './History.module.css';

type Props = { to: string; testId: string; title: string; sub?: string; note?: ReactNode; facts: RowFacts };

/**
 * One History row (board 11): the name in bold on the left with the date small under it, the main
 * number in bold on the right with a small detail under it. No box, no icon, no chevron: the row is
 * the button. Workouts and runs share it.
 */
export function HistoryRow({ to, testId, title, sub, note, facts }: Props) {
  const go = useNav();
  return (
    <li className={styles.item}>
      <Link
        to={to}
        className={`${styles.row} pressable`}
        data-testid={testId}
        onClick={(e) => {
          e.preventDefault();
          go(to);
        }}
      >
        <span className={styles.rowMain}>
          <span className={styles.rowTitle}>{title}</span>
          {sub && <span className={`${styles.rowSub} num`}>{sub}</span>}
          {note}
        </span>
        <span className={styles.rowFacts}>
          {facts.main && <span className={`${styles.rowCount} num`}>{facts.main}</span>}
          {facts.detail && <span className={`${styles.rowSub} num`}>{facts.detail}</span>}
        </span>
      </Link>
    </li>
  );
}
