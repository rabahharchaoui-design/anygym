import type { PlanBlock, PlanDay, PlanItem } from '../../lib/plans';
import { itemLine, planRest, weekTable } from '../../lib/plans';
import styles from './Plans.module.css';

/**
 * A weekly_table item's six weeks side by side (PLAN 3.1): the JSON's own numbers, only the one
 * that changes, the week being shown in lime. Read only; the week chips above pick the week.
 */
function WeekStrip({ it, weekIndex }: { it: PlanItem; weekIndex: number }) {
  const table = weekTable(it);
  if (!table) return null;
  return (
    <div className={styles.weekTable} data-testid={`week-table-${it.exerciseId}`}>
      <p className={styles.weekCaption}>{table.caption}</p>
      <ol className={styles.weekCells} aria-label={table.caption}>
        {table.cells.map((c, i) => (
          <li key={i} className={styles.weekCell} data-current={i === weekIndex || undefined} aria-label={`Week ${i + 1}: ${c}`}>
            <span className={styles.weekCellWeek} aria-hidden="true">
              Wk {i + 1}
            </span>
            <span className={`${styles.weekCellValue} num`} aria-hidden="true" data-testid="week-cell">
              {c}
            </span>
          </li>
        ))}
      </ol>
    </div>
  );
}

function Item({ block, it, weekIndex, pair }: { block: PlanBlock; it: PlanItem; weekIndex: number; pair: boolean }) {
  return (
    <li className={styles.item}>
      <div className={styles.itemText} data-testid={`plan-item-${it.exerciseId}`}>
        <span className={styles.itemName}>{it.name}</span>
        <span className={`${styles.itemLine} num`}>{itemLine(block, it, weekIndex, !pair)}</span>
        {it.note && <span className={styles.itemNote}>{it.note}</span>}
      </div>
      <WeekStrip it={it} weekIndex={weekIndex} />
    </li>
  );
}

/**
 * One day's exercises in plain words. A pair is one shared card with its label on top and its one
 * rest under both rows (SPEC 13.1, PLAN 2.0g: the rest comes after the round, not after each
 * exercise); warm ups labeled.
 */
export function PlanDayList({ day, weekIndex }: { day: PlanDay; weekIndex: number }) {
  return (
    <ol className={styles.blocks}>
      {day.blocks.map((b, bi) => {
        const pair = b.kind === 'pair';
        const label = [b.warmup ? 'Warm up' : null, pair ? 'Pair: back to back' : null].filter(Boolean).join(' · ');
        const rest = pair ? planRest(b) : undefined;
        return (
          <li key={bi} className={styles.block} data-kind={b.kind} data-warmup={b.warmup || undefined} data-testid={pair ? 'plan-pair' : undefined}>
            {label && <p className={styles.blockLabel}>{label}</p>}
            <ul className={styles.items}>
              {b.items.map((it) => (
                <Item key={it.exerciseId} block={b} it={it} weekIndex={weekIndex} pair={pair} />
              ))}
            </ul>
            {rest !== undefined && (
              <p className={`${styles.pairRest} num`} data-testid="pair-rest">
                {rest} s rest after both
              </p>
            )}
          </li>
        );
      })}
    </ol>
  );
}
