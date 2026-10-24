import type { PadKey } from '../../lib/numpad';
import styles from './NumPad.module.css';

const KEYS: PadKey[] = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '.', '0', 'del'];

type Props = {
  onKey: (key: PadKey) => void;
  /** Smaller keys for inline use inside a card. */
  compact?: boolean;
};

/** Our number pad (no native keyboard, no zoom). Text rules live in lib/numpad. */
export function NumPad({ onKey, compact = false }: Props) {
  return (
    <div className={styles.pad} data-compact={compact}>
      {KEYS.map((k) => (
        <button
          key={k}
          type="button"
          className={`${styles.key} num pressable`}
          onClick={() => onKey(k)}
          aria-label={k === 'del' ? 'Delete' : k === '.' ? 'Decimal point' : k}
        >
          {k === 'del' ? '⌫' : k}
        </button>
      ))}
    </div>
  );
}
