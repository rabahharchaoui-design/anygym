import { Button } from '../../ui/Button';
import { Sheet } from '../../ui/Sheet';
import { CheckIcon } from '../../ui/icons';
import type { ToastMessage } from '../../ui/Toast';
import { useLive } from '../../hooks/useLive';
import { db } from '../../db/schema';
import type { Gym } from '../../db/types';
import { useGymSwitch, type GymSwitch } from './useGymSwitch';
import { SwitchPreview } from './SwitchPreview';
import styles from './Gym.module.css';

/**
 * Make active for one gym (PLAN 3.9; 3.5j: also under its equipment, so a new gym is "tap your
 * equipment, Make active"). Once it is the active one it says so instead. A workout in progress
 * gets its preview first (useGymSwitch), always with Undo.
 */
export function MakeActive({ gym, onToast }: { gym: Pick<Gym, 'id' | 'name' | 'isActive'>; onToast: (t: ToastMessage) => void }) {
  const activeName = useActiveName();
  const sw = useGymSwitch(onToast, () => activeName.data);
  return (
    <>
      {gym.isActive ? (
        <p className={styles.here} data-testid="gym-is-active">
          <CheckIcon width={18} height={18} strokeWidth={3} aria-hidden="true" />
          You are training here
        </p>
      ) : (
        <Button onClick={() => void sw.pick(gym)} disabled={sw.busy} data-testid="make-active">
          Make active
        </Button>
      )}
      <SwitchSheet sw={sw} fromName={activeName.data} />
    </>
  );
}

/** The switch preview, while a switch waits for its confirm (a workout is in progress). */
export function SwitchSheet({ sw, fromName }: { sw: GymSwitch; fromName: string | undefined }) {
  return (
    <Sheet open={sw.pending !== null} onClose={sw.cancel} label="Switch gym" scroll footer>
      {sw.pending && <SwitchPreview pending={sw.pending} fromName={fromName} busy={sw.busy} onConfirm={() => void sw.confirm()} onStay={sw.cancel} />}
    </Sheet>
  );
}

/** The active gym's name, live (the switch toasts say where you came from). */
export const useActiveName = () => useLive(async () => (await db.gyms.toArray()).find((x) => x.isActive)?.name, []);
