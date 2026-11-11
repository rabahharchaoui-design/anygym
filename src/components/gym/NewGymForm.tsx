import { useState } from 'react';
import { EquipmentStep } from '../../screens/intake/Steps';
import { equipmentPreset } from '../../db/gyms';
import { EQUIPMENT_IDS, type DumbbellRange, type EquipmentId } from '../../db/types';
import { ChoiceCard } from '../../ui/ChoiceCard';
import { SlidingToggle } from '../../ui/SlidingToggle';
import { Button } from '../../ui/Button';
import { SheetFooter } from '../../ui/Sheet';
import { PRESET_ICON } from './gymIcons';
import { GYM_PRESETS, presetById, type GymPresetId } from '../../lib/gymPresets';
import type { Unit } from '../../db/types';
import type { NewGym } from '../../db/gymList';
import styles from './Gym.module.css';

/**
 * + New gym (PLAN 3.9, SPEC 19): what kind of place, then a name (the kind's own name until one is
 * typed) and an optional city, and its unit. The kind only sets the equipment it starts with;
 * PLAN 3.5j: right here the user taps what the place really has, and the heaviest dumbbell (in kg or
 * lb). The plates and machines are asked on first use, never guessed.
 */
export function NewGymForm({ unit: startUnit, busy, submitLabel, onSubmit }: { unit: Unit; busy: boolean; submitLabel: string; onSubmit: (gym: NewGym) => void }) {
  const [preset, setPreset] = useState<GymPresetId | null>(null);
  const [name, setName] = useState('');
  const [city, setCity] = useState('');
  const [unit, setUnit] = useState<Unit>(startUnit);
  const [equipment, setEquipment] = useState<EquipmentId[]>([]);
  const [range, setRange] = useState<DumbbellRange | undefined>(undefined);
  const placeholder = preset ? presetById(preset).label : 'Hotel in Tokyo';
  // The kind (and the unit) start the equipment and the rack from the SPEC 3 preset, never a guess.
  const start = (id: GymPresetId, u: Unit, keep?: EquipmentId[]) => {
    const p = equipmentPreset(presetById(id).type, u);
    setEquipment(keep ?? p.equipment);
    setRange(p.dumbbellRange ?? undefined);
  };
  const dumbbells = equipment.includes('dumbbells');
  const rackMissing = dumbbells && range === undefined;
  return (
    <div className={styles.form} data-testid="new-gym">
      <h2 className={styles.title}>New gym</h2>
      <div className={styles.presets} role="group" aria-label="What kind of place">
        {GYM_PRESETS.map((p) => (
          <ChoiceCard
            key={p.id}
            icon={PRESET_ICON[p.id]}
            label={p.label}
            hint={p.hint}
            picked={preset === p.id}
            onPress={() => {
              if (preset !== p.id) start(p.id, unit);
              setPreset(p.id);
            }}
            testId={`preset-${p.id}`}
          />
        ))}
      </div>
      <label className={styles.field}>
        <span className={styles.fieldLabel}>Name</span>
        <input
          type="text"
          className={styles.input}
          value={name}
          maxLength={40}
          placeholder={placeholder}
          autoComplete="off"
          autoCapitalize="words"
          enterKeyHint="next"
          onChange={(e) => setName(e.target.value)}
          data-testid="gym-name"
        />
      </label>
      <label className={styles.field}>
        <span className={styles.fieldLabel}>City (optional)</span>
        <input
          type="text"
          className={styles.input}
          value={city}
          maxLength={40}
          placeholder="Tokyo"
          autoComplete="address-level2"
          autoCapitalize="words"
          enterKeyHint="done"
          onChange={(e) => setCity(e.target.value)}
          data-testid="gym-city"
        />
      </label>
      <div className={styles.unitRow}>
        <span className={styles.fieldLabel} id="new-gym-unit">
          Weights there are in
        </span>
        <SlidingToggle
          labelledBy="new-gym-unit"
          testId="gym-unit"
          options={[
            { value: 'lb', label: 'lb' },
            { value: 'kg', label: 'kg' },
          ]}
          value={unit}
          onChange={(u) => {
            setUnit(u);
            // The rack is in the unit: 50 lb is never read as 50 kg.
            if (preset) start(preset, u, equipment);
          }}
        />
      </div>
      {preset && (
        <section className={styles.kit} aria-labelledby="new-gym-kit" data-testid="new-gym-equipment">
          <h3 className={styles.kitTitle} id="new-gym-kit">
            Tap what it has
          </h3>
          <EquipmentStep
            key={`${preset}-${unit}`}
            value={equipment}
            onChange={(next) => {
              setEquipment(next);
              if (!next.includes('dumbbells')) setRange(undefined);
              // Dumbbells back on: the kind's rack again (Home has none: typed by the user).
              else if (!dumbbells) setRange(equipmentPreset(presetById(preset).type, unit).dumbbellRange ?? undefined);
            }}
            askRange={dumbbells}
            range={range}
            unit={unit}
            onRange={setRange}
            choices={EQUIPMENT_IDS}
          />
        </section>
      )}
      <SheetFooter>
        <Button
          onClick={() => preset && !rackMissing && onSubmit({ preset, name: name.trim() || presetById(preset).label, ...(city.trim() ? { city } : {}), unit, equipment, dumbbellRange: dumbbells ? range! : null })}
          disabled={!preset || busy || rackMissing}
          disabledReason={!preset ? 'Pick what kind of place it is' : rackMissing ? 'Type the dumbbells it has' : undefined}
          data-testid="add-gym"
        >
          {submitLabel}
        </Button>
      </SheetFooter>
    </div>
  );
}
