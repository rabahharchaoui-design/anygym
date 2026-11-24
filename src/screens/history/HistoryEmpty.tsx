import { Button } from '../../ui/Button';
import styles from './History.module.css';

/**
 * Board 12: no workout and no run saved yet. "No workouts yet" in giant type, one small line, and the
 * one next step as big words over the ice blue line. No picture, no made up rows.
 */
export function HistoryEmpty({ onStart }: { onStart: () => void }) {
  return (
    <section className={styles.empty} data-testid="history-empty">
      <h2 className={styles.emptyTitle}>No workouts yet</h2>
      <p className={styles.emptyNext}>Your first one shows up here.</p>
      <div className={styles.emptyAction}>
        <Button onClick={onStart}>Start workout</Button>
      </div>
    </section>
  );
}
