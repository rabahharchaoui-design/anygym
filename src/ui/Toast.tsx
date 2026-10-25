import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import { FADE, SHEET_SPRING } from './motion';
import styles from './Toast.module.css';

export type ToastMessage = { id: number; text: string; action?: { label: string; onPress: () => void } };

type Props = { toast: ToastMessage | null; /** Extra space below, e.g. above a bottom bar. */ bottom?: string };

/** One short message at the bottom (SPEC 13.1), with an optional action like Undo. */
export function Toast({ toast, bottom = '0px' }: Props) {
  const reduce = useReducedMotion();
  return (
    <div className={styles.anchor} style={{ ['--toast-bottom' as string]: bottom }} aria-live="polite" data-toast-anchor>
      <AnimatePresence>
        {toast && (
          <motion.div
            key={toast.id}
            role="status"
            className={styles.toast}
            initial={reduce ? { opacity: 0 } : { opacity: 0, y: 16, scale: 0.97 }}
            animate={reduce ? { opacity: 1 } : { opacity: 1, y: 0, scale: 1 }}
            exit={reduce ? { opacity: 0 } : { opacity: 0, y: 8, transition: { duration: 0.15 } }}
            transition={reduce ? FADE : SHEET_SPRING}
          >
            <span className={styles.text}>{toast.text}</span>
            {toast.action && (
              <button type="button" className={`${styles.action} pressable`} onClick={toast.action.onPress}>
                {toast.action.label}
              </button>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
