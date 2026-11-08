// The one coach card on Today (PLAN 3.8, SPEC 15, competitor gap 3): short, specific, one tap to
// accept, always says why. Every change shows old → new per lift, and every tap has an Undo.
import { useRef, useState, type ReactNode } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import { ChevronDown, CoachIcon, XIcon } from '../../ui/icons';
import { FADE, SPRING } from '../../ui/motion';
import { undoToast, type ToastMessage } from '../../ui/Toast';
import { applyChanges, closeCard, reopenCard, undoApplied } from '../../db/coach';
import { rebuildWeek, undoRebuildWeek } from '../../db/planState';
import { setAlwaysUse } from '../../db/swaps';
import { planById } from '../../data/plans';
import { formatAmount } from '../../lib/load';
import type { CoachData } from '../../db/coachData';
import { weekKey, weightWords, type CoachCard as Card, type Hold, type PlannedChange } from '../../lib/coach';
import { learnedOf } from './useCoach';
import styles from './Coach.module.css';

type Props = {
  card: Card | null;
  data: CoachData | undefined;
  onToast: (t: ToastMessage) => void;
  onSeeChanges: () => void;
};

let seq = 0;
/** Longer than a double tap: the toast (and its Undo) never takes a tap meant for the card. */
export const TOAST_AFTER_MS = 400;
const toastId = () => Date.now() + ++seq;
const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;
const failed = (): ToastMessage => ({ id: toastId(), text: 'Could not save that. Try again.' });

/** One lift's change: name, old → new (new in lime), the one line why. */
export function ChangeRow({ c, undone, trailing }: { c: Pick<PlannedChange, 'name' | 'loadKind' | 'unit' | 'from' | 'to' | 'reason'>; undone?: boolean; trailing?: ReactNode }) {
  return (
    <li className={`${styles.row} ${trailing ? styles.sheetRow : ''}`} data-undone={undone || undefined} data-testid="coach-change">
      <span className={styles.name}>{c.name}</span>
      <span className={`${styles.change} num`} aria-label={`${weightWords(c.loadKind, c.from, c.unit)} to ${weightWords(c.loadKind, c.to, c.unit)}`}>
        {formatAmount(c.from)} → <b>{weightWords(c.loadKind, c.to, c.unit)}</b>
      </span>
      <span className={styles.why}>{c.reason}</span>
      {trailing}
    </li>
  );
}

