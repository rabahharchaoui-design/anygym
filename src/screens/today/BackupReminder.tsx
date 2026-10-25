import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import { FADE, SPRING } from '../../ui/motion';
import styles from '../settings/Restore.module.css';

type Props = { show: boolean; onBackUp: () => void; onLater: () => void };

/** SPEC 9.1: one gentle line on Today when there is no recent backup. */
export function BackupReminder({ show, onBackUp, onLater }: Props) {
  const reduce = useReducedMotion();
  return (
    <AnimatePresence initial={false}>
      {show && (
        <motion.section
          key="backup-reminder"
          className={styles.reminder}
          aria-label="Back up your workouts"
          data-testid="backup-reminder"
          initial={reduce ? { opacity: 0 } : { opacity: 0, y: 8 }}
          animate={reduce ? { opacity: 1 } : { opacity: 1, y: 0 }}
          exit={reduce ? { opacity: 0 } : { opacity: 0, scale: 0.97, transition: { duration: 0.16 } }}
          transition={reduce ? FADE : SPRING}
        >
          <span className={styles.reminderText}>Back up your workouts</span>
          <span className={styles.reminderButtons}>
            <button type="button" className={`${styles.reminderLater} pressable`} onClick={onLater} data-testid="reminder-later">
              Not now
            </button>
            <button type="button" className={`${styles.reminderAction} pressable`} onClick={onBackUp} data-testid="reminder-backup">
              Back up
            </button>
          </span>
        </motion.section>
      )}
    </AnimatePresence>
  );
}
