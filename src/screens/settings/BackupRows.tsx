// You → Backup and restore (SPEC 9.1 to 9.3, PLAN 1.8, M14): Back up, Restore and Import history
// as plain rows, with their hidden file pickers, the restore sheet and the plain error line.
// Moved out of SettingsScreen as is: what each row does and saves is unchanged.
import { useRef, useState } from 'react';
import { useNav } from '../../ui/nav';
import type { ToastMessage } from '../../ui/Toast';
import { parseImportText } from '../../lib/import/anygymImportV1';
import { parseBackup, workoutCount, type Backup } from '../../lib/backup';
import type { RestoreResult } from '../../db/backup';
import { importDraft } from './importDraft';
import { RestoreSheet, type RestoreMode } from './RestoreSheet';
import { useBackup } from './useBackup';
import styles from '../Settings.module.css';

type Props = {
  /** False until there is an active gym: imported sets need one. */
  canImport: boolean;
  /** Shows a toast on You (one toast spot per screen). */
  toast: (make: (id: number) => ToastMessage) => void;
  setToast: (t: ToastMessage | null) => void;
  /** Why a restore must wait (a workout or a run going on), or null; read through You. Throws if it cannot tell. */
  whyBusy: () => Promise<string | null>;
};

export function BackupRows({ canImport, toast, setToast, whyBusy }: Props) {
  const go = useNav();
  const fileRef = useRef<HTMLInputElement>(null);
  const restoreRef = useRef<HTMLInputElement>(null);
  const [importError, setImportError] = useState('');
  const [restoreError, setRestoreError] = useState('');
  const [restoring, setRestoring] = useState<Backup | null>(null);
  const backUp = useBackup(setToast);

  const pickFile = async (file: File | undefined) => {
    if (!file) return;
    setImportError('');
    setRestoreError('');
    let text: string;
    try {
      text = await file.text();
    } catch {
      setImportError('Could not open that file. Try again.');
      return;
    }
    const parsed = parseImportText(text);
    if (!parsed.ok) {
      setImportError(parsed.error);
      return;
    }
    importDraft.set(parsed);
    go('/settings/import', { kind: 'push' });
  };

  const pickBackup = async (file: File | undefined) => {
    if (!file) return;
    setRestoreError('');
    setImportError('');
    let text: string;
    try {
      text = await file.text();
    } catch {
      setRestoreError('Could not open that file. Try again.');
      return;
    }
    const parsed = parseBackup(text);
    if (!parsed.ok) {
      setRestoreError(parsed.error);
      return;
    }
    try {
      const busy = await whyBusy();
      if (busy) {
        setRestoreError(busy);
        return;
      }
    } catch {
      setRestoreError('Could not read your workouts. Try again.');
      return;
    }
    setRestoring(parsed.backup);
  };

  const restored = (result: RestoreResult, mode: RestoreMode) => {
    setRestoring(null);
    const text = mode === 'merge' && result.workouts === 0 ? 'Nothing new. Every workout is already here.' : `Restored ${workoutCount(result.workouts)}`;
    toast((id) => ({ id, text }));
  };

  return (
    <section className={styles.group} aria-labelledby="set-data">
      <h2 id="set-data" className={styles.groupTitle}>
        Backup and restore
      </h2>
      <div className={styles.card}>
        <button type="button" className={`${styles.linkRow} pressable`} onClick={() => void backUp()} data-testid="backup">
          <span className={styles.unitText}>
            <span className={styles.unitLabel}>Back up</span>
            <span className={styles.unitHint}>Save everything to one file you keep, in Files or anywhere you like.</span>
          </span>
        </button>
        <button type="button" className={`${styles.linkRow} pressable`} onClick={() => restoreRef.current?.click()} data-testid="restore">
          <span className={styles.unitText}>
            <span className={styles.unitLabel}>Restore</span>
            <span className={styles.unitHint}>Bring back your workouts from a backup file.</span>
          </span>
        </button>
        <input
          ref={restoreRef}
          type="file"
          accept=".json,application/json"
          className={styles.file}
          tabIndex={-1}
          aria-hidden="true"
          data-testid="restore-file"
          onChange={(e) => {
            const file = e.target.files?.[0];
            e.target.value = '';
            void pickBackup(file);
          }}
        />
        <button type="button" className={`${styles.linkRow} pressable`} disabled={!canImport} onClick={() => fileRef.current?.click()} data-testid="import-history">
          <span className={styles.unitText}>
            <span className={styles.unitLabel}>Import history</span>
            <span className={styles.unitHint}>Bring in your past workouts from an AnyGym history file. You check every set first.</span>
          </span>
        </button>
        <input
          ref={fileRef}
          type="file"
          accept=".json,application/json"
          className={styles.file}
          tabIndex={-1}
          aria-hidden="true"
          data-testid="import-file"
          onChange={(e) => {
            const file = e.target.files?.[0];
            e.target.value = '';
            void pickFile(file);
          }}
        />
      </div>
      <p className={styles.error} role="status" data-testid="import-error">
        {restoreError || importError}
      </p>
      <RestoreSheet backup={restoring} onClose={() => setRestoring(null)} onDone={restored} />
    </section>
  );
}
