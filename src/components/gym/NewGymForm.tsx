import { useState } from 'react';
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
 * typed) and an optional city, and its unit. The kind only sets the equipment it starts with; the
 * user edits it in Settings, and the plates and machines are asked on first use, never guessed.
 */
export function NewGymForm({ unit: startUnit, busy, submitLabel, onSubmit }: { unit: Unit; busy: boolean; submitLabel: string; onSubmit: (gym: NewGym) => void }) {
  const [preset, setPreset] = useState<GymPresetId | null>(null);
  const [name, setName] = useState('');
  const [city, setCity] = useState('');
  const [unit, setUnit] = useState<Unit>(startUnit);
  const placeholder = preset ? presetById(preset).label : 'Hotel in Tokyo';
  return (
    <div className={styles.form} data-testid="new-gym">
      <h2 className={styles.title}>New gym</h2>
      <div className={styles.presets} role="group" aria-label="What kind of place">
        {GYM_PRESETS.map((p) => (
          <ChoiceCard key={p.id} icon={PRESET_ICON[p.id]} label={p.label} hint={p.hint} picked={preset === p.id} onPress={() => setPreset(p.id)} testId={`preset-${p.id}`} />
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
          onChange={setUnit}
        />
      </div>
      <SheetFooter>
        <Button
          onClick={() => preset && onSubmit({ preset, name: name.trim() || presetById(preset).label, ...(city.trim() ? { city } : {}), unit })}
          disabled={!preset || busy}
          disabledReason={!preset ? 'Pick what kind of place it is' : undefined}
          data-testid="add-gym"
        >
          {submitLabel}
        </Button>
      </SheetFooter>
    </div>
  );
}
