import { useRef, useState } from 'react';
import { UnitChangedError, setEquipmentWeight } from '../../db/equipment';
import type { EquipmentWeight, Gym, Unit } from '../../db/types';
import { entryFor, type PromptKind } from '../../lib/equipmentPrompt';
import { formatWeight } from '../../lib/load';
import { InfoButton } from '../info/InfoButton';
import styles from './BarQuestion.module.css';

/** Common bar weights to pick from. The user's answer, never a guess: nothing is preset. */
export const BAR_CHIPS: Record<Unit, number[]> = { lb: [15, 20, 25, 35, 45], kg: [7, 10, 15, 20] };

type Props = {
  gymId: string;
  unit: Unit;
  machineId: string;
  kind: PromptKind;
  /** Glossary id for the ⓘ. */
  info: string;
  /** Saved: the gym with the answer (the bar is known from here on). */
  onSaved: (gym: Gym) => void;
  /** "Other…": a number pad for any other weight. */
  onOther: () => void;
  /** A slimmer card in a busy sheet (the import editor). */
  dense?: boolean;
};

/** Saves one first use answer for this gym, once per tap, and says why when it cannot. */
function useSaveAnswer(gymId: string, machineId: string, unit: Unit, onSaved: (gym: Gym) => void) {
  const [error, setError] = useState<false | 'save' | 'unit'>(false);
  const saving = useRef(false);
  const save = async (entry: EquipmentWeight) => {
    if (saving.current) return; // a double tap saves once
    saving.current = true;
    setError(false);
    try {
      // Typed in this unit: refused when the gym switched units meanwhile (PLAN 2.0c).
      onSaved(await setEquipmentWeight(gymId, machineId, entry, undefined, unit));
    } catch (err) {
      setError(err instanceof UnitChangedError ? 'unit' : 'save');
    } finally {
      saving.current = false;
    }
  };
  const message = error === 'unit' ? 'The gym units changed. Answer again.' : error ? 'Could not save that. Try again.' : '';
  return { save, message };
}

/**
 * First use of a Smith, EZ or trap bar, on top of the weight sheet (ux-critic, SPEC 5.3): "What
 * does this bar weigh?" with common weights, "Count plates only" and "Other…". Saved for this gym;
 * nothing is logged until it is answered.
 */
export function BarQuestion({ gymId, unit, machineId, kind, info, onSaved, onOther, dense = false }: Props) {
  const { save, message } = useSaveAnswer(gymId, machineId, unit, onSaved);
  return (
    <section className={styles.box} aria-labelledby="bar-question" data-testid="bar-question" data-dense={dense || undefined}>
      <div className={styles.titleRow}>
        <h3 id="bar-question" className={styles.title}>
          What does this bar weigh?
        </h3>
        <InfoButton id={info} className={styles.info} />
      </div>
      <div className={styles.chips} role="group" aria-label="Bar weight" data-count={BAR_CHIPS[unit].length}>
        {BAR_CHIPS[unit].map((w) => (
          <button key={w} type="button" className={`${styles.chip} num pressable`} aria-label={`Bar weighs ${formatWeight(w, unit)}`} onClick={() => void save(entryFor(kind, w))}>
            {w}
            <span className={styles.unit}>{unit}</span>
          </button>
        ))}
      </div>
      <div className={styles.row}>
        <button type="button" className={`${styles.option} pressable`} onClick={() => void save({ kind: 'plates_only', value: 0 })}>
          Count plates only
        </button>
        <button type="button" className={`${styles.option} pressable`} onClick={onOther}>
          Other…
        </button>
      </div>
      <p className={styles.error} role="status">
        {message}
      </p>
    </section>
  );
}

type StartProps = {
  gymId: string;
  unit: Unit;
  machineId: string;
  onSaved: (gym: Gym) => void;
  /** "Set starting weight": a number pad for the listed starting weight. */
  onOther: () => void;
  /** A slimmer card in a busy sheet (the import editor). */
  dense?: boolean;
};

/**
 * First use of a plate loaded machine, on top of the weight sheet, like the Smith question (2.0d
 * critic): does the machine add its own starting weight, or are only the plates counted? Saved
 * for this gym. Plates can be loaded meanwhile; the total waits for the answer ("+ start").
 */
export function StartQuestion({ gymId, unit, machineId, onSaved, onOther, dense = false }: StartProps) {
  const { save, message } = useSaveAnswer(gymId, machineId, unit, onSaved);
  return (
    <section className={styles.box} aria-labelledby="start-question" data-testid="start-question" data-dense={dense || undefined}>
      <div className={styles.titleRow}>
        <h3 id="start-question" className={styles.title}>
          Starting weight?
        </h3>
        <InfoButton id="plate-loaded-machine" className={styles.info} />
      </div>
      <div className={styles.row} data-start="">
        <button type="button" className={`${styles.option} pressable`} onClick={() => void save({ kind: 'plates_only', value: 0 })}>
          Plates only
        </button>
        <button type="button" className={`${styles.option} pressable`} onClick={onOther}>
          Set starting weight
        </button>
      </div>
      <p className={styles.error} role="status">
        {message}
      </p>
    </section>
  );
}
