import type { ReactNode } from 'react';
import styles from './ScreenHeader.module.css';

type Props = {
  title: string;
  leading?: ReactNode;
  trailing?: ReactNode;
};

export function ScreenHeader({ title, leading, trailing }: Props) {
  return (
    <header className={styles.header}>
      {leading ? <div className={styles.leading}>{leading}</div> : null}
      <h1 className={styles.title}>{title}</h1>
      {trailing ? <div className={styles.trailing}>{trailing}</div> : null}
    </header>
  );
}
