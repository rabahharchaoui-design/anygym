import { Component, useEffect, useState, type ErrorInfo, type ReactNode } from 'react';
import { captureCrash } from '../lib/reporting/capture';
import { Button } from '../ui/Button';
import { devToolsEnabled } from '../screens/dev/devFlag';
import styles from './AppErrorBoundary.module.css';

type State = { failed: boolean };

/**
 * The last safety net (SPEC 24, 13.1): a render error anywhere sends a crash report (if allowed) and
 * shows plain words with one way out. Nothing is deleted: the workout in progress lives in the
 * database and comes back after Reload.
 */
export class AppErrorBoundary extends Component<{ children: ReactNode }, State> {
  state: State = { failed: false };

  static getDerivedStateFromError(): State {
    return { failed: true };
  }

  componentDidCatch(error: unknown, info: ErrorInfo) {
    void captureCrash(error, info.componentStack ?? '');
  }

  render() {
    if (!this.state.failed)
      return (
        <>
          {this.props.children}
          {DEV && <CrashProbe />}
        </>
      );
    return (
      <div className={styles.screen} role="alert" data-testid="app-error">
        <div className={styles.card}>
          <h1 className={styles.title}>Something went wrong</h1>
          <p className={styles.text}>Your workout is saved. Reload to pick up where you left off.</p>
          <Button onClick={() => window.location.reload()}>Reload</Button>
        </div>
      </div>
    );
  }
}

const DEV = devToolsEnabled();

/** Dev builds and ?dev only: throws during render on the 'anygym:crash-probe' event (tests). */
function CrashProbe() {
  const [boom, setBoom] = useState(false);
  useEffect(() => {
    const on = () => setBoom(true);
    window.addEventListener('anygym:crash-probe', on);
    return () => window.removeEventListener('anygym:crash-probe', on);
  }, []);
  if (boom) throw new Error('Crash probe');
  return null;
}
