import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import styles from './PRBadge.module.css';

/** Sets whose badge already sprang in (this page load): coming back to a row never replays it. */
const shown = new Set<string>();

type Props = {
  /** The set the record belongs to: the entrance plays once per set. */
  setId: string;
  /** The one line a tap shows ("New best: beat 185 lb × 5 from Sat"), from real data only. */
  detail: string;
  className?: string;
};

const POPOVER_MS = 3500;

/**
 * PLAN 2.2e: the lime "PR" chip on a logged set that beat the exercise's best (round 2, critic B3:
 * 22 pt tall, 12 pt text, after the reps, 44 pt hit area). The first time it shows it springs in
 * and the row gives one short lime ring pulse (SPEC 23.3); reduced motion: a fade, no pulse. A tap
 * shows one line saying what it beat. Freshness is decided once per mounted chip and recorded only
 * after commit (Codex 2.2e #2: StrictMode's second render or an abandoned one never consumes it).
 */
export function PRBadge({ setId, detail, className }: Props) {
  const [fresh] = useState(() => !shown.has(setId));
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLButtonElement>(null);
  const [at, setAt] = useState<{ x: number; y: number } | null>(null);

  useEffect(() => {
    shown.add(setId);
    if (!fresh) return;
    const row = ref.current?.closest<HTMLElement>('[data-state="logged"], [data-pr-row]');
    if (!row) return;
    row.dataset.prFresh = '';
    const t = window.setTimeout(() => delete row.dataset.prFresh, 900);
    return () => {
      window.clearTimeout(t);
      delete row.dataset.prFresh;
    };
  }, [setId, fresh]);

  useLayoutEffect(() => {
    if (!open || !ref.current) return;
    const b = ref.current.getBoundingClientRect();
    setAt({ x: b.right, y: b.top });
    const close = (e: Event) => {
      if (e.target instanceof Node && ref.current?.contains(e.target)) return;
      setOpen(false);
    };
    const t = window.setTimeout(() => setOpen(false), POPOVER_MS);
    document.addEventListener('pointerdown', close, true);
    window.addEventListener('scroll', close, true);
    return () => {
      window.clearTimeout(t);
      document.removeEventListener('pointerdown', close, true);
      window.removeEventListener('scroll', close, true);
    };
  }, [open]);

  return (
    <>
      <button
        ref={ref}
        type="button"
        className={`${styles.hit} ${className ?? ''}`}
        data-fresh={fresh || undefined}
        data-testid="pr-badge"
        aria-label={`New best. ${detail}`}
        aria-expanded={open}
        onClick={(e) => {
          e.stopPropagation();
          setOpen((o) => !o);
        }}
      >
        <span className={styles.badge} data-chip aria-hidden="true">
          PR
        </span>
      </button>
      {open &&
        at &&
        createPortal(
          <div className={styles.pop} role="status" data-testid="pr-popover" style={{ right: Math.max(12, window.innerWidth - at.x - 12), top: at.y }}>
            {detail}
          </div>,
          document.body,
        )}
    </>
  );
}
