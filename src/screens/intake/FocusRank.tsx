import { Reorder, useDragControls, useReducedMotion } from 'motion/react';
import { ArrowDown, ArrowUp, GripVertical } from 'lucide-react';
import { focusBudget, focusLabel } from '../../lib/plan/focus';
import { FOCUS_RANK_INTENT } from '../../lib/plan/focusWords';
import type { FocusPickId } from '../../lib/intake/options';
import { Button } from '../../ui/Button';
import { Sheet, SheetFooter } from '../../ui/Sheet';
import { FADE, GLIDE } from '../../ui/motion';
import styles from './Focus.module.css';

type Props = { open: boolean; picks: FocusPickId[]; /** Why a pick is not in the list (mobility), or null. */ note?: string | null; onChange: (picks: FocusPickId[]) => void; onClose: () => void };

/**
 * PLAN 3.6f: "Your priorities", its own calm moment once five or more areas are picked. Drag a row
 * by its handle or use the arrows; extra work is added from the top where it fits, and a pick past what the
 * week can hold says so here (the shares come from the budget itself, lib/plan/focus.ts).
 */
export function FocusRank({ open, picks, note, onChange, onClose }: Props) {
  const move = (index: number, by: number) => {
    const next = [...picks];
    [next[index], next[index + by]] = [next[index + by]!, next[index]!];
    onChange(next);
  };
  const shares = new Map(focusBudget(picks).targets.map((t) => [t.id, t.sets]));
  return (
    <Sheet open={open} onClose={onClose} label="Your priorities" scroll footer clearTop>
      <section className={styles.sheet} aria-label="Focus priority" data-testid="focus-rank">
        <h2 className={styles.sheetTitle}>What matters most?</h2>
        {/* A truthful intent, not a promise: the reveal says who really got the most (lib/plan/focusWords.ts). */}
        <p className={styles.sheetNote} data-testid="focus-rank-intent">{FOCUS_RANK_INTENT} Drag a row, or use the arrows.</p>
        <Reorder.Group axis="y" values={picks} onReorder={onChange} className={styles.ranks}>
          {picks.map((id, i) => (
            <RankRow key={id} id={id} i={i} last={i === picks.length - 1} none={shares.get(id) === 0} move={move} />
          ))}
        </Reorder.Group>
        {note && <p className={styles.sheetNote}>{note}</p>}
        <p className={styles.srOnly} role="status">
          First: {focusLabel(picks[0]!)}
        </p>
      </section>
      <SheetFooter>
        <Button onClick={onClose}>Done</Button>
      </SheetFooter>
    </Sheet>
  );
}

function RankRow({ id, i, last, none, move }: { id: FocusPickId; i: number; last: boolean; none: boolean; move: (i: number, by: number) => void }) {
  const drag = useDragControls();
  const reduce = useReducedMotion();
  const name = focusLabel(id);
  return (
    <Reorder.Item value={id} dragListener={false} dragControls={drag} transition={reduce ? FADE : GLIDE} className={styles.rank} data-top={i < 2 || undefined} data-testid={`rank-${id}`}>
      <button type="button" className={styles.handle} aria-label={`Drag ${name}`} onPointerDown={(e) => drag.start(e)}>
        <GripVertical aria-hidden width={20} height={20} />
      </button>
      <span className={styles.rankText}>
        <span className={styles.rankName}>
          <span className={`${styles.rankN} num`}>{i + 1}.</span> {name}
        </span>
        {none && <span className={styles.rankNone}>No room for extra work this far down</span>}
      </span>
      <Button variant="tertiary" block={false} className={styles.arrow} aria-label={`Move ${name} up`} disabled={i === 0} onClick={() => move(i, -1)}>
        <ArrowUp aria-hidden width={20} height={20} />
      </Button>
      <Button variant="tertiary" block={false} className={styles.arrow} aria-label={`Move ${name} down`} disabled={last} onClick={() => move(i, 1)}>
        <ArrowDown aria-hidden width={20} height={20} />
      </Button>
    </Reorder.Item>
  );
}
