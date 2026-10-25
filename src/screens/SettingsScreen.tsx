import { useState, useSyncExternalStore } from 'react';
import { TopBar } from '../ui/TopBar';
import { BackButton } from '../ui/BackButton';
import { Switch } from '../ui/Switch';
import { haptics } from '../ui/haptics';
import { useActiveGym } from '../db/useActiveGym';
import { setGymUnit, setPlateColors } from '../db/equipment';
import type { Unit } from '../db/types';
import { version } from '../../package.json';
import styles from './Settings.module.css';

/**
 * Settings (PLAN 1.7e): small and honest. Haptics on this phone, plate colors for this gym, and
 * which version is running. Gyms, units and backups come with their own items.
 */
export function SettingsScreen() {
  const hapticsOn = useSyncExternalStore(haptics.subscribe, haptics.enabled, () => true);
  const gym = useActiveGym();
  const [error, setError] = useState(false);

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
          <p className={styles.note}>Everything you log stays on this phone and works offline.</p>
        </div>
      </section>
    </>
  );
}
