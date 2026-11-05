import { useEffect, useState } from 'react';
import { Sheet } from '../../ui/Sheet';
import { BackButton } from '../../ui/BackButton';
import { CheckIcon, PlusIcon } from '../../ui/icons';
import { TYPE_ICON } from './gymIcons';
import { useNav } from '../../ui/nav';
import { useLive } from '../../hooks/useLive';
import { db } from '../../db/schema';
import { addGym, type NewGym } from '../../db/gymList';
import type { Gym } from '../../db/types';
import { gymLine, recentGyms } from '../../lib/gymPresets';
import type { ToastMessage } from '../../ui/Toast';
import { NewGymForm } from './NewGymForm';
import { SwitchPreview } from './SwitchPreview';
import { useGymSwitch } from './useGymSwitch';
import styles from './Gym.module.css';

type Props = {
  open: boolean;
  onClose: () => void;
  active: Gym | undefined;
  onToast: (t: ToastMessage) => void;
  /** Inside a workout: no way out to Settings from here (the workout stays on screen). */
  inWorkout?: boolean;
};

/**
 * The gym sheet (PLAN 3.9, SPEC 19): recent gyms, the active one checked; one tap on another one
 * switches (two taps from the pill). "+ New gym" adds one from a preset and switches to it. In the
 * middle of a workout, a switch that changes it shows the preview first.
 */
export function GymSheet({ open, onClose, active, onToast, inWorkout = false }: Props) {
  const go = useNav();
  const [view, setView] = useState<'list' | 'new'>('list');
  const [adding, setAdding] = useState(false);
  const gyms = useLive(() => db.gyms.toArray(), []);
  const sw = useGymSwitch(onToast, () => active?.name);
  const { cancel } = sw;
  useEffect(() => {
    if (!open) return;
    setView('list');
    cancel();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const pick = async (gym: Pick<Gym, 'id' | 'name'>) => {
    if (gym.id === active?.id) return onClose();
    if (await sw.pick(gym)) onClose();
  };

  const add = async (input: NewGym) => {
    if (adding) return;
    setAdding(true);
    try {
      const gym = await addGym(input);
      if (await sw.pick(gym)) onClose();
    } catch {
      onToast({ id: Date.now(), text: 'Could not add that gym. Try again.' });
    } finally {
      setAdding(false);
    }
  };

  const confirming = sw.pending !== null;
  const back = confirming ? () => sw.cancel() : view === 'new' ? () => setView('list') : null;
  const list = recentGyms(gyms.data ?? []);
  return (
    <Sheet
      open={open}
      onClose={onClose}
      label={confirming ? 'Switch gym' : view === 'new' ? 'New gym' : 'Gyms'}
      scroll
      footer={confirming || view === 'new'}
      header={back ? <BackButton onPress={back} label={confirming ? 'Back to gyms' : 'Back to gyms'} /> : undefined}
    >
      {confirming ? (
        <SwitchPreview pending={sw.pending!} fromName={active?.name} busy={sw.busy} onConfirm={() => void sw.confirm().then((ok) => ok && onClose())} onStay={onClose} />
      ) : view === 'new' ? (
        <NewGymForm unit={active?.unit ?? 'lb'} busy={adding || sw.busy} submitLabel="Add and switch" onSubmit={(g) => void add(g)} />
      ) : (
        <div className={styles.body} data-testid="gym-sheet">
          <h2 className={styles.title}>Where are you training?</h2>
          <ul className={styles.list}>
            {list.map((g) => {
              const Icon = TYPE_ICON[g.type];
              const here = g.id === active?.id;
              return (
                <li key={g.id}>
                  <button
                    type="button"
                    className={`${styles.row} pressable`}
                    aria-current={here ? 'true' : undefined}
                    disabled={sw.busy}
                    onClick={() => void pick(g)}
                    data-testid={`gym-${g.id}`}
                  >
                    <span className={styles.tile} aria-hidden="true">
                      <Icon width={22} height={22} strokeWidth={2} />
                    </span>
                    <span className={styles.text}>
                      <span className={styles.name}>{g.name}</span>
                      <span className={styles.line}>{gymLine(g)}</span>
                    </span>
                    {here && <CheckIcon className={styles.check} strokeWidth={3} aria-label="Active" />}
                  </button>
                </li>
              );
            })}
            <li>
              <button type="button" className={`${styles.row} pressable`} onClick={() => setView('new')} data-testid="new-gym-row">
                <span className={`${styles.tile} ${styles.newTile}`} aria-hidden="true">
                  <PlusIcon width={22} height={22} strokeWidth={2.4} />
                </span>
                <span className={styles.text}>
                  <span className={styles.name}>New gym</span>
                  <span className={styles.line}>Hotel, home, a park or a full gym</span>
                </span>
              </button>
            </li>
          </ul>
          {!inWorkout && (
            <button
              type="button"
              className={`${styles.link} pressable`}
              onClick={() => {
                onClose();
                go('/settings/gyms', { kind: 'push' });
              }}
              data-testid="edit-gyms"
            >
              Edit gyms
            </button>
          )}
        </div>
      )}
    </Sheet>
  );
}
