import { useLayoutEffect, useMemo, useRef, useState } from 'react';
import { equipmentWeightFor, stackStepFor } from '../../db/gyms';
import type { Gym, Load } from '../../db/types';
import { DISPLAY_STACK_MAX, formatAmount, formatWeight, stackLoad, stackValues } from '../../lib/load';
import { useTapGuard } from '../../hooks/useTapGuard';
import { AddedWeightField } from './AddedWeightField';
import { EquipmentWeightSheet } from './EquipmentWeightSheet';
import base from './LoadInput.module.css';
import styles from './StackSelector.module.css';

type Props = {
  gym: Gym;
  /** Machine id for the per machine step, e.g. 'lat_pulldown'. */
  machineId: string;
  value: Load | null;
  onChange: (load: Load) => void;
};

const ROW = 48;

/**
 * Stack selector (SPEC 5.2): a vertical pin style list of stack plates; tap a plate to set the
 * pin. Values come from the machine's stack step. The list runs to DISPLAY_STACK_MAX (300 lb /
 * 140 kg) because real stack sizes are not known: a display range only, never data.
 */
export function StackSelector({ gym, machineId, value, onChange }: Props) {
  const unit = gym.unit;
  const step = stackStepFor(gym, machineId);
  const answered = equipmentWeightFor(gym, machineId)?.kind === 'stack_step';
  const pins = useMemo(() => stackValues(step, DISPLAY_STACK_MAX[unit]), [step, unit]);
  const own = value?.kind === 'stack' ? value : null;
  const pin = own?.stackValue ?? null;
  const pinIndex = pin === null ? -1 : pins.indexOf(pin);
  const [addedOn, setAddedOn] = useState((own?.added ?? 0) > 0);
  const [added, setAdded] = useState(own?.added ?? 0);
  const [asking, setAsking] = useState(false);
  const listRef = useRef<HTMLDivElement>(null);

  // Bring the pin into view on mount.
  useLayoutEffect(() => {
    const el = listRef.current;
    if (el && pinIndex > 2) el.scrollTop = (pinIndex - 2) * ROW;
  }, []);

  const emit = (stackValue: number, extra: number) => onChange(stackLoad(stackValue, unit, extra));

  const setPin = (v: number) => {
    if (v === pin) return;
    emit(v, addedOn ? added : 0);
  };

  const toggleAdded = useTapGuard(() => {
    const next = !addedOn;
    setAddedOn(next);
    if (pin !== null) emit(pin, next ? added : 0);
  });

  const changeAdded = (n: number) => {
    setAdded(n);
    if (pin !== null) emit(pin, n);
  };

  return (
    <div className={base.root}>
      <div className={base.readout}>
        <p className={`${base.total} num`} aria-live="polite" data-testid="stack-total">
          {own ? formatAmount(own.total) : <span className={base.placeholder}>–</span>}
          <span className={base.unit}>{unit}</span>
        </p>
        <p className={base.label}>stack</p>
        <p className={base.sub} data-testid="stack-sub">
          {own?.added ? `${formatAmount(own.stackValue!)} pin + ${formatAmount(own.added)} added` : ' '}
        </p>
      </div>

      <div className={styles.frame}>
        <div ref={listRef} className={styles.list} role="radiogroup" aria-label="Pin position">
          {pins.map((v, i) => {
            const lifted = pinIndex >= 0 && i <= pinIndex;
            return (
              <button
                key={v}
                type="button"
                role="radio"
                aria-checked={i === pinIndex}
                aria-label={`Pin at ${formatWeight(v, unit)}`}
                className={styles.row}
                data-lifted={lifted}
                data-pin={i === pinIndex}
                onClick={() => setPin(v)}
              >
                <span className={styles.plate}>
                  <span className={`${styles.value} num`}>{formatAmount(v)}</span>
                  <span className={styles.hole} aria-hidden="true">
                    <span className={styles.pin} />
                  </span>
                </span>
              </button>
            );
          })}
        </div>
      </div>

      <div className={base.links}>
        <button type="button" className={`${base.toggle} pressable`} aria-pressed={addedOn} onClick={toggleAdded}>
          + added
        </button>
        <button type="button" className={`${base.link} pressable`} onClick={() => setAsking(true)}>
          {answered ? `Goes up by ${formatAmount(step)}` : `Step ${formatAmount(step)} · Change`}
        </button>
      </div>

      {addedOn && <AddedWeightField unit={unit} value={added} onChange={changeAdded} label="Added weight on the pin" />}

      <EquipmentWeightSheet
        open={asking}
        onClose={() => setAsking(false)}
        gymId={gym.id}
        unit={unit}
        machineId={machineId}
        kind="stack"
      />
    </div>
  );
}
