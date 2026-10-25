import { useState } from 'react';
import { Button } from '../ui/Button';
import styles from './AppErrorBoundary.module.css';

/**
 * Startup could not read the saved copy of the workout in progress (PLAN 1.7k, SPEC 13.3): what
 * localStorage holds may be older than it, so nothing is shown as current until Try again reads it.
 */
export function StartupError({ onRetry }: { onRetry: () => Promise<void> }) {
  const [busy, setBusy] = useState(false);
  const [again, setAgain] = useState(false);
  const retry = async () => {
    if (busy) return;
    setBusy(true);
    try {
      await onRetry();
    } catch {
      setAgain(true);
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className={styles.screen} role="alert" data-testid="startup-error">
      <div className={styles.card}>
        <h1 className={styles.title}>Could not open your workout</h1>
        <p className={styles.text}>{again ? 'Still could not read it. Nothing is lost. Try again in a moment.' : 'Your sets are safe on this phone. Try again to load them.'}</p>
        <Button onClick={() => void retry()} aria-busy={busy || undefined}>
          Try again
        </Button>
      </div>
    </div>
  );
}
