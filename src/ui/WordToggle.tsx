import type { ReactNode } from 'react';
import styles from './WordToggle.module.css';

type Props = {
  picked: boolean;
  onPress: () => void;
  testId?: string;
  children: ReactNode;
};

/**
 * PLAN M12 (Monolith): a choice written as a word. Not picked: secondary text. Picked: white, with
 * the ice line under it (the tab bar's mark, as wide as the word). A toggle button (aria-pressed)
 * with a 48 pt hit area, so a row of them reads as one group with one pressed.
 */
export function WordToggle({ picked, onPress, testId, children }: Props) {
  return (
    <button type="button" className={styles.word} aria-pressed={picked} onClick={onPress} data-testid={testId}>
      {children}
    </button>
  );
}
