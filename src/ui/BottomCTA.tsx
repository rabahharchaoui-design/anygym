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
   * The reason replaces the label inside the grey button instead (one line), so the line under the
   * button can always keep the note (PLAN 3.3 rule f). Same button box either way: nothing moves.
   */
  reasonInButton?: boolean;
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
export function BottomCTA({ children, onPress, disabled, disabledReason, reasonInButton, above, note, floating, testId, className }: Props) {
  // One reserved line under the button (critic B2): the reason while it is grey, the quiet note
  // once it is valid, swapped in place, so the button never moves when it becomes valid.
  const why = disabled && disabledReason ? disabledReason : null;
  const under = reasonInButton ? null : why;
  return (
    <div className={`${styles.cta} ${className ?? ''}`} data-floating={floating || undefined} data-testid={testId} data-bottom-cta>
      {above}
      <Button onClick={onPress} disabled={disabled}>
        {reasonInButton && why ? <span className={styles.reasonLabel}>{why}</span> : children}
      </Button>
      {disabledReason || note ? (
        <p className={styles.note} data-reason={under ? '' : undefined} {...(under ? { role: 'note' } : {})}>
          {under ?? note ?? ''}
        </p>
      ) : null}
    </div>
  );
}
