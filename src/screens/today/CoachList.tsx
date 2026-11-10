// The lifts on a coach card (PLAN 3.8, 3.5g): one row per lift (name, old → new, the one line why),
// only today's lifts on the card with the rest one tap away in a sheet, and the lifts holding steady.
import { useState, type ReactNode } from 'react';
import { Sheet } from '../../ui/Sheet';
import { ChevronDown, ChevronRight } from '../../ui/icons';
import { formatAmount } from '../../lib/load';
import { shortList, weightWords, type Hold, type PlannedChange } from '../../lib/coach';
import styles from './Coach.module.css';

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

type Change = Pick<PlannedChange, 'exerciseId' | 'name' | 'loadKind' | 'unit' | 'from' | 'to' | 'reason'> & { fromTotal?: number; key?: string; id?: string };

/** One lift's change: name, old → new (new in lime), the one line why. */
export function ChangeRow({ c, undone, trailing }: { c: Omit<Change, 'exerciseId'>; undone?: boolean; trailing?: ReactNode }) {
  return (
    <li className={`${styles.row} ${trailing ? styles.sheetRow : ''}`} data-undone={undone || undefined} data-testid="coach-change">
      <span className={styles.name}>{c.name}</span>
      <span className={`${styles.change} num`} aria-label={`${weightWords(c.loadKind, c.fromTotal ?? c.from, c.unit)} to ${weightWords(c.loadKind, c.to, c.unit)}`}>
        {formatAmount(c.fromTotal ?? c.from)} → <b>{weightWords(c.loadKind, c.to, c.unit)}</b>
      </span>
      <span className={styles.why}>{c.reason}</span>
      {trailing}
    </li>
  );
}

/**
 * PLAN 3.5g: the card shows today's lifts (a few at most) and "+9 more", which opens every lift in a
 * sheet; the card's one action still applies to all of them, and the sheet says so.
 */
export function ShortChanges({ list, todayIds, title }: { list: readonly Change[]; todayIds: readonly string[]; title: string }) {
  const [open, setOpen] = useState(false);
  const { shown, more, today } = shortList(list, todayIds);
  return (
    <>
      {today && more > 0 && <p className={styles.listLabel}>In today's workout</p>}
      <ul className={styles.list} data-testid="coach-list">
        {shown.map((c) => (
          <ChangeRow key={c.key ?? c.id ?? c.exerciseId} c={c} />
        ))}
      </ul>
      {more > 0 && (
        <button type="button" className={`${styles.more} pressable`} onClick={() => setOpen(true)} data-testid="coach-more">
          +{more} more
          <ChevronRight width={16} height={16} strokeWidth={2.4} aria-hidden="true" />
        </button>
      )}
      <Sheet open={open} onClose={() => setOpen(false)} label={title} scroll>
        <div className={styles.sheetBody} data-testid="coach-more-sheet">
          <h2 className={styles.sheetTitle}>{title}</h2>
          <p className={styles.sheetSub}>{plural(list.length, 'lift', 'lifts')}. The card's button changes all of them, and every change has an Undo.</p>
          <ul className={styles.list}>
            {list.map((c) => (
              <ChangeRow key={c.key ?? c.id ?? c.exerciseId} c={c} />
            ))}
          </ul>
        </div>
      </Sheet>
    </>
  );
}

/** "2 lifts holding steady" with each one's why, folded away until tapped. */
export function HoldList({ holding }: { holding: Hold[] }) {
  const [open, setOpen] = useState(false);
  if (!holding.length) return null;
  return (
    <>
      <button type="button" className={`${styles.more} pressable`} aria-expanded={open} onClick={() => setOpen((o) => !o)} data-testid="coach-holding-toggle">
        {plural(holding.length, 'lift', 'lifts')} holding steady
        <ChevronDown width={16} height={16} strokeWidth={2.4} aria-hidden="true" />
      </button>
      <div className={styles.reveal} data-open={open || undefined} aria-hidden={!open}>
        <div>
          <ul className={styles.list} data-testid="coach-holding">
            {holding.map((h) => (
              <li key={h.key} className={styles.row}>
                <span className={styles.name}>{h.name}</span>
                <span className={styles.why}>{h.reason}</span>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </>
  );
}
