import { useState } from 'react';
import { FOCUS, FOCUS_PARTS, type FocusId, type FocusPickId } from '../../lib/intake/options';
import { Sheet, SheetFooter } from '../../ui/Sheet';
import { ChoiceCard } from '../../ui/ChoiceCard';
import { Button } from '../../ui/Button';
import { NOT_YET } from './copy';
import styles from './Focus.module.css';

type Group = Exclude<FocusId, 'balance' | 'glutes'>;
type Props = { group: Group; picks: FocusPickId[]; notYet: ReadonlySet<FocusPickId>; onClose: () => void; onSave: (picks: FocusPickId[]) => void };

/**
 * PLAN 3.6f: an area's parts. The whole area or any of its parts (the whole clears the parts and a
 * part clears the whole); a part with no sure exercise yet says so on its row. Done keeps the
 * choice, closing any other way keeps what was there.
 */
export function FocusPartsSheet({ group, picks, notYet, onClose, onSave }: Props) {
  const parts = FOCUS_PARTS[group];
  const ids: readonly FocusPickId[] = [group, ...parts.map((p) => p.id)];
  const [selected, setSelected] = useState(picks.filter((p) => ids.includes(p)));
  const label = FOCUS.find((p) => p.id === group)!.label;
  const tap = (id: FocusPickId) => setSelected((old) => (old.includes(id) ? old.filter((p) => p !== id) : id === group ? [group] : [...old.filter((p) => p !== group), id]));
  return (
    <Sheet open onClose={onClose} label={`${label} focus`} scroll footer clearTop>
      <div className={styles.sheet}>
        <h2 className={styles.sheetTitle}>{label}</h2>
        <p className={styles.sheetNote}>All of it, or only the parts you care about.</p>
        {/* Each row carries its own check mark (the ring fills), so what is picked is never only an outline. */}
        <ChoiceCard label={`All ${label.toLowerCase()}`} picked={selected.includes(group)} onPress={() => tap(group)} testId={`focus-part-${group}`} />
        {parts.filter((p) => p.id !== group).map((p) => (
          <ChoiceCard key={p.id} label={p.label} hint={notYet.has(p.id) ? NOT_YET : undefined} picked={selected.includes(p.id)} onPress={() => tap(p.id)} testId={`focus-part-${p.id}`} />
        ))}
      </div>
      <SheetFooter>
        <Button onClick={() => onSave([...picks.filter((p) => p !== 'balance' && !ids.includes(p)), ...selected])}>Done</Button>
      </SheetFooter>
    </Sheet>
  );
}
