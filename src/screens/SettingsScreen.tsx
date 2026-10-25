import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { TopBar } from '../ui/TopBar';
import { Toast, type ToastMessage } from '../ui/Toast';
import { ChevronRight } from '../ui/icons';
import { useNav } from '../ui/nav';
import { undoImport } from '../db/importHistory';
import { parseImportText } from '../lib/import/anygymImportV1';
import { UNDO_MS } from '../lib/undoQueue';
import { setCount } from './history/historyWords';
import { importDraft, isImportDone } from './settings/importDraft';
import { BackButton } from '../ui/BackButton';
import { Switch } from '../ui/Switch';
import { haptics } from '../ui/haptics';
import { useActiveGym } from '../db/useActiveGym';
import { setGymUnit, setPlateColors } from '../db/equipment';
import type { Unit } from '../db/types';
import { version } from '../../package.json';
import { getActiveSession } from '../db/workouts';
import { parseBackup, workoutCount, type Backup } from '../lib/backup';
import { RestoreSheet, type RestoreMode } from './settings/RestoreSheet';
import { useBackup } from './settings/useBackup';
import type { RestoreResult } from '../db/backup';
import { ReportProblemSheet } from './settings/ReportProblemSheet';
import { crashReports } from '../lib/reporting/preferences';
import { gymFacts } from '../lib/reporting/feedback';
import styles from './Settings.module.css';

let toastSeq = 0;

/**
 * Settings (PLAN 1.7e): small and honest. Haptics on this phone, plate colors for this gym, back up
 * and restore (SPEC 9.1, 9.2, PLAN 1.8), import history (SPEC 9.3) and which version is running.
 */
