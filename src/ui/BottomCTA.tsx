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
};

/**
 * PLAN 2.2e: the screen's one primary action, pinned in the thumb zone. Owns the bottom safe area.
 * The button is the app's lime primary (press 0.97 in one frame); disabled it is grey.
 */
export function BottomCTA({ children, onPress, disabled, disabledReason, above, note, floating, testId }: Props) {
  return (
    <div className={styles.cta} data-floating={floating || undefined} data-testid={testId} data-bottom-cta>
      {above}
      <Button onClick={onPress} disabled={disabled} disabledReason={disabledReason}>
        {children}
      </Button>
      {note ? <p className={styles.note}>{note}</p> : null}
    </div>
  );
}
