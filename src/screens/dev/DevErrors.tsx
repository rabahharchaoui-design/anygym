// Dev page error helpers (PLAN 1.7a): when something breaks on a real iPhone, the error text is
// on screen so G can screenshot it. Dev pages only; user screens never show raw errors.
import { Component, useEffect, useState, type ErrorInfo, type ReactNode } from 'react';
import styles from './DevErrors.module.css';

const text = (e: unknown): string => {
  if (e instanceof Error) return `${e.name}: ${e.message}${e.stack ? `\n${e.stack.split('\n').slice(0, 4).join('\n')}` : ''}`;
  try {
    return typeof e === 'string' ? e : JSON.stringify(e);
  } catch {
    return String(e);
  }
};

type BoundaryState = { error: string | null };

/** Catches a render error in one dev page input and prints it in place of the input. */
export class DevErrorBoundary extends Component<{ name: string; children: ReactNode }, BoundaryState> {
  state: BoundaryState = { error: null };

  static getDerivedStateFromError(error: unknown): BoundaryState {
    return { error: text(error) };
  }

  componentDidCatch(_error: unknown, info: ErrorInfo) {
    if (info.componentStack) this.setState((s) => ({ error: `${s.error ?? ''}\n${info.componentStack!.split('\n').slice(0, 5).join('\n')}` }));
  }

  render() {
    if (this.state.error === null) return this.props.children;
    return (
      <div className={styles.box} role="alert" data-testid="dev-error">
        <p className={styles.title}>{this.props.name} crashed</p>
        <pre className={styles.pre}>{this.state.error}</pre>
      </div>
    );
  }
}

/** Lists window errors and unhandled promise rejections at the bottom of a dev page. */
export function DevErrorLog() {
  const [errors, setErrors] = useState<string[]>([]);
  useEffect(() => {
    const add = (line: string) => setErrors((list) => [...list.slice(-19), line]);
    const onError = (e: ErrorEvent) => add(`${e.message}${e.filename ? ` (${e.filename.split('/').pop()}:${e.lineno}:${e.colno})` : ''}`);
    const onRejection = (e: PromiseRejectionEvent) => add(`Unhandled rejection: ${text(e.reason)}`);
    window.addEventListener('error', onError);
    window.addEventListener('unhandledrejection', onRejection);
    return () => {
      window.removeEventListener('error', onError);
      window.removeEventListener('unhandledrejection', onRejection);
    };
  }, []);
  return (
    <section className={styles.log} aria-label="Errors" data-testid="dev-error-log">
      <p className={styles.title}>{errors.length ? `Errors (${errors.length})` : 'No errors'}</p>
      {errors.map((e, i) => (
        <pre key={i} className={styles.pre}>
          {e}
        </pre>
      ))}
    </section>
  );
}
