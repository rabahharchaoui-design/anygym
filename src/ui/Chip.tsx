import type { LucideIcon } from 'lucide-react';
import styles from './Chip.module.css';

type Props = {
  label: string;
  /** One Lucide icon (SPEC 23.2), left of the label. */
  icon?: LucideIcon;
  picked: boolean;
  onPress: () => void;
  testId?: string;
  /** Fill the cell (grids of chips); otherwise as wide as the label. */
  block?: boolean;
  /** A quiet picked state, for long lists where most start on. */
  soft?: boolean;
};

/**
 * PLAN 3.3: a tappable prompt chip, for questions with more than five options (five or fewer use
 * ChoiceCard). A toggle button (aria-pressed); picked, the border and icon turn lime and the fill
 * tints, answering the press within a frame. 48 pt tall at least.
 */
export function Chip({ label, icon: Icon, picked, onPress, testId, block, soft }: Props) {
  return (
    <button type="button" className={`${styles.chip} pressable`} aria-pressed={picked} onClick={onPress} data-testid={testId} data-block={block || undefined} data-soft={soft || undefined}>
      {Icon && <Icon className={styles.icon} width={18} height={18} strokeWidth={2} aria-hidden="true" />}
      <span className={styles.label}>{label}</span>
    </button>
  );
}
