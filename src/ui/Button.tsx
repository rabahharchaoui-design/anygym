import type { ButtonHTMLAttributes, ReactNode } from 'react';
import styles from './Button.module.css';

/** primary: heavy text over an ice blue bar. secondary: heavy text over a hairline. quiet: text only. destructive: red text. */
export type ButtonVariant = 'primary' | 'secondary' | 'quiet' | 'destructive';
/** lg: the screen's one big action (heading size, 56 pt tall at least); md: two share a row (48 pt). */
export type ButtonSize = 'lg' | 'md';

type Props = Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'className'> & {
  variant?: ButtonVariant;
  size?: ButtonSize;
  /** Full width (the default for primary and secondary). */
  block?: boolean;
  /** Shown under a disabled button, so it never just goes grey (SPEC 23.2). */
  disabledReason?: string;
  className?: string;
  children: ReactNode;
};

/** What a button looks like from its props: the size and width a variant gets when none is given. */
export function buttonLook(variant: ButtonVariant, size?: ButtonSize, block?: boolean): { size: ButtonSize; block: boolean } {
  const lined = variant === 'primary' || variant === 'secondary';
  return { size: size ?? (variant === 'primary' ? 'lg' : 'md'), block: block ?? lined };
}

/**
 * The app's buttons (SPEC 23.2, Monolith). Primary: full width heavy text over a 4 px ice blue bar
 * (pressed: ice blue text, 8 px bar). Secondary: heavy text over a 1 px line. Quiet: text only.
 * Destructive: red text. Disabled: dim text over a dim bar, with the reason under it. All press to
 * 0.97 in one frame; every one is at least 44 pt to tap.
 */
export function Button({ variant = 'primary', size, block, disabledReason, className, children, type = 'button', ...rest }: Props) {
  const look = buttonLook(variant, size, block);
  const button = (
    <button
      type={type}
      className={`${styles.button} ${className ?? ''}`}
      data-variant={variant}
      data-size={look.size}
      data-block={look.block || undefined}
      {...rest}
    >
      <span className={styles.label}>{children}</span>
    </button>
  );
  if (!rest.disabled || !disabledReason) return button;
  return (
    <>
      {button}
      <span className={styles.reason} role="note">
        {disabledReason}
      </span>
    </>
  );
}
