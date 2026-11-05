import type { ReactNode } from 'react';
import { Button } from './Button';
import styles from './BottomCTA.module.css';

type Props = {
  children: ReactNode;
  onPress: () => void;
  /** Grey and inert until the screen is ready (a pick made, a read done). */
  disabled?: boolean;
  /** Under the grey button, so it never just goes grey (SPEC 23.2). */
  disabledReason?: string;
  /**
   * The reason and the note each keep their own line under the button (PLAN 3.3 rule f): the note
   * never gives way to the reason, and the reserved line means the button never moves.
   */
  reasonAndNote?: boolean;
  /** Above the button (a quiet "Next up" line, an error). */
  above?: ReactNode;
  /** One quiet honest line under the button ("Stays on this phone."). */
  note?: string;
  /**
   * floating: fixed over the bottom of a scrolling page, a dark fade above it (the page keeps
   * padding for it). Otherwise a pinned flex item under the screen's scroller.
   */
  floating?: boolean;
  testId?: string;
  className?: string;
};

/**
 * PLAN 2.2e: the screen's one primary action, pinned in the thumb zone. Owns the bottom safe area.
 * The button is the app's lime primary (press 0.97 in one frame); disabled it is grey.
 */
export function BottomCTA({ children, onPress, disabled, disabledReason, reasonAndNote, above, note, floating, testId, className }: Props) {
  // One reserved line under the button (critic B2): the reason while it is grey, the quiet note
  // once it is valid, swapped in place, so the button never moves when it becomes valid.
  const why = disabled && disabledReason ? disabledReason : null;
  const under = reasonAndNote ? null : why;
  return (
    <div className={`${styles.cta} ${className ?? ''}`} data-floating={floating || undefined} data-testid={testId} data-bottom-cta>
      {above}
      <Button onClick={onPress} disabled={disabled}>
        {children}
      </Button>
      {reasonAndNote && disabledReason ? (
        <p className={styles.note} data-reason="" data-tight="" data-testid="cta-reason" {...(why ? { role: 'note' } : {})}>
          {why ?? ''}
        </p>
      ) : null}
      {disabledReason || note ? (
        <p className={styles.note} data-after={reasonAndNote && disabledReason ? '' : undefined} data-reason={under ? '' : undefined} {...(under ? { role: 'note' } : {})}>
          {under ?? note ?? ''}
        </p>
      ) : null}
    </div>
  );
}
