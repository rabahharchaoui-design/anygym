import { useEffect, useRef, useState } from 'react';
import { Sheet } from '../../ui/Sheet';
import { ActiveWorkoutError, restoreMerge, restoreReplace, type RestoreResult } from '../../db/backup';
import { summarize, summaryLine, type Backup } from '../../lib/backup';
import styles from './Restore.module.css';

export type RestoreMode = 'merge' | 'replace';

type Props = {
  backup: Backup | null;
  onClose: () => void;
  onDone: (result: RestoreResult, mode: RestoreMode) => void;
};

/** How long "Replace" waits for its second tap before it goes back to asking. */
const ARM_MS = 5000;

/**
 * Restore (SPEC 9.2): what the backup holds, then Merge or Replace everything. Replacing deletes
 * what is on the phone, so it takes a second tap (SPEC 13.1).
 */
export function RestoreSheet({ backup, onClose, onDone }: Props) {
  const [armed, setArmed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  // Keeps its words while it slides away after closing.
  const shown = useRef(backup);
  if (backup) shown.current = backup;
  const b = shown.current;

  useEffect(() => {
    setArmed(false);
    setBusy(false);
    setError('');
  }, [backup]);

  useEffect(() => {
    if (!armed) return;
    const t = window.setTimeout(() => setArmed(false), ARM_MS);
    return () => window.clearTimeout(t);
  }, [armed]);

  const run = async (mode: RestoreMode) => {
    if (!backup || busy) return;
    setBusy(true);
    setError('');
    try {
      const result = mode === 'merge' ? await restoreMerge(backup) : await restoreReplace(backup);
      onDone(result, mode);
    } catch (e) {
      setError(e instanceof ActiveWorkoutError ? 'Finish your workout first.' : 'Could not restore. Nothing was changed. Try again.');
      setArmed(false);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Sheet open={backup !== null} onClose={onClose} label="Restore backup">
      {b && (
        <div className={styles.body}>
          <h2 className={styles.title}>Restore this backup?</h2>
          <p className={`${styles.summary} num`} data-testid="restore-summary">
            {summaryLine(summarize(b))}
          </p>
          <button type="button" className={`${styles.choice} pressable`} disabled={busy} onClick={() => void run('merge')} data-testid="restore-merge">
            <span className={styles.choiceLabel}>Merge</span>
            <span className={styles.choiceHint}>Adds workouts that are not on this phone. Keeps everything here.</span>
          </button>
          <button
            type="button"
            className={`${styles.choice} pressable`}
            data-variant="danger"
            data-armed={armed || undefined}
            disabled={busy}
            onClick={() => (armed ? void run('replace') : setArmed(true))}
            data-testid="restore-replace"
          >
            {/* Both wordings sit in one grid cell, the hidden one keeping its space: no size change between taps. */}
            <span className={styles.swap}>
              <span className={styles.choiceLabel} aria-hidden={armed || undefined} data-off={armed || undefined}>
                Replace everything
              </span>
              <span className={styles.choiceLabel} aria-hidden={!armed || undefined} data-off={!armed || undefined}>
                Replace
              </span>
            </span>
            <span className={styles.swap}>
              <span className={styles.choiceHint} aria-hidden={armed || undefined} data-off={armed || undefined}>
                Deletes what is on this phone, then puts this backup in.
              </span>
              <span className={styles.choiceHint} aria-hidden={!armed || undefined} data-off={!armed || undefined}>
                Tap again. What is on this phone now is deleted.
              </span>
            </span>
          </button>
          <p className={styles.error} role="status" data-testid="restore-error">
            {error}
          </p>
        </div>
      )}
    </Sheet>
  );
}
