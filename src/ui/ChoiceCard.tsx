import type { ReactNode } from 'react';
import { Check, type LucideIcon } from 'lucide-react';
import { Icon3D } from './icon3d/Icon3D';
import styles from './ChoiceCard.module.css';

type Props = {
  /** A Lucide icon (one family, SPEC 23.2), drawn on the left. */
  icon?: LucideIcon;
  /** PLAN 3.6i: a 3D icon's name ("place-home"). The picture takes the line icon's place in a fixed slot; the line icon stays when it cannot load. */
  art?: string;
  label: string;
  /** One quiet line under the label. */
  hint?: ReactNode;
  /** Right of the label, before the ring (a weight, "Current"). */
  detail?: ReactNode;
  picked: boolean;
  onPress: () => void;
  testId?: string;
  disabled?: boolean;
  /** PLAN M12 (Monolith): a row on the page, a hairline under it, no box; picked, the label turns white and an ice tick shows. */
  flat?: boolean;
};

/**
 * PLAN 2.2e: a full width choice card. Icon, label, optional hint, and a selection ring on the
 * right; picked, the border turns accent and the ring fills on the tap spring (CSS, compositor only).
 * A toggle button (aria-pressed), so a group of them reads as "pressed" for the one picked.
 */
export function ChoiceCard({ icon: Icon, art, label, hint, detail, picked, onPress, testId, disabled, flat }: Props) {
  return (
    <button type="button" className={`${styles.card} pressable`} aria-pressed={picked} onClick={onPress} data-testid={testId} data-flat={flat || undefined} disabled={disabled}>
      {art ? (
        <Icon3D name={art} fallback={Icon} lineSize={22} className={styles.art} />
      ) : (
        Icon && (
        <span className={styles.icon} aria-hidden="true">
          <Icon width={22} height={22} strokeWidth={2} />
        </span>
        )
      )}
      <span className={styles.text}>
        <span className={styles.label}>{label}</span>
        {hint ? <span className={styles.hint}>{hint}</span> : null}
      </span>
      {detail ? <span className={`${styles.detail} num`}>{detail}</span> : null}
      <span className={styles.ring} aria-hidden="true" data-ring>
        <span className={styles.fill}>
          <Check width={14} height={14} strokeWidth={3.2} />
        </span>
      </span>
    </button>
  );
}
