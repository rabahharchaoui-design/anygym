// The intake's optional "about you" screens (SPEC 14 step 13): name, height, age and bodyweight.
// Moved out of Steps.tsx as they were (PLAN 3.5f, code organization).
import { useState } from 'react';
import { Chip } from '../../ui/Chip';
import { SlidingToggle } from '../../ui/SlidingToggle';
import { WheelColumn } from '../../ui/WheelColumn';
import type { Unit } from '../../db/types';
import { AGE_RANGES, type AgeRangeId } from '../../lib/intake/options';
import { HEIGHT_CM, HEIGHT_FT, type Height, type IntakeAnswers } from '../../lib/intake/funnel';
import { flipBodyweight, RULER_START } from '../../lib/intake/ruler';
import { cmToFtIn, formatBodyweight, ftInToCm } from '../../lib/load';
import { BodyweightRuler } from './BodyweightRuler';
import styles from './Intake.module.css';
import fieldStyles from './IntakeFields.module.css';

/** The most a name can be (lib/intake/funnel.ts sanitize keeps the same). */
const NAME_MAX = 40;

/** SPEC 14 step 13: name, height and age on one optional screen. Each is saved only if given. */
export function AboutStep({
  answers,
  onName,
  onHeight,
  onAge,
  measure,
}: {
  answers: Pick<IntakeAnswers, 'name' | 'height' | 'age'>;
  onName: (v: string | undefined) => void;
  onHeight: (v: Height) => void;
  onAge: (v: AgeRangeId | undefined) => void;
  measure: 'cm' | 'in';
}) {
  const name = answers.name ?? '';
  return (
    <div className={fieldStyles.about}>
      <label className={fieldStyles.nameField}>
        <span className={fieldStyles.fieldLabel}>Your name</span>
        <input
          type="text"
          className={fieldStyles.nameInput}
          value={name}
          maxLength={NAME_MAX}
          autoComplete="given-name"
          autoCapitalize="words"
          enterKeyHint="done"
          onChange={(e) => onName(e.target.value || undefined)}
          data-testid="name-input"
        />
        <span className={fieldStyles.fieldHint} data-limit={name.length >= NAME_MAX || undefined} data-testid="name-hint">
          {name.length >= NAME_MAX ? `That's the limit: ${NAME_MAX} letters.` : 'Shown on your profile. Optional.'}
        </span>
      </label>
      <div className={fieldStyles.aboutGroup}>
        <span className={fieldStyles.fieldLabel}>Height</span>
        <HeightStep value={answers.height} measure={measure} onChange={onHeight} />
      </div>
      <div className={fieldStyles.aboutGroup}>
        <span className={fieldStyles.fieldLabel} id="age-label">
          Age
        </span>
        <div className={styles.chips} data-grid="2" role="group" aria-labelledby="age-label" data-testid="q-age">
          {AGE_RANGES.map((o) => (
            <Chip key={o.id} block label={o.label} picked={answers.age === o.id} onPress={() => onAge(answers.age === o.id ? undefined : o.id)} testId={`q-age-${o.id}`} />
          ))}
        </div>
      </div>
    </div>
  );
}

