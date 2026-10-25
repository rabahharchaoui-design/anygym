import type { ButtonHTMLAttributes, ReactNode } from 'react';
import styles from './Button.module.css';

export type ButtonVariant = 'primary' | 'secondary' | 'tertiary' | 'destructive';

type Props = Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'className'> & {
  variant?: ButtonVariant;
  /** lg: the screen's one big action (56 pt); md: 48 pt. */
  size?: 'lg' | 'md';
  /** Full width (the default for primary). */
  block?: boolean;
  /** Shown under a disabled button, so it never just goes grey (SPEC 23.2). */
  disabledReason?: string;
  className?: string;
  children: ReactNode;
};

/**
 * The app's buttons (SPEC 23.2). Primary: lime pill with a soft top highlight and glow.
 * Secondary: glass. Tertiary: text only. Destructive: red text. All press to 0.97 in one frame.
 */
export function Button({ variant = 'primary', size, block, disabledReason, className, children, type = 'button', ...rest }: Props) {
  const s = size ?? (variant === 'primary' ? 'lg' : 'md');
  const wide = block ?? (variant === 'primary' || variant === 'secondary');
  const button = (
    <button
      type={type}
      className={`${styles.button} ${className ?? ''}`}
      data-variant={variant}
      data-size={s}
      data-block={wide || undefined}
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
