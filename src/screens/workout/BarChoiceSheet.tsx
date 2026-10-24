import { useEffect, useState } from 'react';
import { Sheet } from '../../components/Sheet';
import type { BarId, Gym } from '../../db/types';
import { formatWeight } from '../../lib/load';
import { BAR_NAMES, BAR_PROMPTS, knownBars } from './exerciseLoad';
import styles from './Workout.module.css';

type Props = {
  open: boolean;
  onClose: () => void;
  gym: Gym;
  exerciseName: string;
  current: BarId;
  /** A bar with a known weight was picked. */
  onPick: (bar: BarId) => void;
  /** "Enter another bar weight": a brand dependent bar whose weight is asked first (SPEC 5.3). */
  onAsk: (bar: BarId) => void;
};

/** Which bar (PLAN 1.10d): the gym's bars with a known weight, plus "Enter another bar weight". */
export function BarChoiceSheet({ open, onClose, gym, exerciseName, current, onPick, onAsk }: Props) {
  const [other, setOther] = useState(false);
  useEffect(() => {
    if (open) setOther(false);
  }, [open]);
  const unanswered = (Object.keys(BAR_PROMPTS) as BarId[]).filter((id) => gym.bars[id] === null);
  return (
    <Sheet open={open} onClose={onClose} label="Which bar?" scroll>
      <div className={styles.sheetBody}>
        <h2 className={styles.sheetTitle}>Which bar?</h2>
        <p className={styles.sheetSub}>{exerciseName}</p>
        <div className={styles.choices} role="group" aria-label="Bars">
          {knownBars(gym).map((id) => (
            <button
              key={id}
              type="button"
              className={`${styles.choice} pressable`}
              aria-pressed={id === current}
              onClick={() => onPick(id)}
            >
              <span className={styles.choiceRow}>
                <span className={styles.choiceLabel}>{BAR_NAMES[id]} bar</span>
                <span className={`${styles.choiceHint} num`}>{formatWeight(gym.bars[id]!, gym.unit)}</span>
              </span>
            </button>
          ))}
          {other &&
            unanswered.map((id) => (
              <button key={id} type="button" className={`${styles.choice} pressable`} onClick={() => onAsk(id)}>
                <span className={styles.choiceLabel}>{BAR_NAMES[id]} bar</span>
                <span className={styles.choiceHint}>Enter its weight</span>
              </button>
            ))}
        </div>
        {!other && unanswered.length > 0 && (
          <button type="button" className={`${styles.choiceOther} pressable`} onClick={() => setOther(true)}>
            Enter another bar weight
          </button>
        )}
      </div>
    </Sheet>
  );
}
