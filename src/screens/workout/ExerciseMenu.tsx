import { useState } from 'react';
import { Sheet } from '../../ui/Sheet';
import { MAX_REST_SEC } from '../../db/exerciseSettings';
import { RepsStepper } from './RepsStepper';
import styles from './Workout.module.css';

export type MenuAction = 'up' | 'down' | 'remove' | 'loadType';

type Props = {
  open: boolean;
  onClose: () => void;
  name: string;
  canUp: boolean;
  canDown: boolean;
  /** Why it cannot move, when it cannot (a pair moves together). */
  moveNote?: string;
  /** Why it cannot be removed (it has logged sets), or undefined. */
  removeNote?: string;
  rest: number;
  note: string;
  /** How it is loaded now, in plain words ("Plates on a bar"), or undefined when not known. */
  loadedWith?: string;
  onAction: (a: MenuAction) => void;
  onRest: (seconds: number) => void;
  onNote: (note: string) => void;
};

/**
 * The exercise ⋯ menu (SPEC 21.1). Replace and Make a pair are left out until they ship: no dead
 * rows (ux-critic, PLAN 1.7e).
 */
export function ExerciseMenu({ open, onClose, name, canUp, canDown, moveNote, removeNote, rest, note, loadedWith, onAction, onRest, onNote }: Props) {
  const [page, setPage] = useState<'menu' | 'rest' | 'note'>('menu');
  const close = () => {
    onClose();
    setPage('menu');
  };
  return (
    <Sheet open={open} onClose={close} label={page === 'rest' ? 'Rest time' : page === 'note' ? 'Add note' : `${name} options`} scroll>
      {open && page === 'menu' && (
        <div className={styles.sheetBody}>
          <h2 className={styles.sheetTitle}>{name}</h2>
          <div className={styles.menu}>
            <MenuItem label={loadedWith ? `Loaded with: ${loadedWith}` : 'How do you load this?'} sub="Change" onPress={() => onAction('loadType')} />
            <div className={styles.menuPair}>
              <MenuItem label="Move up" sub={!canUp ? moveNote : undefined} disabled={!canUp} onPress={() => onAction('up')} />
              <MenuItem label="Move down" sub={!canDown ? moveNote : undefined} disabled={!canDown} onPress={() => onAction('down')} />
            </div>
            <MenuItem label={note ? 'Edit note' : 'Add note'} sub={note || undefined} onPress={() => setPage('note')} />
            <MenuItem label="Rest time" sub={`${rest} s after each set`} onPress={() => setPage('rest')} />
            <MenuItem label="Remove" sub={removeNote} disabled={!!removeNote} danger onPress={() => onAction('remove')} />
          </div>
        </div>
      )}
      {open && page === 'rest' && <RestPage rest={rest} onSave={(s) => (onRest(s), close())} />}
      {open && page === 'note' && <NotePage note={note} onSave={(n) => (onNote(n), close())} />}
    </Sheet>
  );
}

function MenuItem({ label, sub, disabled, danger, onPress }: { label: string; sub?: string; disabled?: boolean; danger?: boolean; onPress?: () => void }) {
  return (
    <button type="button" className={`${styles.menuItem} pressable`} data-danger={danger || undefined} disabled={disabled} onClick={onPress}>
      <span className={styles.menuLabel}>{label}</span>
      {sub && <span className={styles.menuSub}>{sub}</span>}
    </button>
  );
}

function RestPage({ rest, onSave }: { rest: number; onSave: (s: number) => void }) {
  const [value, setValue] = useState(rest);
  return (
    <div className={styles.sheetBody}>
      <h2 className={styles.sheetTitle}>Rest time</h2>
      <p className={styles.sheetSub}>After each set of this exercise</p>
      <RepsStepper label="Rest" unit="seconds" value={value} onChange={setValue} min={0} max={MAX_REST_SEC} step={15} />
      <button type="button" className={`${styles.logButton} pressable`} onClick={() => onSave(value)}>
        Save
      </button>
    </div>
  );
}

function NotePage({ note, onSave }: { note: string; onSave: (n: string) => void }) {
  const [value, setValue] = useState(note);
  return (
    <div className={styles.sheetBody}>
      <h2 className={styles.sheetTitle}>Note</h2>
      <textarea
        className={styles.noteInput}
        aria-label="Note"
        value={value}
        maxLength={200}
        rows={3}
        placeholder="Seat on 4, wide grip…"
        onChange={(e) => setValue(e.target.value)}
      />
      <button type="button" className={`${styles.logButton} pressable`} onClick={() => onSave(value)}>
        Save note
      </button>
    </div>
  );
}