export function SettingsScreen() {
  const hapticsOn = useSyncExternalStore(haptics.subscribe, haptics.enabled, () => true);
  const gym = useActiveGym();
  const [error, setError] = useState(false);
  const go = useNav();
  const navigate = useNavigate();
  const location = useLocation();
  const fileRef = useRef<HTMLInputElement>(null);
  const [importError, setImportError] = useState('');
  const [toast, setToast] = useState<ToastMessage | null>(null);
  const restoreRef = useRef<HTMLInputElement>(null);
  const [restoreError, setRestoreError] = useState('');
  const [restoring, setRestoring] = useState<Backup | null>(null);
  const backUp = useBackup(setToast);
  const crashOn = useSyncExternalStore(crashReports.subscribe, crashReports.enabled, () => true);
  const [reporting, setReporting] = useState(false);
  const [privacyError, setPrivacyError] = useState(false);

  // Back from the review screen: "Imported N sets · Undo" (SPEC 13.1: undo, never a confirm).
  useEffect(() => {
    const state: unknown = location.state;
    if (!isImportDone(state)) return;
    const result = state.importDone;
    importDraft.set(null);
    navigate('/settings', { replace: true, state: null });
    const undo = async () => {
      try {
        await undoImport(result);
        setToast({ id: ++toastSeq, text: 'Import undone' });
      } catch {
        setToast({ id: ++toastSeq, text: 'Could not undo the import. Try again.', action: { label: 'Try again', onPress: () => void undo() } });
      }
    };
    setToast({
      id: ++toastSeq,
      text: result.sets === 0 ? 'Nothing new to import' : `Imported ${setCount(result.sets)}`,
      action: result.sets === 0 ? undefined : { label: 'Undo', onPress: () => void undo() },
    });
  }, [location.state, navigate]);

  useEffect(() => {
    if (!toast) return;
    const t = window.setTimeout(() => setToast((now) => (now?.id === toast.id ? null : now)), UNDO_MS);
    return () => window.clearTimeout(t);
  }, [toast]);

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
      if (await getActiveSession()) {
        setRestoreError('Finish your workout first, then restore.');
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
    setToast({ id: ++toastSeq, text });
  };

  const units = async (unit: Unit) => {
    if (!gym || gym.unit === unit) return;
    setError(false);
    try {
      await setGymUnit(gym.id, unit);
    } catch {
      setError(true);
    }
  };

  const plates = async (on: boolean) => {
    if (!gym) return;
    setError(false);
    try {
      await setPlateColors(gym.id, on ? 'color' : 'black');
    } catch {
      setError(true);
    }
  };

  return (
    <>
      <TopBar title="Settings" leading={<BackButton to="/" label="Back to Today" />} />
      <section className={styles.group} aria-labelledby="set-feel">
        <h2 id="set-feel" className={styles.groupTitle}>
          Feel
        </h2>
        <div className={styles.card}>
          <Switch label="Haptics" hint="A light tap when you check a set, add a plate or switch tabs." checked={hapticsOn} onChange={(on) => haptics.setEnabled(on)} />
        </div>
      </section>
      <section className={styles.group} aria-labelledby="set-plates">
        <h2 id="set-plates" className={styles.groupTitle}>
          {gym ? gym.name : 'Gym'}
        </h2>
        <div className={styles.card}>
          {/* SPEC 3: lb or kg is per gym; switching starts its plates and bars from that unit's set. */}
          <div className={styles.unitRow}>
            <span className={styles.unitText}>
              <span className={styles.unitLabel} id="units-label">
                Units
              </span>
              <span className={styles.unitHint}>Plates and bars switch to the standard set for that unit.</span>
            </span>
            <span className={styles.segmented} role="radiogroup" aria-labelledby="units-label">
              {(['lb', 'kg'] as const).map((u) => (
                <button
                  key={u}
                  type="button"
                  role="radio"
                  aria-checked={gym?.unit === u}
                  disabled={!gym}
                  className={`${styles.segment} pressable`}
                  onClick={() => void units(u)}
                >
                  {u}
                </button>
              ))}
            </span>
          </div>
          <Switch
            label="Colored plates"
            hint={gym ? `Show plates in competition colors at ${gym.name}. Off: black like most gyms.` : 'Show plates in competition colors.'}
            checked={gym?.plateColors === 'color'}
            disabled={!gym}
            onChange={(on) => void plates(on)}
          />
        </div>
        <p className={styles.error} role="status">
          {error ? 'Could not save that. Try again.' : ''}
        </p>
      </section>
      <section className={styles.group} aria-labelledby="set-data">
        <h2 id="set-data" className={styles.groupTitle}>
          Your data
        </h2>
        <div className={styles.card}>
          <button type="button" className={`${styles.linkRow} ${styles.divided} pressable`} onClick={() => void backUp()} data-testid="backup">
            <span className={styles.unitText}>
              <span className={styles.unitLabel}>Back up</span>
              <span className={styles.unitHint}>Save everything to one file you keep, in Files or anywhere you like.</span>
            </span>
            <ChevronRight className={styles.chevron} aria-hidden="true" />
          </button>
          <button type="button" className={`${styles.linkRow} ${styles.divided} pressable`} onClick={() => restoreRef.current?.click()} data-testid="restore">
            <span className={styles.unitText}>
              <span className={styles.unitLabel}>Restore</span>
              <span className={styles.unitHint}>Bring back your workouts from a backup file.</span>
            </span>
            <ChevronRight className={styles.chevron} aria-hidden="true" />
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
          <button type="button" className={`${styles.linkRow} pressable`} disabled={!gym} onClick={() => fileRef.current?.click()} data-testid="import-history">
            <span className={styles.unitText}>
              <span className={styles.unitLabel}>Import history</span>
              <span className={styles.unitHint}>Bring in your past workouts from an AnyGym history file. You check every set first.</span>
            </span>
            <ChevronRight className={styles.chevron} aria-hidden="true" />
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
      </section>
      <section className={styles.group} aria-labelledby="set-privacy">
        <h2 id="set-privacy" className={styles.groupTitle}>
          Privacy
        </h2>
        <div className={styles.card}>
          {/* SPEC 24: on by default; off also deletes crash reports still waiting to be sent. */}
          <Switch
            label="Send crash reports"
            hint="If AnyGym breaks, it sends the builder a short note about what broke. Never your workouts or anything personal."
            checked={crashOn}
            onChange={(on) => {
              setPrivacyError(false);
              crashReports.setEnabled(on).catch(() => setPrivacyError(true));
            }}
          />
        </div>
        <p className={styles.error} role="status">
          {privacyError ? 'Could not save that. Try again.' : ''}
        </p>
      </section>
      <section className={styles.group} aria-labelledby="set-help">
        <h2 id="set-help" className={styles.groupTitle}>
          Help
        </h2>
        <div className={styles.card}>
          <button type="button" className={`${styles.linkRow} pressable`} onClick={() => setReporting(true)} data-testid="report-problem">
            <span className={styles.unitText}>
              <span className={styles.unitLabel}>Report a problem</span>
              <span className={styles.unitHint}>Tell the builder what went wrong. Add a screenshot if it helps.</span>
            </span>
            <ChevronRight className={styles.chevron} aria-hidden="true" />
          </button>
        </div>
      </section>
      <section className={styles.group} aria-labelledby="set-about">
        <h2 id="set-about" className={styles.groupTitle}>
          About
        </h2>
        <div className={styles.card}>
          <p className={styles.row}>
            <span>AnyGym</span>
            <span className={`${styles.value} num`} data-testid="app-version">
              Version {version}
            </span>
          </p>
          <p className={styles.note}>Everything you log stays on this phone and works offline. Only reports you send and crash reports leave it.</p>
        </div>
      </section>
      <ReportProblemSheet open={reporting} onClose={() => setReporting(false)} facts={gymFacts(gym)} />
      <RestoreSheet backup={restoring} onClose={() => setRestoring(null)} onDone={restored} />
      <Toast toast={toast} bottom="calc(var(--tabbar-capsule) + var(--tabbar-gap) + var(--resume-space, 0px) - var(--safe-bottom))" />
    </>
  );
}
