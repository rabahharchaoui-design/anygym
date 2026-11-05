import { useEffect, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { TopBar } from '../../ui/TopBar';
import { BackButton } from '../../ui/BackButton';
import { Button } from '../../ui/Button';
import { Sheet } from '../../ui/Sheet';
import { Skeleton } from '../../ui/Skeleton';
import { Toast, type ToastMessage } from '../../ui/Toast';
import { ChevronRight } from '../../ui/icons';
import { useNav } from '../../ui/nav';
import { useLive } from '../../hooks/useLive';
import { db } from '../../db/schema';
import { addGym, undoDeleteGym, type GymDeleteReceipt, type NewGym } from '../../db/gymList';
import { UNDO_MS } from '../../lib/undoQueue';
import { gymLine, recentGyms } from '../../lib/gymPresets';
import { NewGymForm } from '../../components/gym/NewGymForm';
import { TYPE_ICON } from '../../components/gym/gymIcons';
import styles from '../Settings.module.css';
import gymStyles from './Gyms.module.css';

let toastSeq = 0;

const isDeleted = (state: unknown): state is { gymDeleted: GymDeleteReceipt } =>
  typeof state === 'object' && state !== null && 'gymDeleted' in state && typeof (state as { gymDeleted: unknown }).gymDeleted === 'object';

/**
 * Settings → Gyms (PLAN 3.9, SPEC 3 and 19): every gym with its place and what it has, the active one
 * marked. Tap one to rename it, make it active, edit its equipment or delete it. + New gym adds one.
 */
export function GymsScreen() {
  const go = useNav();
  const navigate = useNavigate();
  const location = useLocation();
  const gyms = useLive(() => db.gyms.toArray(), []);
  const [adding, setAdding] = useState(false);
  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState<ToastMessage | null>(null);
  const active = gyms.data?.find((g) => g.isActive) ?? gyms.data?.[0];

  // Back from a gym that was deleted: "Deleted Hotel gym · Undo" (SPEC 13.1: Undo, never a confirm).
  useEffect(() => {
    const state: unknown = location.state;
    if (!isDeleted(state)) return;
    const receipt = state.gymDeleted;
    navigate('/settings/gyms', { replace: true, state: null });
    setToast({
      id: ++toastSeq,
      lead: 'Deleted',
      subject: receipt.gym.name,
      text: '',
      action: {
        label: 'Undo',
        onPress: () => {
          setToast(null);
          undoDeleteGym(receipt).catch(() => setToast({ id: ++toastSeq, text: 'Could not bring it back. Try again.' }));
        },
      },
    });
  }, [location.state, navigate]);

  useEffect(() => {
    if (!toast) return;
    const t = window.setTimeout(() => setToast((now) => (now?.id === toast.id ? null : now)), toast.action ? UNDO_MS : 3000);
    return () => window.clearTimeout(t);
  }, [toast]);

  const add = async (input: NewGym) => {
    if (busy) return;
    setBusy(true);
    try {
      const gym = await addGym(input);
      setAdding(false);
      setToast({ id: ++toastSeq, lead: 'Added', subject: gym.name, text: '' });
    } catch {
      setToast({ id: ++toastSeq, text: 'Could not add that gym. Try again.' });
    } finally {
      setBusy(false);
    }
  };

  const list = recentGyms(gyms.data ?? []);
  return (
    <>
      <TopBar title="Gyms" leading={<BackButton to="/settings" label="Back to Settings" />} />
      <p className={gymStyles.intro}>Where you train. Each gym keeps its own equipment, plates and units.</p>
      {!gyms.ready ? (
        <Skeleton height={200} radius={20} />
      ) : (
        <div className={styles.card} data-testid="gyms-list">
          {list.map((g, i) => {
            const Icon = TYPE_ICON[g.type];
            const here = g.id === active?.id;
            return (
              <button
                key={g.id}
                type="button"
                className={`${styles.linkRow} ${i < list.length - 1 ? styles.divided : ''} pressable`}
                onClick={() => go(`/settings/gyms/${g.id}`, { kind: 'push' })}
                aria-current={here ? 'true' : undefined}
                data-testid={`gyms-row-${g.id}`}
              >
                <span className={gymStyles.tile} data-active={here || undefined} aria-hidden="true">
                  <Icon width={20} height={20} strokeWidth={2} />
                </span>
                <span className={`${styles.unitText} ${gymStyles.grow}`}>
                  <span className={styles.unitLabel}>
                    {g.name}
                    {here && <span className={gymStyles.active}> · Active</span>}
                  </span>
                  <span className={styles.unitHint}>
                    {gymLine(g)} · {g.unit}
                  </span>
                </span>
                <ChevronRight className={styles.chevron} aria-hidden="true" />
              </button>
            );
          })}
        </div>
      )}
      <div className={gymStyles.actions}>
        <Button variant="secondary" onClick={() => setAdding(true)} disabled={!gyms.ready} data-testid="settings-new-gym">
          + New gym
        </Button>
      </div>
      <Sheet open={adding} onClose={() => setAdding(false)} label="New gym" scroll footer>
        {adding && <NewGymForm unit={active?.unit ?? 'lb'} busy={busy} submitLabel="Add gym" onSubmit={(g) => void add(g)} />}
      </Sheet>
      <Toast toast={toast} />
    </>
  );
}
