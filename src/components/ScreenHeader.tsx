import type { ReactNode } from 'react';
import styles from './ScreenHeader.module.css';

type Props = {
  title: string;
  leading?: ReactNode;
  trailing?: ReactNode;
  /** Plain tap on the title (no visual affordance); used for the hidden diagnostics gesture. */
  onTitleTap?: () => void;
};

export function ScreenHeader({ title, leading, trailing, onTitleTap }: Props) {
  return (
    <header className={styles.header}>
      {leading ? <div className={styles.leading}>{leading}</div> : null}
      <h1 className={styles.title} onClick={onTitleTap}>
        {title}
      </h1>
      {trailing ? <div className={styles.trailing}>{trailing}</div> : null}
    </header>
  );
}
