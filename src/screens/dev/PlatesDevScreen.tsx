import { useState } from 'react';
import { PlateDiagram } from '../../components/load/PlateDiagram';
import { defaultBars, defaultPlateColors, defaultPlateInventory } from '../../db/gyms';
import type { Collars, PlateColors, Unit } from '../../db/types';
import { useActiveGym } from '../../db/useActiveGym';
import { enabledPlates, formatWeight, solvePlates } from '../../lib/load';
import { DevErrorBoundary, DevErrorLog } from './DevErrors';
import styles from './PlatesDevScreen.module.css';

const PRESETS: Record<Unit, number[]> = { lb: [135, 185, 315], kg: [60, 102.5] };

type Setup = { bar: number | null; inventory: number[]; collars: Collars; colorMode: PlateColors };

/** Dev harness for the plate diagram (#/dev/plates). Hidden behind the dev flag. */
export function PlatesDevScreen() {
  const gym = useActiveGym();
  const [unit, setUnit] = useState<Unit>('lb');
  const [unknownBar, setUnknownBar] = useState(false);
  const [perSide, setPerSide] = useState<number[]>([]);

  // The active gym's settings when it uses this unit, else the SPEC defaults.
  const setup: Setup =
    gym && gym.unit === unit
      ? { bar: gym.bars.olympic, inventory: enabledPlates(gym.plateInventory), collars: gym.collars, colorMode: gym.plateColors }
      : {
          bar: defaultBars(unit).olympic,
          inventory: enabledPlates(defaultPlateInventory(unit)),
          collars: 'none',
          colorMode: defaultPlateColors(unit),
        };
  const bar = unknownBar ? null : setup.bar;

  const switchUnit = (u: Unit) => {
    setUnit(u);
    setPerSide([]);
  };

  const preset = (target: number) => {
    if (setup.bar === null) return;
    setUnknownBar(false);
    const r = solvePlates(target, { bar: setup.bar, inventory: setup.inventory, collars: setup.collars, unit });
    if (r.exact) setPerSide(r.perSide);
  };

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <h1 className={styles.title}>Plates</h1>
        <div className={styles.segment} role="group" aria-label="Unit">
          {(['lb', 'kg'] as const).map((u) => (
            <button key={u} type="button" className={`${styles.seg} pressable`} aria-pressed={unit === u} onClick={() => switchUnit(u)}>
              {u}
            </button>
          ))}
        </div>
      </header>

      <div className={styles.presets}>
        {PRESETS[unit].map((t) => (
          <button key={t} type="button" className={`${styles.preset} pressable`} onClick={() => preset(t)}>
            {formatWeight(t, unit)}
          </button>
        ))}
        <button type="button" className={`${styles.preset} pressable`} aria-pressed={unknownBar} onClick={() => setUnknownBar((v) => !v)}>
          Bar unknown
        </button>
      </div>

      <section className={styles.card}>
        <DevErrorBoundary name="Plate diagram">
          <PlateDiagram
            unit={unit}
            bar={bar}
            inventory={setup.inventory}
            collars={setup.collars}
            colorMode={setup.colorMode}
            value={perSide}
            onChange={setPerSide}
          />
        </DevErrorBoundary>
      </section>
      <DevErrorLog />
    </div>
  );
}
