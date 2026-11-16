import { useState } from 'react';
import { Segmented } from '../../ui/Segmented';
import { Switch } from '../../ui/Switch';
import { undoToast, type ToastMessage } from '../../ui/Toast';
import { setGymPlateColors, switchGymUnit } from '../../hooks/gymUnit';
import type { Gym, Unit } from '../../db/types';
import styles from '../Settings.module.css';

type Props = {
  gym: Gym | undefined;
  /** Shows a toast on Settings (one toast spot per screen). */
  toast: (make: (id: number) => ToastMessage) => void;
};

/**
 * The active gym's units and plate colors on Settings. SPEC 3: lb or kg is per gym, and switching
 * starts its plates, bars and dumbbells from that unit's set. 3.6z A14 (SPEC 13.1): the switch says
 * so with an Undo that puts the gym's weights back as they were, never a confirm.
 */
export function GymUnitSettings({ gym, toast }: Props) {
  const [error, setError] = useState(false);

  const units = async (unit: Unit) => {
    if (!gym || gym.unit === unit) return;
    setError(false);
    const was = gym.unit;
    let switched: Awaited<ReturnType<typeof switchGymUnit>>;
    try {
      switched = await switchGymUnit(gym, unit);
    } catch {
      setError(true);
      return;
    }
    const undo = async () => {
      try {
        await switched.undo();
        toast((id) => ({ id, text: `Back to ${was}` }));
      } catch {
        toast((id) => ({ id, text: 'Could not undo that. Try again.', action: { label: 'Try again', onPress: () => void undo() } }));
      }
    };
    toast((id) => undoToast(id, `Units changed to ${unit}`, () => void undo()));
  };

  const plates = async (on: boolean) => {
    if (!gym) return;
    setError(false);
    try {
      await setGymPlateColors(gym, on);
    } catch {
      setError(true);
    }
  };

  return (
    <section className={styles.group} aria-labelledby="set-plates">
      <h2 id="set-plates" className={styles.groupTitle}>
        {gym ? gym.name : 'Gym'}
      </h2>
      <div className={styles.card}>
        <div className={styles.unitRow}>
          <span className={styles.unitText}>
            <span className={styles.unitLabel} id="units-label">
              Units
            </span>
            <span className={styles.unitHint}>Plates and bars switch to the standard set for that unit.</span>
          </span>
          <Segmented
            labelledBy="units-label"
            testId="settings-units"
            options={[
              { value: 'lb', label: 'lb' },
              { value: 'kg', label: 'kg' },
            ]}
            value={gym?.unit}
            disabled={!gym}
            onChange={(u) => void units(u)}
          />
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
  );
}
