// The dumbbell rack, typed by hand (SPEC 3): lightest, heaviest and the jump between them, in the
// gym's unit. PLAN 3.5j (G: "dumbbells up to 22 kg", he also thinks in lb): the heaviest may be typed
// in the other unit; load.ts turns it into the rack's heaviest at or under it. Every number here
// comes from load.ts; this file only shows them.
import { useState } from 'react';
import { SlidingToggle } from '../../ui/SlidingToggle';
import type { DumbbellRange, Unit } from '../../db/types';
import { dumbbellRangeProblems, formatAmount, formatInOther, formatWeight, otherUnit, parseDumbbellRange, type DumbbellRangeProblems } from '../../lib/load';
import rangeStyles from './IntakeRange.module.css';
import fieldStyles from './IntakeFields.module.css';

const RANGE_WORDS: Record<NonNullable<DumbbellRangeProblems['min' | 'max' | 'step']>, string> = {
  number: 'type a number.',
  zero: 'must be above 0.',
  'under-min': 'must not be under the lightest.',
  'too-heavy': 'is more than any dumbbell weighs.',
  'too-small': 'is not a step dumbbells come in.',
  'misses-max': 'never lands on the heaviest.',
};
const RANGE_LABEL = { min: 'Lightest', max: 'Heaviest', step: 'Goes up by' } as const;
const RANGE_EXAMPLE: Record<Unit, Record<keyof typeof RANGE_LABEL, string>> = {
  lb: { min: '5', max: '50', step: '5' },
  kg: { min: '2', max: '24', step: '2' },
};

type Text = Record<keyof typeof RANGE_LABEL, string>;

export function DumbbellRangeFields({ range, unit, onRange }: { range: DumbbellRange | undefined; unit: Unit; onRange: (r: DumbbellRange | undefined) => void }) {
  const [text, setText] = useState<Text>({ min: range ? formatAmount(range.min) : '', max: range ? formatAmount(range.max) : '', step: range ? formatAmount(range.step) : '' });
  // The unit the heaviest is typed in; the lightest and the steps are always the gym's.
  const [maxUnit, setMaxUnit] = useState<Unit>(unit);
  const parsed = parseDumbbellRange(text.min, text.max, text.step, unit, maxUnit);
  const send = (next: Text, mu: Unit) => onRange(parseDumbbellRange(next.min, next.max, next.step, unit, mu) ?? undefined);
  const change = (key: keyof Text, v: string) => {
    const next = { ...text, [key]: v };
    setText(next);
    send(next, maxUnit);
  };
  // Another unit for the heaviest starts it empty: 50 lb is never read as 50 kg.
  const pickUnit = (mu: Unit) => {
    const next = { ...text, max: '' };
    setMaxUnit(mu);
    setText(next);
    send(next, mu);
  };
  const problems = dumbbellRangeProblems(text.min, text.max, text.step, unit, maxUnit);
  const first = (['min', 'max', 'step'] as const).find((k) => problems[k]);
  const label = (key: keyof Text) => (key === 'max' && maxUnit !== unit ? `${RANGE_LABEL.max}, ${maxUnit}` : RANGE_LABEL[key]);
  const field = (key: keyof Text) => (
    <label className={rangeStyles.rangeField}>
      <span className={fieldStyles.fieldLabel}>{label(key)}</span>
      <input
        className={`${rangeStyles.rangeInput} num`}
        inputMode="decimal"
        enterKeyHint="next"
        placeholder={RANGE_EXAMPLE[key === 'max' ? maxUnit : unit][key]}
        value={text[key]}
        aria-invalid={problems[key] ? true : undefined}
        onChange={(e) => change(key, e.target.value)}
        data-testid={`range-${key}`}
      />
    </label>
  );
  return (
    <fieldset className={rangeStyles.range} data-testid="dumbbell-range">
      <legend className={rangeStyles.rangeTitle}>Your dumbbells, in {unit}</legend>
      <div className={rangeStyles.rangeFields}>
        {field('min')}
        {field('max')}
        {field('step')}
      </div>
      <div className={rangeStyles.rangeUnitRow}>
        <span className={fieldStyles.fieldLabel} id="range-max-unit-label">
          Heaviest typed in
        </span>
        <SlidingToggle
          labelledBy="range-max-unit-label"
          testId="range-max-unit"
          options={[
            { value: unit, label: unit },
            { value: otherUnit(unit), label: otherUnit(unit) },
          ]}
          value={maxUnit}
          onChange={pickUnit}
        />
      </div>
      {/* One reserved line: what is wrong, else the rack's heaviest in both units (no layout shift). */}
      <div className={rangeStyles.rangeStatus}>
        <p className={rangeStyles.rangeNote} role="status" data-testid="range-note">
          {first ? `${RANGE_LABEL[first]}: ${RANGE_WORDS[problems[first]!]}` : ''}
        </p>
        <p className={rangeStyles.rangeCap} data-testid="range-cap">
          {parsed && !first ? `Heaviest here: ${formatWeight(parsed.max, unit)}, ${formatInOther(parsed.max, unit)}` : ''}
        </p>
      </div>
    </fieldset>
  );
}
