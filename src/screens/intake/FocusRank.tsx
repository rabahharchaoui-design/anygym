import { Reorder, useDragControls, useReducedMotion } from 'motion/react';
import { ArrowDown, ArrowUp, GripVertical } from 'lucide-react';
import { focusLabel } from '../../lib/plan/focus';
import type { FocusPickId } from '../../lib/intake/options';
import { Button } from '../../ui/Button';
import { GLIDE } from '../../ui/motion';
import styles from './Focus.module.css';

export function FocusRank({ picks, onChange }: { picks: FocusPickId[]; onChange: (picks: FocusPickId[]) => void }) {
  const move = (index: number, by: number) => { const next = [...picks]; [next[index], next[index + by]] = [next[index + by]!, next[index]!]; onChange(next); };
  return <section className={styles.stack} aria-label="Focus priority" data-testid="focus-rank">
    <h2>Your priorities</h2>
    <p className={styles.note}>Drag to rank, or use the arrows. Earlier choices get the most room.</p>
    <Reorder.Group axis="y" values={picks} onReorder={onChange} className={styles.ranks}>
      {picks.map((id, i) => <RankRow key={id} id={id} i={i} last={i === picks.length - 1} move={move} />)}
    </Reorder.Group>
    <p className={styles.note} role="status">First: {focusLabel(picks[0]!)}</p>
  </section>;
}
function RankRow({ id, i, last, move }: { id: FocusPickId; i: number; last: boolean; move: (i: number, by: number) => void }) {
  const drag = useDragControls();
  const reduce = useReducedMotion();
  return <Reorder.Item value={id} dragListener={false} dragControls={drag} transition={reduce ? { duration: 0 } : GLIDE} className={styles.rank} data-testid={`rank-${id}`}>
    <button type="button" className={styles.handle} aria-label={`Drag ${focusLabel(id)}`} onPointerDown={(e) => drag.start(e)}><GripVertical aria-hidden width={20} /></button>
    <span className={styles.rankName}>{i + 1}. {focusLabel(id)}</span>
    <Button variant="tertiary" block={false} aria-label={`Move ${focusLabel(id)} up`} disabled={i === 0} onClick={() => move(i, -1)}><ArrowUp aria-hidden width={18} /></Button>
    <Button variant="tertiary" block={false} aria-label={`Move ${focusLabel(id)} down`} disabled={last} onClick={() => move(i, 1)}><ArrowDown aria-hidden width={18} /></Button>
  </Reorder.Item>;
}
