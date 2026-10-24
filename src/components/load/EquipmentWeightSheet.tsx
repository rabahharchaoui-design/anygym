import { useEffect, useRef, useState } from 'react';
import { setEquipmentWeight } from '../../db/equipment';
import type { EquipmentWeight, Gym, Unit } from '../../db/types';
import { entryFor, promptFor, type PromptKind } from '../../lib/equipmentPrompt';
import { formatWeight } from '../../lib/load';
import { parseTyped, pressKey } from '../../lib/numpad';
import { Sheet } from '../Sheet';
import { NumPad } from './NumPad';
import styles from './EquipmentWeightSheet.module.css';

type Props = {
  open: boolean;
  onClose: () => void;
  gymId: string;
  unit: Unit;
  machineId: string;
  kind: PromptKind;
  onSaved?: (gym: Gym) => void;
};

/** First use prompt (SPEC 5.3): one number field and one alternative, saved to this gym and machine. */
export function EquipmentWeightSheet({ open, onClose, gymId, unit, machineId, kind, onSaved }: Props) {
  const prompt = promptFor(kind, unit);
  const [text, setText] = useState('');
  const [other, setOther] = useState(false);
  const [error, setError] = useState(false);
  const saving = useRef(false);

  useEffect(() => {
    if (!open) return;
    setText('');
    setOther(false);
    setError(false);
    saving.current = false;
  }, [open]);

  const typed = parseTyped(text);
  const showPad = !prompt.chips || other;

  const save = async (entry: EquipmentWeight) => {
    if (saving.current) return; // a double tap saves once
    saving.current = true;
    setError(false);
    try {
      const gym = await setEquipmentWeight(gymId, machineId, entry);
      onSaved?.(gym);
      onClose();
    } catch {
      saving.current = false;
      setError(true);
    }
  };

  return (
    <Sheet open={open} onClose={onClose} label={prompt.title}>
      <div className={styles.body}>
        <h2 className={styles.title}>{prompt.title}</h2>
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
            <div className={styles.display}>
              <span className={`${styles.typed} num`} data-testid="equipment-typed" aria-live="polite">
                {text || <span className={styles.placeholder}>0</span>}
              </span>
              <span className={styles.unit}>{unit}</span>
            </div>
            <NumPad onKey={(k) => setText((t) => pressKey(t, k))} />
            <button
              type="button"
              className={`${styles.primary} pressable`}
              disabled={typed === null}
              onClick={() => typed !== null && void save(entryFor(kind, typed))}
            >
              {prompt.save}
            </button>
          </>
        )}

        {prompt.alternative && (
          <button
            type="button"
            className={`${styles.secondary} pressable`}
            onClick={() => void save(prompt.alternative!.entry)}
          >
            {prompt.alternative.label}
          </button>
        )}

        <p className={styles.error} role="status">
          {error ? 'Could not save that. Try again.' : ''}
        </p>
      </div>
    </Sheet>
  );
}
