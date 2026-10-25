import { useEffect, useRef, type ReactNode } from 'react';
import styles from './TopBar.module.css';

type Props = {
  title: string;
  /** Left of the bar: the BackButton on pushed screens. */
  leading?: ReactNode;
  trailing?: ReactNode;
  /** Plain tap on the large title (no visual affordance); used for the hidden diagnostics gesture. */
  onTitleTap?: () => void;
  /** Under the large title, still in the header block (e.g. the plan's meta line). */
  children?: ReactNode;
};

/**
 * iOS large title bar (SPEC 23.1). The bar sits at the very top with exactly the top safe inset
 * (PLAN 1.10b). Over the first 30 px of scroll one progress value drives everything, so nothing
 * is ever sliced: the large title fades out completely, the bar's glass fades in, and the small
 * centered title appears once the large one is gone (on short pages too). The
 * large title wraps (never clipped at 130% text, PLAN 1.7g); the compact one is a decorative copy.
 */
/** Scroll distance over which the large title hands over to the compact one. */
const COLLAPSE_PX = 30;

export function TopBar({ title, leading, trailing, onTitleTap, children }: Props) {
  const barRef = useRef<HTMLElement>(null);
  const titleRef = useRef<HTMLHeadingElement>(null);

  useEffect(() => {
    const bar = barRef.current;
    const big = titleRef.current;
    const scroller = bar?.closest<HTMLElement>('[data-scroller]');
    if (!bar || !big || !scroller) return;
    let frame = 0;
    const update = () => {
      frame = 0;
      // One progress value over the first 30 px of scroll (also on short pages): the large title
      // fades out completely, the bar's glass fades in, and only then the compact title appears, so
      // the bar and its back button never sit over a visible large title.
      const p = Math.min(1, Math.max(0, scroller.scrollTop / COLLAPSE_PX));
      const passed = p >= 1;
      const scrolled = p > 0;
      bar.style.setProperty('--collapse', p.toFixed(3));
      big.style.opacity = p > 0 ? (1 - p).toFixed(3) : '';
      if (bar.dataset.compact !== String(passed)) bar.dataset.compact = String(passed);
      if (bar.dataset.scrolled !== String(scrolled)) bar.dataset.scrolled = String(scrolled);
    };
    const onScroll = () => {
      if (!frame) frame = requestAnimationFrame(update);
    };
    update();
    scroller.addEventListener('scroll', onScroll, { passive: true });
    const ro = typeof ResizeObserver === 'function' ? new ResizeObserver(onScroll) : null;
    ro?.observe(scroller);
    return () => {
      scroller.removeEventListener('scroll', onScroll);
      ro?.disconnect();
      if (frame) cancelAnimationFrame(frame);
    };
  }, []);

  return (
    <>
      <header ref={barRef} className={styles.bar} data-compact="false" data-scrolled="false">
        <div className={styles.row}>
          <div className={styles.leading}>{leading}</div>
          <span className={styles.compact} aria-hidden="true">
            {title}
          </span>
          <div className={styles.trailing}>{trailing}</div>
        </div>
      </header>
      <div className={styles.head}>
        <h1 ref={titleRef} className={styles.large} onClick={onTitleTap}>
          {title}
        </h1>
        {children}
      </div>
    </>
  );
}
