import type { PlanDay } from '../../lib/plans';
import { itemLine } from '../../lib/plans';
import styles from './Plans.module.css';

/** One day's exercises in plain words; pairs grouped with a rail, warm ups labeled. */
export function PlanDayList({ day, weekIndex }: { day: PlanDay; weekIndex: number }) {
  return (
    <ol className={styles.blocks}>
      {day.blocks.map((b, bi) => {
        const label = [b.warmup ? 'Warm up' : null, b.kind === 'pair' ? 'Pair: back to back' : null].filter(Boolean).join(' · ');
        return (
          <li key={bi} className={styles.block} data-kind={b.kind} data-warmup={b.warmup || undefined}>
            {label && <p className={styles.blockLabel}>{label}</p>}
            <ul className={styles.items}>
              {b.items.map((it) => (
                <li key={it.exerciseId} className={styles.item} data-testid={`plan-item-${it.exerciseId}`}>
                  <span className={styles.itemName}>{it.name}</span>
                  <span className={`${styles.itemLine} num`}>{itemLine(b, it, weekIndex)}</span>
                  {it.note && <span className={styles.itemNote}>{it.note}</span>}
                </li>
              ))}
            </ul>
          </li>
        );
      })}
    </ol>
  );
}
