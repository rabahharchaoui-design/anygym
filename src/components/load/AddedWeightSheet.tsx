import type { Unit } from '../../db/types';
import { Sheet } from '../Sheet';
import { AddedWeightField } from './AddedWeightField';
import styles from './EquipmentWeightSheet.module.css';

type Props = {
  open: boolean;
  onClose: () => void;
  unit: Unit;
  value: number;
  onChange: (added: number) => void;
  /** Accessible name of the number field, e.g. "Added weight". */
  label: string;
};

/**
 * "Add weight" in a sheet (SPEC 13.5): the number pad never pushes the active set off one screen.
 * Each key updates the weight live; Done closes.
 */
export function AddedWeightSheet({ open, onClose, unit, value, onChange, label }: Props) {
  return (
    <Sheet open={open} onClose={onClose} label="Add weight">
      <div className={styles.body}>
        <h2 className={styles.title}>Add weight</h2>
        <p className={styles.question}>Vest, belt or a plate you hold.</p>
        {open && <AddedWeightField unit={unit} value={value} onChange={onChange} label={label} />}
        <button type="button" className={`${styles.primary} pressable`} onClick={onClose}>
          Done
        </button>
      </div>
    </Sheet>
  );
}
