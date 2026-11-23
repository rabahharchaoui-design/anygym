import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { TopBar } from '../ui/TopBar';
import { TAB_TOAST_BOTTOM, Toast, type ToastMessage } from '../ui/Toast';
import { useNav } from '../ui/nav';
import { undoImport } from '../db/importHistory';
import { UNDO_MS } from '../lib/undoQueue';
import { setCount } from './history/historyWords';
import { importDraft, isImportDone } from './settings/importDraft';
import { Switch } from '../ui/Switch';
import { haptics } from '../ui/haptics';
import { Segmented } from '../ui/Segmented';
import { bodyPref } from '../lib/bodyPref';
import { useActiveGym } from '../db/useActiveGym';
import { GymUnitSettings } from './settings/GymUnitSettings';
import { registerTap } from '../lib/secretTaps';
import { unlockDiagnostics } from '../hooks/diagUnlock';
import { version } from '../../package.json';
import { ReportProblemSheet } from './settings/ReportProblemSheet';
import { crashReports } from '../lib/reporting/preferences';
import { gymFacts } from '../lib/reporting/feedback';
import { useLive } from '../hooks/useLive';
import { getProfile, setProfileUnits } from '../db/intake';
import { PlanAnswerRows } from './settings/PlanAnswerRows';
import { db } from '../db/schema';
import { recentGyms } from '../lib/gymPresets';
import { phoneLocale, unitsForLocale } from '../lib/intake/region';
import { CoachSettings } from './settings/CoachSettings';
import { BackupRows } from './settings/BackupRows';
import { useRunVoice } from '../hooks/useRunVoice';
import { getActiveSession } from '../db/workouts';
import { getActiveRun } from '../db/runs';
import styles from './Settings.module.css';
import { useToastTimeout } from '../ui/useToastTimeout';

let toastSeq = 0;

/**
 * You, the fifth tab (PLAN M14, board 13; Settings until then, PLAN 1.7e): "You" giant, then plain
 * rows split by hairlines, the name on the left and the value or the choice in words on the right.
 * Gyms, units, the coach, how it feels, your plan's answers, backup and restore, privacy, help and
 * which version is running. Every setting does and saves what it did on the old Settings page.
 */
