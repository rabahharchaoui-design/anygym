import { useState } from 'react';
import { FOCUS, FOCUS_OBJECTIVES, FOCUS_PARTS, type FocusId, type FocusPickId } from '../../lib/intake/options';
import { normalizeFocusPicks, focusLabel } from '../../lib/plan/focus';
import { Chip } from '../../ui/Chip';
import { iconFor } from './icons';
import { FocusPartsSheet } from './FocusPartsSheet';
import { FocusRank } from './FocusRank';
import styles from './Focus.module.css';

export function FocusStep({ value, onChange }: { value: readonly string[]; onChange: (picks: FocusPickId[]) => void }) {
  const picks = normalizeFocusPicks(value);
  const [group, setGroup] = useState<Exclude<FocusId, 'balance' | 'glutes'> | null>(null);
  const toggle = (id: FocusPickId) => onChange(picks.includes(id) ? picks.filter((p) => p !== id) : id === 'balance' ? ['balance'] : [...picks.filter((p) => p !== 'balance'), id]);
  return <div className={styles.stack}>
    <div className={styles.tiles} role="group" aria-label="Focus areas" data-testid="q-focus">
      {[...FOCUS, ...FOCUS_OBJECTIVES].map((o) => {
        const parts = o.id in FOCUS_PARTS ? FOCUS_PARTS[o.id as keyof typeof FOCUS_PARTS] : [];
        const selected = picks.filter((p) => p === o.id || parts.some((part) => part.id === p));
        return <div key={o.id} className={styles.tile}>
          <Chip tile block icon={iconFor(o.icon)} label={o.label} picked={selected.length > 0} onPress={() => parts.length ? setGroup(o.id as Exclude<FocusId, 'balance' | 'glutes'>) : toggle(o.id)} testId={`q-focus-${o.id}`} />
          {selected.length > 0 && o.id !== 'balance' && <p className={styles.selection}>{selected.map(focusLabel).join(', ')}</p>}
        </div>;
      })}
    </div>
    <p className={styles.note}>Any number. Share one focus budget within your time. Leave blank for balance.</p>
    {picks.length >= 4 && <FocusRank picks={picks} onChange={onChange} />}
    {group && <FocusPartsSheet key={group} group={group} picks={picks} onClose={() => setGroup(null)} onSave={(v) => { onChange(normalizeFocusPicks(v)); setGroup(null); }} />}
  </div>;
}
