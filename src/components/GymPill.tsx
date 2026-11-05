import { useState } from 'react';
import { useActiveGym } from '../db/useActiveGym';
import { ChevronDown } from '../ui/icons';
import type { ToastMessage } from '../ui/Toast';
import { GymSheet } from './gym/GymSheet';
import styles from './gym/Gym.module.css';

type Props = {
  /** `start` keeps it flush left in a row (the day list), `end` flush right (Today, Run). */
  align?: 'start' | 'end';
  /** Where the switch's "Now at … · Undo" goes: the screen's own toast. */
  onToast?: (t: ToastMessage) => void;
  /** Inside a workout: the sheet offers no way out to Settings. */
  inWorkout?: boolean;
  /** A still copy (drawn under the edge swipe): the same pill, nothing to tap, no sheet. */
  still?: boolean;
};

/**
 * The gym pill (SPEC 3, 19, PLAN 3.9): "My Gym ▾" on Today, the day list and Run. One tap opens the
 * gym sheet; one more on a gym switches. Space is reserved so nothing shifts while it loads.
 */
export function GymPill({ align = 'end', onToast, inWorkout = false, still = false }: Props) {
  const gym = useActiveGym();
  const [open, setOpen] = useState(false);
  const face = (
    <>
      <span className={styles.pillName}>{gym?.name ?? ''}</span>
      <ChevronDown className={styles.pillChevron} strokeWidth={2.4} aria-hidden="true" />
    </>
  );
  if (still || !onToast) {
    return (
      <span className={`${styles.pill} ${styles.pillStill}`} data-align={align} data-ready={gym ? 'true' : 'false'} aria-hidden="true">
        {face}
      </span>
    );
  }
  return (
    <>
      <button
        type="button"
        className={`${styles.pill} pressable`}
        data-align={align}
        data-ready={gym ? 'true' : 'false'}
        disabled={!gym}
        aria-haspopup="dialog"
        aria-label={gym ? `${gym.name}, switch gym` : 'Switch gym'}
        onClick={() => setOpen(true)}
        data-testid="gym-pill"
      >
        {face}
      </button>
      <GymSheet open={open} onClose={() => setOpen(false)} active={gym} onToast={onToast} inWorkout={inWorkout} />
    </>
  );
}
