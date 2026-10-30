import { useEffect, useState } from 'react';
import { PlateDiagram } from '../../components/load/PlateDiagram';
import { defaultBars, defaultPlateColors, defaultPlateInventory } from '../../db/gyms';
import type { BarId, Collars, PlateColors, Unit } from '../../db/types';
import { useActiveGym } from '../../db/useActiveGym';
import { enabledPlates, formatWeight, solvePlates } from '../../lib/load';
import { barSpec } from '../../lib/plates';
import { DevErrorBoundary, DevErrorLog } from './DevErrors';
import styles from './PlatesDevScreen.module.css';

// The 2.0b true scale check loads, plus the older 185 lb and 102.5 kg ones.
const PRESETS: Record<Unit, number[]> = { lb: [45, 135, 185, 225, 315, 405], kg: [60, 100, 102.5, 140] };

/** URL presets for screenshots: #/dev/plates?dev&unit=kg&load=100&bar=womens&nohint. */
function urlSetup(): { unit: Unit; load: number | null; bar: BarId; hint: boolean } {
  const q = new URLSearchParams(window.location.hash.split('?')[1] ?? '');
  const unit: Unit = q.get('unit') === 'kg' ? 'kg' : 'lb';
  const load = Number(q.get('load'));
  return { unit, load: q.has('load') && Number.isFinite(load) ? load : null, bar: q.get('bar') === 'womens' ? 'womens' : 'olympic', hint: !q.has('nohint') };
}

type Setup = { bar: number | null; inventory: number[]; collars: Collars; colorMode: PlateColors };

/** Dev harness for the plate diagram (#/dev/plates). Hidden behind the dev flag. */
export function PlatesDevScreen() {
  const gym = useActiveGym();
  const [initial] = useState(urlSetup);
  const [unit, setUnit] = useState<Unit>(initial.unit);
  const [barId, setBarId] = useState<BarId>(initial.bar);
  const [unknownBar, setUnknownBar] = useState(false);
  const [perSide, setPerSide] = useState<number[]>([]);

  // The active gym's settings when it uses this unit, else the SPEC defaults.
  const setup: Setup =
    gym && gym.unit === unit
      ? { bar: gym.bars[barId], inventory: enabledPlates(gym.plateInventory), collars: gym.collars, colorMode: gym.plateColors }
      : {
          bar: defaultBars(unit)[barId],
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
    const r = solvePlates(target, { bar: setup.bar, inventory: setup.inventory, collars: setup.collars, unit, sleeveLength: barSpec(barId, unit).sleeve });
    if (r.exact) setPerSide(r.perSide);
  };

  // A load in the URL is applied once the gym (or the defaults) is known.
  const [applied, setApplied] = useState(false);
  useEffect(() => {
    if (applied || initial.load === null || setup.bar === null) return;
    setApplied(true);
    preset(initial.load);
  });

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
        <button type="button" className={`${styles.preset} pressable`} aria-pressed={barId === 'womens'} onClick={() => setBarId((b) => (b === 'womens' ? 'olympic' : 'womens'))}>
          Women's bar
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
            barId={barId}
            hint={initial.hint}
          />
        </DevErrorBoundary>
      </section>
      <DevErrorLog />
    </div>
  );
}
