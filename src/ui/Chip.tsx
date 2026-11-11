import { Check, type LucideIcon } from 'lucide-react';
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
  /** A quiet picked state with a small check, for long lists where most start on. */
  soft?: boolean;
  /** PLAN 3.3a: a small accent tag on the picked chip ("Main", "Also"). Its space is kept. */
  tag?: string;
  /** PLAN 3.3a: a tall tile (icon on top, label at the bottom) that grows with its grid row. */
  tile?: boolean;
  /** PLAN 3.5v: a compact chip, for three in one row on the smallest phone. */
  small?: boolean;
};

/**
 * PLAN 3.3: a tappable prompt chip, for questions with more than five options (five or fewer use
 * ChoiceCard). A toggle button (aria-pressed); picked, the border and icon turn accent and the fill
 * tints, answering the press within a frame. 48 pt tall at least.
 */
export function Chip({ label, icon: Icon, picked, onPress, testId, block, soft, tag, tile, small }: Props) {
  return (
    <button type="button" className={`${styles.chip} pressable`} aria-pressed={picked} onClick={onPress} data-testid={testId} data-block={block || undefined} data-soft={soft || undefined} data-tile={tile || undefined} data-small={small || undefined}>
      {soft && <Check className={styles.check} width={14} height={14} strokeWidth={3} aria-hidden="true" />}
      {Icon && <Icon className={styles.icon} width={18} height={18} strokeWidth={2} aria-hidden="true" />}
      <span className={styles.label}>{label}</span>
      {tag !== undefined && (
        <span className={styles.tag} data-tag={tag || undefined} data-testid={testId ? `${testId}-tag` : undefined}>
          {tag}
        </span>
      )}
    </button>
  );
}
