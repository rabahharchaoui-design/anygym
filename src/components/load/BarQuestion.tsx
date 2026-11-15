import { useRef, useState } from 'react';
import { UnitChangedError, setEquipmentWeight, setMachineHorns } from '../../db/equipment';
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

/** Runs one save for this gym, once per tap (a double tap saves once), and says why when it cannot. */
export function useSaveOnce(onSaved: (gym: Gym) => void) {
  const [error, setError] = useState<false | 'save' | 'unit'>(false);
  const saving = useRef(false);
  const run = async (write: () => Promise<Gym>) => {
    if (saving.current) return;
    saving.current = true;
    setError(false);
    try {
      onSaved(await write());
    } catch (err) {
      setError(err instanceof UnitChangedError ? 'unit' : 'save');
    } finally {
      saving.current = false;
    }
  };
  const message = error === 'unit' ? 'The gym units changed. Answer again.' : error ? 'Could not save that. Try again.' : '';
  return { run, message };
}

/** Saves one first use answer for this gym (typed in this unit: refused when the gym switched units meanwhile, PLAN 2.0c). */
function useSaveAnswer(gymId: string, machineId: string, unit: Unit, onSaved: (gym: Gym) => void) {
  const { run, message } = useSaveOnce(onSaved);
  const save = (entry: EquipmentWeight) => run(() => setEquipmentWeight(gymId, machineId, entry, undefined, unit));
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

/** The two answers to the sides question, in the words every place uses (PLAN 3.6h2). */
export const SIDES: ReadonlyArray<{ horns: 1 | 2; label: string }> = [
  { horns: 1, label: 'One side' },
  { horns: 2, label: 'Both sides' },
];

type SidesProps = {
  gymId: string;
  machineId: string;
  onSaved: (gym: Gym, horns: 1 | 2) => void;
  dense?: boolean;
};

/**
 * First use of a plate machine whose sides are not known (PLAN 3.6h2), in the same card and place
 * as the start question, asked just before it: many seated calf raise machines take plates on one
 * side only, so the plates must not count twice. One tap, saved for this machine at this gym.
 */
export function SidesQuestion({ gymId, machineId, onSaved, dense = false }: SidesProps) {
  const { run, message } = useSaveOnce(() => undefined);
  const pick = (horns: 1 | 2) => run(async () => {
    const gym = await setMachineHorns(gymId, machineId, horns);
    onSaved(gym, horns);
    return gym;
  });
  return (
    <section className={styles.box} aria-labelledby="sides-question" data-testid="sides-question" data-sides="" data-dense={dense || undefined}>
      <div className={styles.titleRow}>
        <h3 id="sides-question" className={styles.title}>
          Does this machine load on one side or both?
        </h3>
      </div>
      <div className={styles.row}>
        {SIDES.map((s) => (
          <button key={s.horns} type="button" className={`${styles.option} pressable`} onClick={() => void pick(s.horns)}>
            {s.label}
          </button>
        ))}
      </div>
      <p className={styles.error} role="status">
        {message}
      </p>
    </section>
  );
}
