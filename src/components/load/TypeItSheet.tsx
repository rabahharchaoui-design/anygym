import { useEffect, useMemo, useState } from 'react';
import type { Collars, Unit } from '../../db/types';
import { formatAmount, formatWeight, solvePlates, type Loading } from '../../lib/load';
import { parseTyped, pressKey, type PadKey } from '../../lib/numpad';
import { Sheet } from '../Sheet';
import styles from './TypeItSheet.module.css';

type Props = {
  open: boolean;
  onClose: () => void;
  unit: Unit;
  bar: number;
  inventory: readonly number[];
  collars: Collars;
  onApply: (perSide: number[]) => void;
};

const KEYS: PadKey[] = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '.', '0', 'del'];

const perSideText = (perSide: readonly number[]): string =>
  perSide.length ? perSide.map(formatAmount).join(' + ') : 'Empty bar';

/** "Type it" (SPEC 5.2, 5.4): type a total, the solver picks the plates. */
export function TypeItSheet({ open, onClose, unit, bar, inventory, collars, onApply }: Props) {
  const [text, setText] = useState('');
  useEffect(() => {
    if (open) setText('');
  }, [open]);

  const target = parseTyped(text);
  const result = useMemo(
    () => (target === null ? null : solvePlates(target, { bar, inventory, collars, unit })),
    [target, bar, inventory, collars, unit],
  );

  const apply = (perSide: number[]) => {
    onApply(perSide);
    onClose();
  };

  const choices: Loading[] = result && !result.exact ? [result.below, result.above].filter((l): l is Loading => !!l) : [];

  return (
    <Sheet open={open} onClose={onClose} label="Type a weight">
      <div className={styles.display}>
        <span className={`${styles.typed} num`} data-testid="typed" aria-live="polite">
          {text || <span className={styles.placeholder}>0</span>}
        </span>
        <span className={styles.unit}>{unit}</span>
      </div>

      <div className={styles.result} data-testid="solve-result" aria-live="polite">
        {result === null && <p className={styles.hint}>Type the total, bar included.</p>}
        {result?.exact && (
          <p className={styles.exact}>
            <strong>Exact</strong> <span className={styles.per}>Each side: {perSideText(result.perSide)}</span>
          </p>
        )}
        {result && !result.exact && (
          <>
            <p className={styles.closest}>Closest: {choices.map((c) => formatAmount(c.total)).join(' or ')}</p>
            <div className={styles.choices}>
              {choices.map((c) => (
                <button
                  key={c.total}
                  type="button"
                  className={`${styles.choice} pressable`}
                  onClick={() => apply(c.perSide)}
                  aria-label={`Use ${formatWeight(c.total, unit)}`}
                >
                  <span className={`${styles.choiceTotal} num`}>{formatWeight(c.total, unit)}</span>
                  <span className={styles.per}>{perSideText(c.perSide)}</span>
                </button>
              ))}
            </div>
          </>
        )}
      </div>

      <div className={styles.pad}>
        {KEYS.map((k) => (
          <button
            key={k}
            type="button"
            className={`${styles.key} num pressable`}
            onClick={() => setText((t) => pressKey(t, k))}
            aria-label={k === 'del' ? 'Delete' : k === '.' ? 'Decimal point' : k}
          >
            {k === 'del' ? '⌫' : k}
          </button>
        ))}
      </div>

      <button
        type="button"
        className={`${styles.confirm} pressable`}
        disabled={!result?.exact}
        onClick={() => result?.exact && apply(result.perSide)}
      >
        {result && !result.exact ? 'Pick one above' : 'Load it'}
      </button>
    </Sheet>
  );
}
