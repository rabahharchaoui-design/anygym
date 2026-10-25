import { useCallback, useEffect, useState } from 'react';
import { TopBar } from '../../ui/TopBar';
import { BackButton } from '../../ui/BackButton';
import { collectViewportInfo, formatViewportInfo, viewportRows, type ViewportInfo } from './viewportInfo';
import styles from './ViewportDevScreen.module.css';

async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    // Older iOS or no clipboard permission: fall back to a selected textarea.
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.setAttribute('readonly', '');
    ta.style.cssText = 'position:fixed;top:0;left:0;opacity:0;font-size:16px;';
    document.body.appendChild(ta);
    ta.select();
    const ok = document.execCommand('copy');
    ta.remove();
    return ok;
  }
}

/**
 * Dev diagnostics (#/dev/viewport, PLAN 1.10b): what the phone reports about its screen,
 * safe areas and our own shell and tab bar, so a Home Screen screenshot explains any gap.
 * Rendered inside the app shell so the tab bar it measures is the real one.
 */
export function ViewportDevScreen() {
  const [info, setInfo] = useState<ViewportInfo | null>(null);
  const [copied, setCopied] = useState<'idle' | 'done' | 'failed'>('idle');

  const measure = useCallback(() => setInfo(collectViewportInfo()), []);

  useEffect(() => {
    // Measure after layout settles, then again on every viewport change.
    const raf = requestAnimationFrame(measure);
    const vv = window.visualViewport;
    window.addEventListener('resize', measure);
    window.addEventListener('orientationchange', measure);
    vv?.addEventListener('resize', measure);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('resize', measure);
      window.removeEventListener('orientationchange', measure);
      vv?.removeEventListener('resize', measure);
    };
  }, [measure]);

  const onCopy = async () => {
    const fresh = collectViewportInfo();
    setInfo(fresh);
    setCopied((await copyText(formatViewportInfo(fresh))) ? 'done' : 'failed');
  };

  return (
    <>
      <TopBar title="Viewport" leading={<BackButton to="/" label="Back to Today" />} />
      <div className={styles.actions}>
        <button type="button" className={`${styles.primary} pressable`} onClick={onCopy} data-testid="viewport-copy">
          {copied === 'done' ? 'Copied' : copied === 'failed' ? 'Copy failed' : 'Copy'}
        </button>
        <button type="button" className={`${styles.secondary} pressable`} onClick={measure}>
          Measure again
        </button>
      </div>
      <dl className={styles.list} data-testid="viewport-info">
        {info &&
          viewportRows(info).map(([k, v]) => (
            <div key={k} className={styles.row}>
              <dt className={styles.key}>{k}</dt>
              <dd className={styles.value}>{v}</dd>
            </div>
          ))}
      </dl>
    </>
  );
}
