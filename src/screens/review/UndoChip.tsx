import { useEffect } from 'react';
import styles from './CandidateReview.module.css';

/** How long Undo stays (SPEC 13.1: undo instead of a confirmation, for 5 s). */
export const UNDO_MS = 5000;

/**
 * The Undo chip (PLAN 3.5i): what was just done and Undo, in the header for 5 seconds, then gone.
 * Its row keeps its height, so nothing moves when it comes and goes. `token` restarts the 5 seconds.
 */
export function UndoChip({ words, token, onUndo, onGone }: { words: string | null; token: unknown; onUndo: () => void; onGone: () => void }) {
  useEffect(() => {
    if (!words) return;
    const t = window.setTimeout(onGone, UNDO_MS);
    return () => window.clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);
  return (
    <span className={styles.notice} role="status" data-testid="candidate-notice">
      {words && (
        <button type="button" className={`${styles.undo} pressable`} onClick={onUndo} data-testid="candidate-undo">
          <span className={styles.undoWords}>{words}</span>
          <b>Undo</b>
        </button>
      )}
    </span>
  );
}
