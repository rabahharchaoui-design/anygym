import { useEffect, useMemo, useRef, useState } from 'react';
import { FOCUS, FOCUS_OBJECTIVES, FOCUS_PARTS, type FocusId, type FocusPickId } from '../../lib/intake/options';
import { focusBudget, focusName, normalizeFocusPicks } from '../../lib/plan/focus';
import { focusRankWords } from '../../lib/plan/focusWords';
import { approvedVersion } from '../../data/candidateGate';
import { focusNotYet } from '../../data/focusServed';
import { Chip } from '../../ui/Chip';
import { SummaryRow } from '../../ui/SummaryRow';
import { Toast, undoToast, type ToastMessage } from '../../ui/Toast';
import { useToastTimeout } from '../../ui/useToastTimeout';
import { plural } from '../../lib/words';
import { iconFor } from './icons';
import { BALANCE_HINT, NOT_YET } from './copy';
import { FocusPartsSheet } from './FocusPartsSheet';
import { FocusRank } from './FocusRank';
import { list } from '../../lib/intake/yourPlan';
import styles from './Focus.module.css';
import rowStyles from './IntakeRows.module.css';

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
 * picks" (pinned above the button on a short screen, so the page and its title never move): the
 * priorities sheet opens from it, never by itself over a sheet that is still leaving.
 * Whole body balance is the one control for "nothing extra": it is lit whenever no area is picked
 * (picking nothing is the same plan), and tapping it clears the picks, with an Undo that rests
 * under the grid, never over the tile.
 */
export function FocusStep({ value, onChange }: { value: readonly string[]; onChange: (picks: FocusPickId[]) => void }) {
  const picks = normalizeFocusPicks(value);
  // PLAN 3.6g: a forearm move approved on this phone makes Grip and Forearms served choices.
  const approvals = approvedVersion();
  const notYet = useMemo(() => focusNotYet(), [approvals]);
  const [group, setGroup] = useState<Group | null>(null);
  const [rankOpen, setRankOpen] = useState(false);
  // The row asks ("Rank your 5 picks") from the pick that brought it until the ranking has been opened.
  const [asks, setAsks] = useState(false);
  const [toast, setToast] = useState<(ToastMessage & { bottom: number }) | null>(null);
  useToastTimeout(toast, setToast);
  const order = ranked(picks);
  const rank = focusRankWords(order.length, picks.includes('mobility'));
  const room = useRef<HTMLDivElement>(null);
  const even = !picks.length || picks.includes('balance');
  // The Undo toast rests over its own room under the grid: the page brings that room into view.
  const toastId = toast?.id;
  useEffect(() => {
    if (toastId !== undefined) room.current?.scrollIntoView({ block: 'nearest', behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' });
  }, [toastId]);
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
      <div className={`${rowStyles.grid} ${styles.tiles}`} role="group" aria-label="Focus areas" data-testid="q-focus">
        {TILES.map((o) => {
          const parts = o.id in FOCUS_PARTS ? FOCUS_PARTS[o.id as keyof typeof FOCUS_PARTS] : [];
          const selected = picks.filter((p) => p === o.id || parts.some((part) => part.id === p));
          // One quiet line that never wraps: the part picked, how many, or that nothing sure trains it yet.
          const hint = o.id === 'balance' ? BALANCE_HINT : notYet.has(o.id) ? NOT_YET : !parts.length || !selected.length ? undefined : selected.includes(o.id) ? 'All of it' : selected.length > 1 ? `${selected.length} parts` : focusName(selected[0]!);
          return <Chip key={o.id} block icon={iconFor(o.icon)} label={o.label} hint={hint} picked={o.id === 'balance' ? even : selected.length > 0} onPress={() => (parts.length ? setGroup(o.id as Group) : toggle(o.id))} testId={`q-focus-${o.id}`} />;
        })}
      </div>
      {order.length ? (
        <div className={styles.priorities} data-asks={asks || undefined}>
          {/* Round 3: nothing is promised before the plan exists; the row says the order the plan starts from. */}
          <SummaryRow label={asks ? rank.prompt : 'Your priorities'} value={<>From the top: {list(order.slice(0, 2).map(focusName))}</>} action={asks ? 'Rank' : 'Reorder'} onPress={openRank} testId="focus-rank-open" valueTestId="focus-rank-top" />
          {rank.note && <p className={styles.note} data-testid="focus-rank-note">{rank.note}</p>}
        </div>
      ) : null}
      {toast && <div ref={room} className={styles.toastRoom} aria-hidden="true" />}
      {group && <FocusPartsSheet key={group} group={group} picks={picks} notYet={notYet} onClose={() => setGroup(null)} onSave={(v) => { setGroup(null); change(normalizeFocusPicks(v)); }} />}
      <FocusRank open={rankOpen && order.length > 0} picks={order} note={rank.note} onClose={() => setRankOpen(false)} onChange={(next) => onChange([...next, ...picks.filter((p) => !next.includes(p))])} />
      <Toast toast={toast} bottom={`calc(${toast?.bottom ?? 0}px - var(--safe-bottom))`} />
    </div>
  );
}
