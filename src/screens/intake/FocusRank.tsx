import { Reorder, useDragControls, useReducedMotion } from 'motion/react';
import { ArrowDown, ArrowUp, GripVertical } from 'lucide-react';
import { focusBudget, focusLabel } from '../../lib/plan/focus';
import type { FocusPickId } from '../../lib/intake/options';
import { Button } from '../../ui/Button';
import { Sheet, SheetFooter } from '../../ui/Sheet';
import { FADE, GLIDE } from '../../ui/motion';
import styles from './Focus.module.css';

type Props = { open: boolean; picks: FocusPickId[]; onChange: (picks: FocusPickId[]) => void; onClose: () => void };

/**
 * PLAN 3.6f: "Your priorities", its own calm moment once five or more areas are picked. Drag a row
 * by its handle or use the arrows; the top two get the most extra work, and a pick past what the
 * week can hold says so here (the shares come from the budget itself, lib/plan/focus.ts).
 */
export function FocusRank({ open, picks, onChange, onClose }: Props) {
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
        <p className={styles.sheetNote}>Your top two get the most extra work. Drag a row, or use the arrows.</p>
        <Reorder.Group axis="y" values={picks} onReorder={onChange} className={styles.ranks}>
          {picks.map((id, i) => (
            <RankRow key={id} id={id} i={i} last={i === picks.length - 1} none={shares.get(id) === 0} move={move} />
          ))}
        </Reorder.Group>
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
