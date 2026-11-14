import { useEffect, useMemo, useRef, useState } from 'react';
import { FOCUS, FOCUS_OBJECTIVES, FOCUS_PARTS, type FocusId, type FocusPickId } from '../../lib/intake/options';
import { focusBudget, focusName, normalizeFocusPicks } from '../../lib/plan/focus';
import { focusNotYet } from '../../data/focusServed';
import { Chip } from '../../ui/Chip';
import { SummaryRow } from '../../ui/SummaryRow';
import { Toast, undoToast, type ToastMessage } from '../../ui/Toast';
import { useToastTimeout } from '../../ui/useToastTimeout';
import { plural } from '../../lib/words';
import { iconFor } from './icons';
import { BALANCE_HINT, BALANCE_SAME, NOT_YET } from './copy';
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

/** The Continue bar's height, so the Undo toast sits just above it (the bar owns the bottom safe area). */
const barHeight = () => document.querySelector<HTMLElement>('[data-bottom-cta]')?.offsetHeight ?? 0;

/**
 * PLAN 3.6f: what to work on. One calm grid (areas, goal types, balance), every tile one height; an
 * area opens its parts in a sheet. From five picks one quiet row rises under the grid, "Rank your 5
 * picks": the priorities sheet opens from it, never by itself over a sheet that is still leaving.
 * Whole body balance clears the picks, with an Undo.
 */
export function FocusStep({ value, onChange }: { value: readonly string[]; onChange: (picks: FocusPickId[]) => void }) {
  const picks = normalizeFocusPicks(value);
  const notYet = useMemo(() => focusNotYet(), []);
  const [group, setGroup] = useState<Group | null>(null);
  const [rankOpen, setRankOpen] = useState(false);
  // The row asks ("Rank your 5 picks") from the pick that brought it until the ranking has been opened.
  const [asks, setAsks] = useState(false);
  const [toast, setToast] = useState<(ToastMessage & { bottom: number }) | null>(null);
  useToastTimeout(toast, setToast);
  const order = ranked(picks);
  const row = useRef<HTMLDivElement>(null);
  // The row comes in under the grid: on a short screen the page brings it above the button.
  useEffect(() => {
    if (asks) row.current?.scrollIntoView({ block: 'nearest', behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' });
  }, [asks]);
  const change = (next: FocusPickId[]) => {
    if (!order.length && ranked(next).length > 0) setAsks(true);
    setToast(null);
    onChange(next);
  };
  /** Balance replaces every pick: said, and one tap takes it back (the picks and their order). */
  const balance = () => {
    const before = picks;
    onChange(['balance']);
    setAsks(false);
    if (before.length) setToast({ ...undoToast(Date.now(), `${plural(before.length, 'pick', 'picks')} cleared`, () => { onChange(before); setToast(null); }), bottom: barHeight() });
  };
  const toggle = (id: FocusPickId) => (picks.includes(id) ? change(picks.filter((p) => p !== id)) : id === 'balance' ? balance() : change([...picks.filter((p) => p !== 'balance'), id]));
  const openRank = () => { setAsks(false); setRankOpen(true); };
  return (
    <div className={styles.step}>
      <div className={styles.tiles} role="group" aria-label="Focus areas" data-testid="q-focus">
        {TILES.map((o) => {
          const parts = o.id in FOCUS_PARTS ? FOCUS_PARTS[o.id as keyof typeof FOCUS_PARTS] : [];
          const selected = picks.filter((p) => p === o.id || parts.some((part) => part.id === p));
          // One quiet line that never wraps: the part picked, how many, or that nothing sure trains it yet.
          const hint = o.id === 'balance' ? BALANCE_HINT : notYet.has(o.id) ? NOT_YET : !parts.length || !selected.length ? undefined : selected.includes(o.id) ? 'All of it' : selected.length > 1 ? `${selected.length} parts` : focusName(selected[0]!);
          return <Chip key={o.id} block icon={iconFor(o.icon)} label={o.label} hint={hint} picked={selected.length > 0} onPress={() => (parts.length ? setGroup(o.id as Group) : toggle(o.id))} testId={`q-focus-${o.id}`} />;
        })}
      </div>
      {order.length ? (
        <div ref={row} className={styles.priorities} data-asks={asks || undefined}>
          <SummaryRow label={asks ? `Rank your ${order.length} picks` : 'Your priorities'} value={<>Most extra work: {list(order.slice(0, 2).map(focusName))}</>} action={asks ? 'Rank' : 'Reorder'} onPress={openRank} testId="focus-rank-open" valueTestId="focus-rank-top" />
        </div>
      ) : !picks.length || picks.includes('balance') ? (
        <p className={styles.note} data-testid="focus-same" data-under={toast ? '' : undefined}>{BALANCE_SAME}</p>
      ) : null}
      {group && <FocusPartsSheet key={group} group={group} picks={picks} notYet={notYet} onClose={() => setGroup(null)} onSave={(v) => { setGroup(null); change(normalizeFocusPicks(v)); }} />}
      <FocusRank open={rankOpen && order.length > 0} picks={order} onClose={() => setRankOpen(false)} onChange={(next) => onChange([...next, ...picks.filter((p) => !next.includes(p))])} />
      <Toast toast={toast} bottom={`calc(${toast?.bottom ?? 0}px - var(--safe-bottom))`} />
    </div>
  );
}