export function SettingsScreen() {
  const hapticsOn = useSyncExternalStore(haptics.subscribe, haptics.enabled, () => true);
  const body = useSyncExternalStore(bodyPref.subscribe, bodyPref.get, () => 'male' as const);
  const gym = useActiveGym();
  const go = useNav();
  const navigate = useNavigate();
  const location = useLocation();
  // Hidden (SPEC 9.4): 5 taps on the version number open the Review screen.
  const versionTaps = useRef<number[]>([]);
  const onVersionTap = () => {
    const r = registerTap(versionTaps.current, Date.now(), 5);
    versionTaps.current = r.taps;
    if (r.fired) {
      // The same door opens the run diagnostics export on the run detail screen (PLAN 4.4d 2).
      unlockDiagnostics();
      go('/review', { kind: 'push' });
    }
  };
  const [toast, setToast] = useState<ToastMessage | null>(null);
  const crashOn = useSyncExternalStore(crashReports.subscribe, crashReports.enabled, () => true);
  const [reporting, setReporting] = useState(false);
  const [privacyError, setPrivacyError] = useState(false);
  // PLAN 3.3: the intake's answers stay changeable here (units, and the whole intake again).
  const profile = useLive(() => getProfile(), []);
  const [profileError, setProfileError] = useState(false);
  // Board 13: the Gyms row shows every gym's name, most recent first (as the Gyms screen lists them).
  const gyms = useLive(() => db.gyms.toArray(), []);
  const gymNames = gyms.data ? recentGyms(gyms.data).map((g) => g.name).join(', ') : '';
  // The voice coach (SPEC 12.4) is kept with the run setup; the Run tab's settings sheet shows it too.
  const { voice, setVoice } = useRunVoice();
  const profileUnits = (patch: Parameters<typeof setProfileUnits>[0]) => {
    setProfileError(false);
    setProfileUnits(patch).catch(() => setProfileError(true));
  };
  const toastMaker = (make: (id: number) => ToastMessage) => setToast(make(++toastSeq));
  // A restore waits for a workout or a run in progress to end (PLAN 1.8).
  const whyBusy = async () => ((await getActiveSession()) ? 'Finish your workout first, then restore.' : (await getActiveRun()) ? 'Finish your run first, then restore.' : null);

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

  // Every toast on You stays the full Undo time, with or without an action.
  useToastTimeout(toast, setToast, () => UNDO_MS);

  return (
    <>
      <TopBar title="You" giant />
      <section className={styles.group} aria-label="Gyms and units">
        <div className={styles.card}>
          {/* PLAN 3.9 (SPEC 19): every gym, add one, switch, edit its equipment. */}
          <button type="button" className={`${styles.linkRow} pressable`} onClick={() => go('/settings/gyms', { kind: 'push' })} data-testid="settings-gyms">
            <span className={styles.unitLabel}>Gyms</span>
            <span className={`${styles.value} ${styles.oneLine}`} data-testid="settings-gyms-value">
              {gymNames}
            </span>
          </button>
          <GymUnitSettings gym={gym} toast={toastMaker} />
          <div className={styles.unitRow}>
            <span className={styles.unitText}>
              <span className={styles.unitLabel} id="distance-label">
                Distance
              </span>
              <span className={styles.unitHint}>For runs.</span>
            </span>
            <Segmented
              words
              labelledBy="distance-label"
              testId="settings-distance"
              options={[
                { value: 'km', label: 'km' },
                { value: 'mi', label: 'mi' },
              ]}
              value={profile.data?.distanceUnit ?? profile.data?.intake?.units?.distance ?? unitsForLocale(phoneLocale()).distance}
              disabled={!profile.ready}
              onChange={(distanceUnit) => profileUnits({ distanceUnit })}
            />
          </div>
          <div className={styles.unitRow}>
            <span className={styles.unitText}>
              <span className={styles.unitLabel} id="measure-label">
                Body measurements
              </span>
              <span className={styles.unitHint}>Height and the like.</span>
            </span>
            <Segmented
              words
              labelledBy="measure-label"
              testId="settings-measure"
              options={[
                { value: 'cm', label: 'cm' },
                { value: 'in', label: 'in' },
              ]}
              value={profile.data?.measureUnit ?? profile.data?.intake?.units?.measure ?? unitsForLocale(phoneLocale()).measure}
              disabled={!profile.ready}
              onChange={(measureUnit) => profileUnits({ measureUnit })}
            />
          </div>
          <Switch
            words
            label="Voice coach"
            hint="Says your time and pace on runs, over your music."
            checked={voice?.on ?? false}
            disabled={!voice}
            onChange={(on) => voice && setVoice({ ...voice, on })}
          />
        </div>
        <p className={styles.error} role="status">
          {profileError ? 'Could not save that. Try again.' : ''}
        </p>
      </section>
      <CoachSettings />
      <section className={styles.group} aria-labelledby="set-profile">
        <h2 id="set-profile" className={styles.groupTitle}>
          Your plan
        </h2>
        <div className={styles.card}>
          {profile.data?.name && (
            <p className={styles.row} data-testid="profile-name">
              <span>Name</span>
              <span className={styles.value}>{profile.data.name}</span>
            </p>
          )}
          <PlanAnswerRows intake={profile.data?.intake} go={(to) => go(to, { kind: 'push' })} />
        </div>
      </section>
      <section className={styles.group} aria-labelledby="set-feel">
        <h2 id="set-feel" className={styles.groupTitle}>
          Feel
        </h2>
        <div className={styles.card}>
          <Switch words label="Haptics" hint="A light tap when you check a set, add a plate or switch tabs." checked={hapticsOn} onChange={(on) => haptics.setEnabled(on)} />
          <div className={`${styles.unitRow} ${styles.feelRow}`}>
            <span className={styles.unitText}>
              <span className={styles.unitLabel} id="body-label">
                Muscle map body
              </span>
              <span className={styles.unitHint}>Which body the muscle map shows.</span>
            </span>
            <Segmented
              words
              labelledBy="body-label"
              testId="settings-body"
              options={[
                { value: 'male', label: 'Male' },
                { value: 'female', label: 'Female' },
              ]}
              value={body}
              onChange={(b) => bodyPref.set(b)}
            />
          </div>
        </div>
      </section>
      <BackupRows canImport={!!gym} toast={toastMaker} setToast={setToast} whyBusy={whyBusy} />
      <section className={styles.group} aria-labelledby="set-privacy">
        <h2 id="set-privacy" className={styles.groupTitle}>
          Privacy and help
        </h2>
        <div className={styles.card}>
          {/* SPEC 24: on by default; off also deletes crash reports still waiting to be sent. */}
          <Switch
            words
            label="Send crash reports"
            hint="If AnyGym breaks, it sends us a short note about what broke. Never your workouts or anything personal."
            checked={crashOn}
            onChange={(on) => {
              setPrivacyError(false);
              crashReports.setEnabled(on).catch(() => setPrivacyError(true));
            }}
          />
          <button type="button" className={`${styles.linkRow} pressable`} onClick={() => setReporting(true)} data-testid="report-problem">
            <span className={styles.unitText}>
              <span className={styles.unitLabel}>Report a problem</span>
              <span className={styles.unitHint}>Tell us what went wrong. Add a screenshot if it helps.</span>
            </span>
          </button>
        </div>
        <p className={styles.error} role="status">
          {privacyError ? 'Could not save that. Try again.' : ''}
        </p>
      </section>
      <section className={styles.group} aria-labelledby="set-about">
        <h2 id="set-about" className={styles.groupTitle}>
          About
        </h2>
        <div className={styles.card}>
          <p className={styles.row}>
            <span>AnyGym</span>
            <span className={`${styles.value} num`} data-testid="app-version" onClick={onVersionTap}>
              Version {version}
            </span>
          </p>
          <p className={styles.note}>Everything you log stays on this phone and works offline. Only reports you send and crash reports leave it.</p>
          <p className={styles.note}>Exercise photos and instructions: free-exercise-db (public domain). Muscle map drawing: react-native-body-highlighter by ELABBASSI Hicham (MIT).</p>
          <p className={styles.note} data-testid="about-voice">Run coach voice: recorded with Kokoro, an open text to speech model (Apache 2.0). Only the recordings are in the app.</p>
        </div>
      </section>
      <ReportProblemSheet open={reporting} onClose={() => setReporting(false)} facts={gymFacts(gym)} />
      <Toast toast={toast} bottom={TAB_TOAST_BOTTOM} />
    </>
  );
}
