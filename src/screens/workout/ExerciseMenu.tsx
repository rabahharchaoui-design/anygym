import { useState } from 'react';
import { Sheet } from '../../ui/Sheet';
import { MAX_REST_SEC } from '../../db/exerciseSettings';
import { RepsStepper } from './RepsStepper';
import { Segmented } from '../../ui/Segmented';
import styles from './Workout.module.css';

export type MenuAction = 'swap' | 'up' | 'down' | 'remove' | 'loadType';

type Props = {
  open: boolean;
  onClose: () => void;
  name: string;
  canUp: boolean;
  canDown: boolean;
  /** Why it cannot move, when it cannot (a pair moves together). */
  moveNote?: string;
  /** What removing it also removes (its logged sets), or undefined. */
  removeNote?: string;
  /** Every set of it is done: nothing is left to replace (PLAN 3.4). */
  replaceOff?: boolean;
  /** Its swap line ("Swapped: no cable here"), when it has one. */
  replaceNote?: string;
  rest: number;
  /** Rest timer Off for this exercise (PLAN 2.2d): no countdown after its sets (supersets). */
  restOff: boolean;
  note: string;
  /** How it is loaded now, in plain words ("Plates on a bar"), or undefined when not known. */
  loadedWith?: string;
  onAction: (a: MenuAction) => void;
  onRest: (seconds: number) => void;
  onRestOff: (off: boolean) => void;
  /** Saved: a short confirmation ("Rest off", "Rest 90 s", round 3 P7). */
  onRestSaved?: (text: string) => void;
  onNote: (note: string) => void;
};

/**
 * The exercise ⋯ menu (SPEC 21.1). Replace comes first (PLAN 3.4). Make a pair is left out until it
 * ships: no dead rows (ux-critic, PLAN 1.7e).
 */
export function ExerciseMenu({ open, onClose, name, canUp, canDown, moveNote, removeNote, replaceOff, replaceNote, rest, restOff, note, loadedWith, onAction, onRest, onRestOff, onRestSaved, onNote }: Props) {
  const [page, setPage] = useState<'menu' | 'rest' | 'note'>('menu');
  const close = () => {
    onClose();
    setPage('menu');
  };
  return (
    <Sheet open={open} onClose={close} label={page === 'rest' ? 'Rest after each set' : page === 'note' ? 'Add note' : `${name} options`} scroll>
      {open && page === 'menu' && (
        <div className={styles.sheetBody}>
          <h2 className={styles.sheetTitle}>{name}</h2>
          <div className={styles.menu}>
            <MenuItem label="Replace" sub={replaceOff ? 'All its sets are done' : replaceNote} disabled={replaceOff} chevron={!replaceOff} onPress={() => onAction('swap')} testId="replace-row" />
            <MenuItem label={loadedWith ? `Loaded with: ${loadedWith}` : 'How do you load this?'} sub="Change" onPress={() => onAction('loadType')} />
            <div className={styles.menuPair}>
              <MenuItem label="Move up" sub={!canUp ? moveNote : undefined} disabled={!canUp} onPress={() => onAction('up')} />
              <MenuItem label="Move down" sub={!canDown ? moveNote : undefined} disabled={!canDown} onPress={() => onAction('down')} />
            </div>
            <MenuItem label={note ? 'Edit note' : 'Add note'} sub={note || undefined} onPress={() => setPage('note')} />
            {/* One row, one height whatever is chosen (critic B4); Off lives in its picker (Hevy item 2). */}
            <MenuItem label="Rest after each set" sub={restOff ? 'Off: no countdown' : `${rest} s`} chevron onPress={() => setPage('rest')} testId="rest-row" />
            {/* PLAN 2.2d P2: always possible; with logged sets it says so, and Undo puts them back. */}
            <MenuItem label="Remove" sub={removeNote} danger onPress={() => onAction('remove')} />
          </div>
        </div>
      )}
      {open && page === 'rest' && (
        <RestPage
          rest={rest}
          off={restOff}
          onSave={(s, off) => {
            if (off !== restOff) onRestOff(off);
            if (!off && s !== rest) onRest(s);
            onRestSaved?.(off ? 'Rest off' : `Rest ${s} s`);
            close();
          }}
        />
      )}
      {open && page === 'note' && <NotePage note={note} onSave={(n) => (onNote(n), close())} />}
    </Sheet>
  );
}

function MenuItem({
  label,
  sub,
  disabled,
  danger,
  chevron,
  onPress,
  testId,
}: {
  label: string;
  sub?: string;
  disabled?: boolean;
  danger?: boolean;
  chevron?: boolean;
  onPress?: () => void;
  testId?: string;
}) {
  return (
    <button type="button" className={`${styles.menuItem} pressable`} data-danger={danger || undefined} data-chevron={chevron || undefined} disabled={disabled} onClick={onPress} data-testid={testId}>
      <span className={styles.menuLabel}>{label}</span>
      {sub && <span className={styles.menuSub}>{sub}</span>}
    </button>
  );
}

/** Rest after each set: On with its time, or Off (supersets, PLAN 2.2d). The page keeps its height either way. */
function RestPage({ rest, off, onSave }: { rest: number; off: boolean; onSave: (s: number, off: boolean) => void }) {
  const [value, setValue] = useState(rest);
  const [isOff, setOff] = useState(off);
  return (
    <div className={styles.sheetBody}>
      <h2 className={styles.sheetTitle}>Rest after each set</h2>
      {/* Says what the choice does now (round 3, P2). */}
      <p className={styles.sheetSub} data-testid="rest-sub">
        {isOff ? 'Off: no countdown, for back to back moves' : 'Countdown after each set'}
      </p>
      <div className={styles.restOnOff}>
        <Segmented
          label="Rest timer"
          testId="rest-onoff"
          options={[
            { value: 'on', label: 'On' },
            { value: 'off', label: 'Off' },
          ]}
          value={isOff ? 'off' : 'on'}
          onChange={(v) => setOff(v === 'off')}
        />
      </div>
      <div className={styles.restStepper} data-off={isOff || undefined} aria-hidden={isOff || undefined} {...(isOff ? { inert: '' } : {})}>
        <RepsStepper label="Rest" unit="seconds" value={value} onChange={setValue} min={15} max={MAX_REST_SEC} step={15} />
      </div>
      <button type="button" className={`${styles.logButton} pressable`} onClick={() => onSave(value, isOff)}>
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
      <textarea className={styles.noteInput} aria-label="Note" value={value} maxLength={200} rows={3} placeholder="Seat on 4, wide grip…" onChange={(e) => setValue(e.target.value)} />
      <button type="button" className={`${styles.logButton} pressable`} onClick={() => onSave(value)}>
        Save note
      </button>
    </div>
  );
}
