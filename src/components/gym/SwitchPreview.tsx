import { exerciseNameOf } from '../../data/importMatch';
import { changeWords } from '../../lib/gymSwitch';
import { Button } from '../../ui/Button';
import { SheetFooter } from '../../ui/Sheet';
import type { PendingSwitch } from './useGymSwitch';
import styles from './Gym.module.css';

const nameOf = (id: string) => exerciseNameOf(id) ?? id;

/**
 * Before a switch in the middle of a workout (PLAN 3.9, SPEC 19): what will swap, what goes back to
 * the plan and what cannot fit, then one tap to switch or to stay. Inside a sheet with a footer.
 */
export function SwitchPreview({ pending, fromName, busy, onConfirm, onStay }: { pending: PendingSwitch; fromName: string | undefined; busy: boolean; onConfirm: () => void; onStay: () => void }) {
  const changes = pending.preview.workout?.changes ?? [];
  return (
    <div className={styles.body} data-testid="switch-preview">
      <h2 className={styles.title}>Switch to {pending.gym.name}?</h2>
      <p className={styles.sub}>Your workout changes to fit what is there.</p>
      <ul className={styles.list} aria-label="What changes">
        {changes.map((c, i) => {
          const w = changeWords(c, nameOf);
          return (
            <li key={i} className={styles.change} data-kind={c.kind} data-testid={`switch-change-${c.kind}`}>
              <span className={styles.changeTitle}>{w.title}</span>
              <span className={styles.changeLine}>{w.line}</span>
            </li>
          );
        })}
      </ul>
      <p className={styles.kept}>Sets you logged stay with their exercise.</p>
      <SheetFooter>
        <div className={styles.footer}>
          <Button onClick={onConfirm} disabled={busy} data-testid="switch-confirm">
            Switch gym
          </Button>
          <Button variant="tertiary" block onClick={onStay} data-testid="switch-stay">
            {fromName ? `Stay at ${fromName}` : 'Stay here'}
          </Button>
        </div>
      </SheetFooter>
    </div>
  );
}