function HoldList({ holding }: { holding: Hold[] }) {
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

export function CoachCard({ card, data, onToast, onSeeChanges }: Props) {
  const reduce = useReducedMotion();
  const [busy, setBusy] = useState(false);
  // Round 2 (tester T1): a ref, not state, so a second tap in the same frame is a no op while the
  // first runs. The toast follows TOAST_AFTER_MS later: the card leaves and the Undo toast would rise
  // right where the tapped button was, so a fast second tap could land on Undo. The lock holds until then.
  const lock = useRef(false);
  const run = async (work: () => Promise<ToastMessage | null>) => {
    if (lock.current) return;
    lock.current = true;
    setBusy(true);
    let t: ToastMessage | null = null;
    try {
      t = await work();
    } catch {
      t = failed();
    }
    window.setTimeout(() => {
      lock.current = false;
      setBusy(false);
      if (t) onToast(t);
    }, TOAST_AFTER_MS);
  };

  /** Applies a card's changes; the toast's Undo takes every one back and the card can show again. */
  const apply = (id: string, week: string, list: PlannedChange[], text: string) =>
    run(async () => {
      const now = Date.now();
      const applied = await applyChanges(id, week, list, undefined, now, data ? learnedOf(data, now) : {});
      return undoToast(toastId(), text, () => void undoApplied(applied).catch(() => onToast(failed())));
    });

  const later = (id: string) =>
    run(async () => {
      await closeCard(id, 'dismissed');
      return undoToast(toastId(), 'Okay, nothing changed', () => void reopenCard(id).catch(() => onToast(failed())));
    });

  const body = (() => {
    if (!card) return null;
    switch (card.kind) {
      case 'level_up': {
        const { earned, holding, weekKey: week } = card.decision;
        return (
          <>
            <h2 className={styles.title}>{card.title}</h2>
            <ul className={styles.list}>
              {earned.map((c) => (
                <ChangeRow key={c.key} c={c} />
              ))}
            </ul>
            <HoldList holding={holding} />
            <Actions onLater={() => void later(card.id)} primary="Add weight" onPrimary={() => void apply(card.id, week, earned, `Added weight to ${plural(earned.length, 'lift', 'lifts')}`)} busy={busy} />
          </>
        );
      }
      case 'leveled_up':
        return (
          <>
            <div className={styles.quietRow}>
              <span className={styles.whoIcon} aria-hidden="true">
                <CoachIcon width={14} height={14} strokeWidth={2.4} />
              </span>
              <span className={styles.quietText} data-testid="coach-title">
                {card.title}
              </span>
              <button type="button" className={`${styles.close} pressable`} aria-label="Hide this" onClick={() => void run(async () => (await closeCard(card.id, 'dismissed'), null))}>
                <XIcon width={18} height={18} strokeWidth={2.4} aria-hidden="true" />
              </button>
            </div>
            <button type="button" className={`${styles.link} pressable`} onClick={onSeeChanges} data-testid="coach-see-changes">
              See changes
            </button>
          </>
        );
      case 'deload':
        return (
          <>
            <h2 className={styles.title}>Time for a lighter week?</h2>
            <p className={styles.text}>{card.text} About 10% less and one set fewer, this week only.</p>
            <ul className={styles.list}>
              {card.changes.map((c) => (
                <ChangeRow key={c.key} c={c} />
              ))}
            </ul>
            <Actions onLater={() => void later(card.id)} primary="Lighter week" onPrimary={() => void apply(card.id, weekKey(Date.now()), card.changes, `Lighter week set for ${plural(card.changes.length, 'lift', 'lifts')}`)} busy={busy} />
          </>
        );
      case 'welcome_back':
        return (
          <>
            <h2 className={styles.title}>Welcome back! Ease in this week?</h2>
            <p className={styles.text}>It has been {card.days} days. About 10% less weight for the next 7 days, then you build back up.</p>
            <ul className={styles.list}>
              {card.changes.map((c) => (
                <ChangeRow key={c.key} c={c} />
              ))}
            </ul>
            <Actions onLater={() => void later(card.id)} primary="Ease in" onPrimary={() => void apply(card.id, weekKey(Date.now()), card.changes, `Easing in on ${plural(card.changes.length, 'lift', 'lifts')}`)} busy={busy} />
          </>
        );
      case 'missed_days': {
        const plan = planById(data?.planState?.planId);
        const at = plan && data?.planState ? Math.max(0, Math.min(data.planState.nextDayIndex, plan.days.length - 1)) : null;
        const next = at === null ? 'where you left off' : `Day ${at + 1}`;
        return (
          <>
            <h2 className={styles.title}>{card.title}</h2>
            <p className={styles.text}>Nothing changes until you pick.</p>
            <div className={`${styles.actions} ${styles.pair}`}>
              <button type="button" className={`${styles.secondary} pressable`} disabled={busy} data-testid="coach-rebuild"
                onClick={() =>
                  void run(async () => {
                    const r = await rebuildWeek();
                    await closeCard(card.id, 'used');
                    if (!r) return null;
                    return undoToast(toastId(), 'Week rebuilt: Day 1 is next', () =>
                      void undoRebuildWeek(r)
                        .then(() => reopenCard(card.id))
                        .catch(() => onToast(failed())),
                    );
                  })
                }
              >
                Restart Day 1
              </button>
              <button type="button" className={`${styles.primary} pressable`} disabled={busy} data-testid="coach-pick-up"
                onClick={() =>
                  void run(async () => {
                    await closeCard(card.id, 'used');
                    return { id: toastId(), text: at === null ? 'Picking up where you left off' : `Picking up with Day ${at + 1}` };
                  })
                }
              >
                {at === null ? 'Resume' : `Resume ${next}`}
              </button>
            </div>
          </>
        );
      }
      case 'plateau': {
        const p = card.plateau;
        const a = p.action;
        return (
          <>
            <h2 className={styles.title}>{p.text}</h2>
            {a.kind === 'lighter' ? (
              <>
                <p className={styles.text}>Change only this lift: go a little lighter next time, then build back up past it.</p>
                <ul className={styles.list}>
                  <ChangeRow c={a.change} />
                </ul>
                <Actions onLater={() => void later(card.id)} primary="Go lighter next time" onPrimary={() => void apply(card.id, weekKey(Date.now()), [a.change], `${p.name}: ${weightWords(a.change.loadKind, a.change.to, a.change.unit)} next time`)} busy={busy} />
              </>
            ) : (
              <>
                <p className={styles.text}>Change only this lift: try {a.name} in its place in your plan for a few weeks. A close variation often gets you moving again.</p>
                <Actions
                  onLater={() => void later(card.id)}
                  primary={`Try ${a.name}`}
                  busy={busy}
                  onPrimary={() =>
                    void run(async () => {
                      const before = await setAlwaysUse(a.slot, a.planId, a.id);
                      await closeCard(card.id, 'used');
                      return undoToast(toastId(), `${a.name} is in your plan now`, () =>
                        void setAlwaysUse(a.slot, a.planId, before)
                          .then(() => reopenCard(card.id))
                          .catch(() => onToast(failed())),
                      );
                    })
                  }
                />
              </>
            )}
          </>
        );
      }
    }
  })();

  return (
    <AnimatePresence initial={false} mode="popLayout">
      {card && (
        <motion.section
          key={card.id}
          className={styles.card}
          data-quiet={card.kind === 'leveled_up' || undefined}
          aria-label="Coach"
          data-testid="coach-card"
          data-kind={card.kind}
          initial={reduce ? { opacity: 0 } : { opacity: 0, y: 8 }}
          animate={reduce ? { opacity: 1 } : { opacity: 1, y: 0 }}
          exit={reduce ? { opacity: 0 } : { opacity: 0, scale: 0.97, transition: { duration: 0.16 } }}
          transition={reduce ? FADE : SPRING}
        >
          {card.kind !== 'leveled_up' && (
            <span className={styles.who}>
              <span className={styles.whoIcon} aria-hidden="true">
                <CoachIcon width={14} height={14} strokeWidth={2.4} />
              </span>
              Coach
            </span>
          )}
          {body}
        </motion.section>
      )}
    </AnimatePresence>
  );
}

function Actions({ onLater, primary, onPrimary, busy }: { onLater: () => void; primary: string; onPrimary: () => void; busy: boolean }) {
  return (
    <div className={styles.actions}>
      <button type="button" className={`${styles.later} pressable`} onClick={onLater} disabled={busy} data-testid="coach-later">
        Not now
      </button>
      <button type="button" className={`${styles.primary} pressable`} onClick={onPrimary} disabled={busy} data-testid="coach-apply">
        {primary}
      </button>
    </div>
  );
}

/** The one Coach line (no card): a quiet row with the single most useful thing. */
export function CoachLine({ line }: { line: string | null }) {
  if (!line) return null;
  return (
    <p className={styles.line} data-testid="coach-line">
      <span className={styles.whoIcon} aria-hidden="true">
        <CoachIcon width={14} height={14} strokeWidth={2.4} />
      </span>
      <span>
        <b>Coach:</b> {line}
      </span>
    </p>
  );
}
