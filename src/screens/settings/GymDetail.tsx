import { useEffect, useState } from 'react';
import { Navigate, useParams } from 'react-router-dom';
import { TopBar } from '../../ui/TopBar';
import { BackButton } from '../../ui/BackButton';
import { Button } from '../../ui/Button';
import { Skeleton } from '../../ui/Skeleton';
import { Toast, type ToastMessage } from '../../ui/Toast';
import { ChevronRight } from '../../ui/icons';
import { useNav } from '../../ui/nav';
import { useLive } from '../../hooks/useLive';
import { db } from '../../db/schema';
import { deleteGym, gymInUse, GymInUseError, LastGymError, setGymDetails } from '../../db/gymList';
import { equipmentSummary } from '../../lib/gymPresets';
import { MakeActive } from '../../components/gym/MakeActive';
import styles from '../Settings.module.css';
import gymStyles from './Gyms.module.css';
import { useToastTimeout } from '../../ui/useToastTimeout';

let toastSeq = 0;

/** A text field that saves when the user is done with it (blur or the keyboard's Done). */
function SavedField({ label, value, placeholder, testId, onSave }: { label: string; value: string; placeholder: string; testId: string; onSave: (v: string) => void }) {
  const [text, setText] = useState(value);
  useEffect(() => setText(value), [value]);
  const save = () => {
    if (text.trim() !== value) onSave(text);
  };
  return (
    <label className={gymStyles.field}>
      <span className={gymStyles.fieldLabel}>{label}</span>
      <input
        type="text"
        className={gymStyles.input}
        value={text}
        maxLength={40}
        placeholder={placeholder}
        autoComplete="off"
        autoCapitalize="words"
        enterKeyHint="done"
        onChange={(e) => setText(e.target.value)}
        onBlur={save}
        onKeyDown={(e) => {
          if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
        }}
        data-testid={testId}
      />
    </label>
  );
}

/**
 * One gym (PLAN 3.9): its name and city, Make active (with the workout preview when one is going),
 * its equipment, and Delete with Undo, only while no workout was logged there (else it says why).
 */
export function GymDetail() {
  const { gymId = '' } = useParams();
  const go = useNav();
  const gym = useLive(() => db.gyms.get(gymId), [gymId]);
  const used = useLive(() => gymInUse(gymId), [gymId]);
  const count = useLive(() => db.gyms.count(), []);
  const [toast, setToast] = useState<ToastMessage | null>(null);
  const [saveError, setSaveError] = useState(false);
  const g = gym.data;

  useToastTimeout(toast, setToast);

  if (gym.ready && !gym.error && !g) return <Navigate to="/settings/gyms" replace />;

  const save = (patch: { name?: string; city?: string }) => {
    setSaveError(false);
    setGymDetails(gymId, patch).catch(() => setSaveError(true));
  };

  const remove = async () => {
    try {
      const receipt = await deleteGym(gymId);
      setToast(null);
      go('/settings/gyms', { kind: 'pop', replace: true, state: { gymDeleted: receipt } });
    } catch (err) {
      setToast({
        id: ++toastSeq,
        text: err instanceof GymInUseError ? 'Workouts were logged here, so it stays' : err instanceof LastGymError ? 'You need at least one gym' : 'Could not delete it. Try again.',
      });
    }
  };

  const only = (count.data ?? 0) <= 1;
  const blocked = used.data ? 'Workouts were logged here. Their history needs this gym, so it stays.' : only ? 'You need at least one gym.' : null;

  return (
    <>
      <TopBar title={g?.name ?? 'Gym'} leading={<BackButton to="/settings/gyms" label="Back to Gyms" />} />
      {!g ? (
        <Skeleton height={240} radius={20} />
      ) : (
        <>
          <section className={styles.group} aria-label="Where you train">
            <MakeActive gym={g} onToast={setToast} />
          </section>
          <section className={styles.group} aria-labelledby="gym-about">
            <h2 id="gym-about" className={styles.groupTitle}>
              Name and place
            </h2>
            <div className={`${styles.card} ${gymStyles.fields}`}>
              <SavedField label="Name" value={g.name} placeholder="My Gym" testId="detail-name" onSave={(name) => save({ name })} />
              <SavedField label="City (optional)" value={g.city ?? ''} placeholder="Tokyo" testId="detail-city" onSave={(city) => save({ city })} />
            </div>
            <p className={styles.error} role="status">
              {saveError ? 'Could not save that. Try again.' : ''}
            </p>
          </section>
          <section className={styles.group} aria-labelledby="gym-kit">
            <h2 id="gym-kit" className={styles.groupTitle}>
              What it has
            </h2>
            <div className={styles.card}>
              <button type="button" className={`${styles.linkRow} pressable`} onClick={() => go(`/settings/gyms/${g.id}/equipment`, { kind: 'push' })} data-testid="edit-equipment">
                <span className={styles.unitText}>
                  <span className={styles.unitLabel}>Equipment</span>
                  <span className={styles.unitHint} data-testid="detail-equipment">
                    {equipmentSummary(g)}
                  </span>
                </span>
                <ChevronRight className={styles.chevron} aria-hidden="true" />
              </button>
            </div>
            <p className={gymStyles.note}>Plates, bars and machine weights are asked the first time you use them here.</p>
          </section>
          <section className={styles.group} aria-label="Delete">
            <Button variant="destructive" block onClick={() => void remove()} disabled={!used.ready || !count.ready || blocked !== null} disabledReason={blocked ?? undefined} data-testid="delete-gym">
              Delete gym
            </Button>
          </section>
        </>
      )}
      <Toast toast={toast} />
    </>
  );
}
