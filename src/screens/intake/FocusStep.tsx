import { useEffect, useMemo, useRef, useState } from 'react';
import { FOCUS, FOCUS_OBJECTIVES, FOCUS_PARTS, type FocusId, type FocusPickId } from '../../lib/intake/options';
import { focusBudget, focusLabel, normalizeFocusPicks } from '../../lib/plan/focus';
import { focusNotYet } from '../../data/focusServed';
import { Chip } from '../../ui/Chip';
import { SummaryRow } from '../../ui/SummaryRow';
import { DUR } from '../../ui/motion';
import { iconFor } from './icons';
import { NOT_YET } from './copy';
import { FocusPartsSheet } from './FocusPartsSheet';
import { FocusRank } from './FocusRank';
import { list } from '../../lib/intake/yourPlan';
import styles from './Focus.module.css';

type Group = Exclude<FocusId, 'balance' | 'glutes'>;
// The areas, the three goal types, and last the one that clears them all.
const TILES = [...FOCUS.filter((o) => o.id !== 'balance'), ...FOCUS_OBJECTIVES, ...FOCUS.filter((o) => o.id === 'balance')];

/**
 * The ranking follows the budget's own rule (lib/plan/focus.ts): it only matters once the shares
 * differ, which is from five picks that ask for hard sets. Mobility is stretch time and is not ranked.
 */
const ranked = (picks: readonly FocusPickId[]): FocusPickId[] => {
  const hard = focusBudget(picks).targets.filter((t) => t.id !== 'mobility');
  return new Set(hard.map((t) => t.sets)).size > 1 ? hard.map((t) => t.id) : [];
};

/**
 * PLAN 3.6f: what to work on. One calm grid (areas, goal types, balance); an area opens its parts in
 * a sheet; from five picks "Your priorities" rises as its own sheet, once, and stays one tap away.
 */
export function FocusStep({ value, onChange }: { value: readonly string[]; onChange: (picks: FocusPickId[]) => void }) {
  const picks = normalizeFocusPicks(value);
  const notYet = useMemo(() => focusNotYet(), []);
  const [group, setGroup] = useState<Group | null>(null);
  const [rankOpen, setRankOpen] = useState(false);
  const order = ranked(picks);
  const timer = useRef(0);
  useEffect(() => () => window.clearTimeout(timer.current), []);
  /** The moment the fifth pick lands the priorities come up: after the parts sheet has left, never over it. */
  const change = (next: FocusPickId[], afterSheet = false) => {
    const opens = !order.length && ranked(next).length > 0;
    onChange(next);
    if (!opens) return;
    window.clearTimeout(timer.current);
    if (afterSheet) timer.current = window.setTimeout(() => setRankOpen(true), DUR.slow);
    else setRankOpen(true);
  };
  const toggle = (id: FocusPickId) => change(picks.includes(id) ? picks.filter((p) => p !== id) : id === 'balance' ? ['balance'] : [...picks.filter((p) => p !== 'balance'), id]);
  return (
    <div className={styles.step}>
      <div className={styles.tiles} role="group" aria-label="Focus areas" data-testid="q-focus">
        {TILES.map((o) => {
          const parts = o.id in FOCUS_PARTS ? FOCUS_PARTS[o.id as keyof typeof FOCUS_PARTS] : [];
          const selected = picks.filter((p) => p === o.id || parts.some((part) => part.id === p));
          // One quiet line: the parts picked ("Lats and width +1"), or that nothing sure trains it yet.
          const hint = notYet.has(o.id) ? NOT_YET : !parts.length || !selected.length ? undefined : selected.includes(o.id) ? 'All of it' : `${focusLabel(selected[0]!)}${selected.length > 1 ? ` +${selected.length - 1}` : ''}`;
          return <Chip key={o.id} block icon={iconFor(o.icon)} label={o.label} hint={hint} picked={selected.length > 0} onPress={() => (parts.length ? setGroup(o.id as Group) : toggle(o.id))} testId={`q-focus-${o.id}`} />;
        })}
      </div>
      {order.length ? (
        <div className={styles.priorities}>
          <SummaryRow label="Your priorities" value={<>Most extra work: {list(order.slice(0, 2).map(focusLabel))}</>} action="Reorder" onPress={() => setRankOpen(true)} testId="focus-rank-open" valueTestId="focus-rank-top" />
        </div>
      ) : (
        <p className={styles.note}>Leave it blank for a balanced plan.</p>
      )}
      {group && <FocusPartsSheet key={group} group={group} picks={picks} notYet={notYet} onClose={() => setGroup(null)} onSave={(v) => { setGroup(null); change(normalizeFocusPicks(v), true); }} />}
      <FocusRank open={rankOpen && order.length > 0} picks={order} onClose={() => setRankOpen(false)} onChange={(next) => onChange([...next, ...picks.filter((p) => !next.includes(p))])} />
    </div>
  );
}