/** One huge number with its unit over the ruler; the unit toggle flips the number through load.ts. */
export function BodyweightStep({
  value,
  unit: defaultUnit,
  onChange,
}: {
  value: { value: number; unit: Unit } | undefined;
  unit: Unit;
  onChange: (v: { value: number; unit: Unit }) => void;
}) {
  const [shownUnit, setShownUnit] = useState<Unit>(value?.unit ?? defaultUnit);
  const [start, setStart] = useState<number>(value?.value ?? RULER_START[value?.unit ?? defaultUnit]);
  const unit = value?.unit ?? shownUnit;
  const current = value?.value ?? start;
  const flip = (to: Unit) => {
    if (to === unit) return;
    setShownUnit(to);
    if (value) onChange({ value: flipBodyweight(value.value, value.unit, to), unit: to });
    else setStart(RULER_START[to]);
  };
  return (
    <div className={fieldStyles.measure}>
      <SlidingToggle block label="Weight unit" testId="bw-unit" options={[{ value: 'kg', label: 'Kilograms' }, { value: 'lb', label: 'Pounds' }]} value={unit} onChange={flip} />
      <p className={`${fieldStyles.bigNumber} num`} data-touched={!!value || undefined} aria-live="polite" data-testid="bw-value">
        {formatBodyweight(current)}
        <span className={fieldStyles.bigUnit}>{unit}</span>
      </p>
      <BodyweightRuler unit={unit} value={current} touched={!!value} onChange={(v) => onChange({ value: v, unit })} />
      <p className={fieldStyles.measureHint} data-hidden={!!value || undefined}>
        Slide or tap to confirm
      </p>
    </div>
  );
}

const CM_ITEMS = Array.from({ length: HEIGHT_CM.max - HEIGHT_CM.min + 1 }, (_, i) => ({ value: HEIGHT_CM.min + i, label: `${HEIGHT_CM.min + i} cm` }));
const FT_ITEMS = Array.from({ length: HEIGHT_FT.max - HEIGHT_FT.min + 1 }, (_, i) => ({ value: HEIGHT_FT.min + i, label: `${HEIGHT_FT.min + i} ft` }));
const IN_ITEMS = Array.from({ length: 12 }, (_, i) => ({ value: i, label: `${i} in` }));
const START_CM = 170;
const START_IN = { ft: 5, in: 7 };

/** Two wheels (ft and in) or one (cm); the toggle converts through load.ts. */
export function HeightStep({ value, measure, onChange }: { value: Height | undefined; measure: 'cm' | 'in'; onChange: (v: Height) => void }) {
  const [shown, setShown] = useState<'cm' | 'in'>(value?.unit ?? measure);
  const unit = value?.unit ?? shown;
  const cm = value?.unit === 'cm' ? value.cm : START_CM;
  const ftIn = value?.unit === 'in' ? { ft: value.ft, in: value.in } : START_IN;
  const flip = (to: 'cm' | 'in') => {
    if (to === unit) return;
    setShown(to);
    if (!value) return;
    if (to === 'cm' && value.unit === 'in') onChange({ unit: 'cm', cm: Math.min(HEIGHT_CM.max, Math.max(HEIGHT_CM.min, ftInToCm(value.ft, value.in))) });
    if (to === 'in' && value.unit === 'cm') {
      const f = cmToFtIn(value.cm);
      onChange({ unit: 'in', ft: Math.min(HEIGHT_FT.max, Math.max(HEIGHT_FT.min, f.ft)), in: f.in });
    }
  };
  return (
    <div className={fieldStyles.measureTight}>
      <SlidingToggle block label="Height unit" testId="height-unit" options={[{ value: 'cm', label: 'Centimeters' }, { value: 'in', label: 'Feet and inches' }]} value={unit} onChange={flip} />
      <div className={fieldStyles.wheels} data-testid="height-wheels">
        {unit === 'cm' ? (
          <WheelColumn rows={3} items={CM_ITEMS} value={cm} picked={!!value} label="Height in centimeters" testId="wheel-cm" onChange={(v) => onChange({ unit: 'cm', cm: v })} />
        ) : (
          <>
            <WheelColumn rows={3} items={FT_ITEMS} value={ftIn.ft} picked={!!value} label="Feet" testId="wheel-ft" onChange={(v) => onChange({ unit: 'in', ft: v, in: ftIn.in })} />
            <WheelColumn rows={3} items={IN_ITEMS} value={ftIn.in} picked={!!value} label="Inches" testId="wheel-in" onChange={(v) => onChange({ unit: 'in', ft: ftIn.ft, in: v })} />
          </>
        )}
      </div>
      <p className={fieldStyles.measureHint} data-hidden={!!value || undefined}>
        Spin or tap to confirm
      </p>
    </div>
  );
}
