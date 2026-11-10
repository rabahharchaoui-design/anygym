import { useEffect, useState, type RefObject } from 'react';

/**
 * Whether the element is on screen (or within `margin` of it). Moving previews use it so only the
 * ones you can see animate (PLAN 3.5h). Without IntersectionObserver: always true.
 */
export function useInView(ref: RefObject<Element | null>, enabled = true, margin = '64px'): boolean {
  const [inView, setInView] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!enabled || !el) return;
    if (typeof IntersectionObserver === 'undefined') {
      setInView(true);
      return;
    }
    const io = new IntersectionObserver((entries) => setInView(entries.some((e) => e.isIntersecting)), { rootMargin: margin });
    io.observe(el);
    return () => io.disconnect();
  }, [ref, enabled, margin]);
  return inView;
}
