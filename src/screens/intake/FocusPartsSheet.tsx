import { useState } from 'react';
import { FOCUS, FOCUS_PARTS, type FocusId, type FocusPickId } from '../../lib/intake/options';
import { Sheet, SheetFooter } from '../../ui/Sheet';
import { Chip } from '../../ui/Chip';
import { Button } from '../../ui/Button';
import styles from './Focus.module.css';

type Group = Exclude<FocusId, 'balance' | 'glutes'>;
export function FocusPartsSheet({ group, picks, onClose, onSave }: { group: Group; picks: FocusPickId[]; onClose: () => void; onSave: (picks: FocusPickId[]) => void }) {
  const parts = FOCUS_PARTS[group];
  const ids: readonly FocusPickId[] = [group, ...parts.map((p) => p.id)];
  const [selected, setSelected] = useState(picks.filter((p) => ids.includes(p)));
  const label = FOCUS.find((p) => p.id === group)!.label;
  const tap = (id: FocusPickId) => setSelected((old) => old.includes(id) ? old.filter((p) => p !== id) : id === group ? [group] : [...old.filter((p) => p !== group), id]);
  return <Sheet open onClose={onClose} label={`${label} focus`} scroll footer clearTop>
    <div className={styles.stack}>
      <h2>{label}</h2><p className={styles.note}>Pick the whole area or its parts.</p>
      <Chip block label={group === 'chest' ? 'Overall chest' : `All ${label.toLowerCase()}`} picked={selected.includes(group)} onPress={() => tap(group)} testId={`focus-part-${group}`} />
      {parts.filter((p) => p.id !== group).map((p) => <Chip key={p.id} block label={p.label} picked={selected.includes(p.id)} onPress={() => tap(p.id)} testId={`focus-part-${p.id}`} />)}
    </div>
    <SheetFooter><Button onClick={() => onSave([...picks.filter((p) => p !== 'balance' && !ids.includes(p)), ...selected])}>Done</Button></SheetFooter>
  </Sheet>;
}
