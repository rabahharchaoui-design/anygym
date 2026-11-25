import { useEffect, useRef, useState } from 'react';
import { UnitChangedError, setEquipmentWeight, setMachineHorns } from '../../db/equipment';
import type { EquipmentWeight, Gym, Unit } from '../../db/types';
import { entryFor, promptFor, type PromptKind } from '../../lib/equipmentPrompt';
import { formatWeight } from '../../lib/load';
import { parseTyped, pressKey } from '../../lib/numpad';
import { Button } from '../../ui/Button';
import { Sheet } from '../../ui/Sheet';
import { InfoButton } from '../info/InfoButton';
import { SIDES, useSaveOnce } from './BarQuestion';
import { NumPad } from './NumPad';
import { TypedReadout } from './TypedReadout';
import styles from './EquipmentWeightSheet.module.css';

type Props = {
  open: boolean;
  onClose: () => void;
  gymId: string;
  unit: Unit;
  machineId: string;
  kind: PromptKind;
  onSaved?: (gym: Gym) => void;
  /**
   * A plate machine (PLAN 3.6h2): one side or both, changed here, where the start is changed.
   * `horns`: the answer now (null: not answered). Saved at once; only sets logged from then on follow it.
   */
  sides?: { horns: 1 | 2 | null; onSaved: (gym: Gym, horns: 1 | 2) => void };
};

/** First use prompt (SPEC 5.3): one number field and one alternative, saved to this gym and machine. */
export function EquipmentWeightSheet({ open, onClose, gymId, unit, machineId, kind, onSaved, sides }: Props) {
  const prompt = promptFor(kind, unit);
  const [text, setText] = useState('');
  const [other, setOther] = useState(false);
  const [error, setError] = useState<false | 'save' | 'unit'>(false);
  const saving = useRef(false);

  useEffect(() => {
    if (!open) return;
    setText('');
    setOther(false);
    setError(false);
    saving.current = false;
  }, [open]);
  // The gym's unit changed while this was open (another tab, PLAN 2.0c): a number typed in the old
  // unit is cleared, never saved as the new one.
  const typedIn = useRef(unit);
  useEffect(() => {
    if (typedIn.current === unit) return;
    typedIn.current = unit;
    setText('');
  }, [unit]);

  const typed = parseTyped(text);
  const showPad = !prompt.chips || other;

  const save = async (entry: EquipmentWeight) => {
    if (saving.current) return; // a double tap saves once
    saving.current = true;
    setError(false);
    try {
      const gym = await setEquipmentWeight(gymId, machineId, entry, undefined, unit);
      onSaved?.(gym);
      onClose();
    } catch (err) {
      saving.current = false;
      if (err instanceof UnitChangedError) setText('');
      setError(err instanceof UnitChangedError ? 'unit' : 'save');
    }
  };

  return (
    <Sheet open={open} onClose={onClose} label={prompt.title}>
      <div className={styles.body}>
        <div className={styles.titleRow}>
          <h2 className={styles.title}>{prompt.title}</h2>
          <InfoButton id={prompt.info} className={styles.info} />
        </div>
        {sides && <SidesRow gymId={gymId} machineId={machineId} sides={sides} />}
        <p className={styles.question}>{prompt.question}</p>

        {prompt.chips && (
          <div className={styles.chips} role="group" aria-label="Step">
            {prompt.chips.map((c) => (
              <button
                key={c}
                type="button"
                className={`${styles.chip} num pressable`}
                onClick={() => void save(entryFor(kind, c))}
                aria-label={`Goes up by ${formatWeight(c, unit)}`}
              >
                {c}
              </button>
            ))}
            <button
              type="button"
              className={`${styles.chip} pressable`}
              aria-pressed={other}
              onClick={() => setOther(true)}
            >
              Other
            </button>
          </div>
        )}

        {showPad && (
          <>
            <TypedReadout text={text} unit={unit} testId="equipment-typed" />
            <NumPad onKey={(k) => setText((t) => pressKey(t, k))} />
            <Button size="md" disabled={typed === null} onClick={() => typed !== null && void save(entryFor(kind, typed))}>
              {prompt.save}
            </Button>
          </>
        )}

        {prompt.alternative && (
          <Button variant="secondary" size="md" onClick={() => void save(prompt.alternative!.entry)}>
            {prompt.alternative.label}
          </Button>
        )}

        <p className={styles.error} role="status">
          {error === 'unit' ? 'The gym units changed. Answer again.' : error ? 'Could not save that. Try again.' : ''}
        </p>
      </div>
    </Sheet>
  );
}

/** "Loads on: One side | Both sides" (PLAN 3.6h2): the current answer pressed, a tap saves the other. */
function SidesRow({ gymId, machineId, sides }: { gymId: string; machineId: string; sides: NonNullable<Props['sides']> }) {
  const { run, message } = useSaveOnce(() => undefined);
  const pick = (horns: 1 | 2) =>
    run(async () => {
      const gym = await setMachineHorns(gymId, machineId, horns);
      sides.onSaved(gym, horns);
      return gym;
    });
  return (
    <div className={styles.sides}>
      <p className={styles.question} id="sides-row">
        Loads on
      </p>
      <div className={styles.chips} data-two="" role="group" aria-labelledby="sides-row" data-testid="sides-row">
        {SIDES.map((s) => (
          <button key={s.horns} type="button" className={`${styles.chip} ${styles.side} pressable`} aria-pressed={sides.horns === s.horns} onClick={() => void pick(s.horns)}>
            {s.label}
          </button>
        ))}
      </div>
      {message && <p className={styles.error} role="status">{message}</p>}
    </div>
  );
}
