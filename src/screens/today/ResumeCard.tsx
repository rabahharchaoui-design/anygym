// The workout in progress on Today (PLAN 1.7e): one lime Resume card. PLAN 3.5g: a workout with
// nothing logged in it gets a quiet Discard beside Resume (with Undo, never a confirm), so an
// abandoned quick workout never holds Today hostage.
import { workoutTitle, setCount } from '../history/historyWords';
import type { Session } from '../../db/types';
import styles from '../TodayScreen.module.css';

type Props = { active: Session; sets: number; empty: boolean; onResume: () => void; onDiscard: () => void };

export function ResumeCard({ active, sets, empty, onResume, onDiscard }: Props) {
  return (
    <div className={styles.resume}>
      <button type="button" className={`${styles.start} pressable`} data-continue onClick={onResume}>
        <span className={styles.startLabel}>Resume</span>
        <span className={`${styles.startSub} num`}>
          {workoutTitle(active)} · in progress · {setCount(sets)}
        </span>
      </button>
      {empty && (
        <button type="button" className={`${styles.discard} pressable`} onClick={onDiscard} data-testid="discard-empty">
          Discard
        </button>
      )}
    </div>
  );
}
