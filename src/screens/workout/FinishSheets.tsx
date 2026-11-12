import { Sheet } from '../../ui/Sheet';
import { isLeftOver } from './sessionRecovery';
import type { Unsaved } from './useFinish';
import styles from './Sheets.module.css';

type UnsavedProps = { unsaved: Unsaved | null; onClose: () => void; onRetry: () => void; onFinishWithout: () => void };

/** Finish was refused: some sets or edits did not save. Try again, or finish without them. */
export function UnsavedSheet({ unsaved, onClose, onRetry, onFinishWithout }: UnsavedProps) {
  return (
    <Sheet open={unsaved !== null} onClose={onClose} label={unsaved && unsaved.rows === 0 ? 'Change not saved' : 'Set not saved'}>
      <div className={styles.sheetBody} data-testid="unsaved-sheet">
        <h2 className={styles.sheetTitle}>{unsavedTitle(unsaved)}</h2>
        <p className={styles.sheetSub}>{unsavedSub(unsaved)}</p>
        <button type="button" className={`${styles.logButton} pressable`} onClick={onRetry}>
          Try again
        </button>
        <button type="button" className={`${styles.secondaryButton} pressable`} onClick={onFinishWithout}>
          {(unsaved?.rows ?? 1) + (unsaved?.edits ?? 0) === 1 ? 'Finish without it' : 'Finish without them'}
        </button>
      </div>
    </Sheet>
  );
}

type StuckProps = { sessionId: string; undoStuck: string[] | null; onClose: () => void; onRetry: () => void; onKeep: () => void };

/** Finish was refused: an Undo did not land. Bring the sets back, or keep them deleted. */
export function UndoStuckSheet({ sessionId, undoStuck, onClose, onRetry, onKeep }: StuckProps) {
  // Deleted sets an earlier app run left without an Undo asked for (PLAN 2.0e): asked plainly.
  const leftOver = !!undoStuck?.length && undoStuck.every((id) => isLeftOver(sessionId, id));
  return (
    <Sheet open={undoStuck !== null} onClose={onClose} label={leftOver ? 'Keep it deleted?' : 'Undo did not finish'}>
      <div className={styles.sheetBody} data-testid="undo-stuck-sheet">
        <h2 className={styles.sheetTitle}>{undoStuckTitle(undoStuck, leftOver)}</h2>
        <p className={styles.sheetSub}>{leftOver ? 'The app closed right after it was deleted.' : 'You tapped Undo, but it did not save.'}</p>
        <button type="button" className={`${styles.logButton} pressable`} onClick={onRetry}>
          {leftOver ? ((undoStuck?.length ?? 1) === 1 ? 'Bring it back' : 'Bring them back') : 'Try again'}
        </button>
        <button type="button" className={`${styles.secondaryButton} pressable`} onClick={onKeep}>
          {(undoStuck?.length ?? 1) === 1 ? 'Keep it deleted' : 'Keep them deleted'}
        </button>
      </div>
    </Sheet>
  );
}

function undoStuckTitle(ids: string[] | null, leftOver: boolean): string {
  const n = ids?.length ?? 1;
  if (leftOver) return n === 1 ? 'Keep the set you deleted?' : `Keep the ${n} sets you deleted?`;
  return n === 1 ? 'A deleted set did not come back' : `${n} deleted sets did not come back`;
}

/** "1 set did not save", "2 changes did not save", "1 set and 1 change did not save" (PLAN 2.0c). */
function unsavedTitle(u: { rows: number; edits: number } | null): string {
  const rows = u?.rows ?? 1;
  const edits = u?.edits ?? 0;
  const part = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;
  if (edits === 0) return `${part(rows, 'set', 'sets')} did not save`;
  if (rows === 0) return `${part(edits, 'change', 'changes')} did not save`;
  return `${part(rows, 'set', 'sets')} and ${part(edits, 'change', 'changes')} did not save`;
}

function unsavedSub(u: { rows: number; edits: number } | null): string {
  const rows = u?.rows ?? 1;
  const edits = u?.edits ?? 0;
  if (edits === 0) return rows === 1 ? 'It is still on its row.' : 'They are still on their rows.';
  if (rows === 0) return edits === 1 ? 'Your edit is not saved yet.' : 'Your edits are not saved yet.';
  return 'Nothing is lost yet.';
}
