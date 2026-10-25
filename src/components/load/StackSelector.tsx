import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { equipmentWeightFor, stackStepFor } from '../../db/gyms';
import type { Gym, Load } from '../../db/types';
import { DISPLAY_STACK_MAX, formatAmount, formatWeight, isStackPin, morePins, stackLoad, stackValues } from '../../lib/load';
import { useTapGuard } from '../../hooks/useTapGuard';
import { AddedWeightField } from './AddedWeightField';
import { AddedWeightSheet } from './AddedWeightSheet';
import { EquipmentWeightSheet } from './EquipmentWeightSheet';
import { Hint } from '../hint/Hint';
import { InfoButton } from '../info/InfoButton';
import base from './LoadInput.module.css';
import styles from './StackSelector.module.css';

type Props = {
  gym: Gym;
  /** Machine id for the per machine step, e.g. 'lat_pulldown'. */
  machineId: string;
  value: Load | null;
  /** null: the picked pin is gone (the stack step changed); Log set waits for a new pin. */
  onChange: (load: Load | null) => void;
  /** Workout (SPEC 13.5, PLAN 1.10e): the added weight pad opens in its own sheet, like bodyweight. */
  padInSheet?: boolean;
};

const ROW = 48;

/** SPEC 13.6 labels. */
export const STACK_COPY = { title: 'Machine · pick the pin', helper: 'Use the number next to the pin on the weight stack' } as const;

/**
 * Stack selector (SPEC 5.2): a vertical pin style list of stack plates; tap a plate to set the
 * pin. Values come from the machine's stack step. The list runs to DISPLAY_STACK_MAX (300 lb /
 * 140 kg) because real stack sizes are not known: a display range only, never data.
 */
export function StackSelector({ gym, machineId, value, onChange, padInSheet = false }: Props) {
  const unit = gym.unit;
  const step = stackStepFor(gym, machineId);
  const answered = equipmentWeightFor(gym, machineId)?.kind === 'stack_step';
  const own = value?.kind === 'stack' ? value : null;
  const pin = own?.stackValue ?? null;
  // 300 lb / 140 kg is only where the list starts; "More" adds 10 pins, and a heavier saved pin shows.
  const [max, setMax] = useState(() => Math.max(DISPLAY_STACK_MAX[unit], pin ?? 0));
  const pins = useMemo(() => stackValues(step, max), [step, max]);
  const pinIndex = pin === null ? -1 : pins.indexOf(pin);
  // The step when the picker opened. A saved set's own pin (Edit, PLAN 1.7i) stays as it was saved
  // even if the machine's step changed since (15 lb on a 10 lb step): only a step changed while
  // the picker is open drops a pin that is not on it.
  const openedStep = useRef(step);
  const stale = pin !== null && !isStackPin(pin, step) && step !== openedStep.current;
  const [addedOn, setAddedOn] = useState((own?.added ?? 0) > 0);
  const [added, setAdded] = useState(own?.added ?? 0);
  const [asking, setAsking] = useState(false);
  const [sheet, setSheet] = useState(false);
  const listRef = useRef<HTMLDivElement>(null);

  // A new step can drop the picked pin (15 lb on a 10 lb step): clear it, never round it.
  useEffect(() => {
    if (stale) onChange(null);
  }, [stale]); // eslint-disable-line react-hooks/exhaustive-deps

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
    if (next && padInSheet) setSheet(true);
  });

  const closeSheet = () => {
    setSheet(false);
    // Nothing typed: the toggle goes back off, so it never claims weight that is not there.
    if (added <= 0) setAddedOn(false);
  };

  const changeAdded = (n: number) => {
    setAdded(n);
    if (pin !== null) emit(pin, n);
  };

  return (
    <div className={base.root}>
      <div className={base.readout}>
        <p className={`${base.total} num`} aria-live="polite" data-testid="stack-total">
          {own && !stale ? formatAmount(own.total) : <span className={base.placeholder}>–</span>}
          <span className={base.unit}>{unit}</span>
        </p>
        <p className={base.label} data-testid="picker-title">
          {STACK_COPY.title}
        </p>
        <p className={base.helper} data-testid="stack-sub">
          {own?.added ? `${formatAmount(own.stackValue!)} pin + ${formatAmount(own.added)} added` : STACK_COPY.helper}
        </p>
      </div>

      <div className={styles.frameOuter}>
        <Hint id="stack" className={styles.hint} point="down" />
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
            <button type="button" className={`${styles.more} pressable`} onClick={() => setMax((m) => morePins(m, step))} aria-label="More pins">
              More
            </button>
          </div>
        </div>
      </div>

      <div className={base.links}>
        <button type="button" className={`${base.toggle} pressable`} aria-pressed={addedOn} onClick={toggleAdded}>
          Add weight
        </button>
        {padInSheet && addedOn && (
          <button type="button" className={`${base.link} pressable`} onClick={() => setSheet(true)}>
            Change
          </button>
        )}
        <span className={base.linkWithInfo}>
          <button type="button" className={`${base.link} pressable`} onClick={() => setAsking(true)}>
            {answered ? `Goes up by ${formatAmount(step)}` : `Steps of ${formatAmount(step)} · Change`}
          </button>
          <InfoButton id="weight-stack-machine" />
        </span>
      </div>

      {addedOn && !padInSheet && <AddedWeightField unit={unit} value={added} onChange={changeAdded} label="Added weight on the pin" />}
      {padInSheet && <AddedWeightSheet open={sheet} onClose={closeSheet} unit={unit} value={added} onChange={changeAdded} label="Added weight on the pin" />}

      <EquipmentWeightSheet open={asking} onClose={() => setAsking(false)} gymId={gym.id} unit={unit} machineId={machineId} kind="stack" />
    </div>
  );
}
