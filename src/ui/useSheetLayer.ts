import { useEffect, useLayoutEffect, type RefObject } from 'react';
import { isTopSheet, pushSheet } from './sheetStack';
import { sheetHistory } from './sheetHistory';

/**
 * What every layer over the screen (a sheet, the full screen demo) does while it is present: it
 * registers as the top sheet, gets its own history entry (Back closes it, not the screen, SPEC
 * 13.4), moves focus in with `focusIn`, and gives focus back as soon as it starts closing. Escape
 * closes it only while it is the top one.
 */
export function useSheetLayer(present: boolean, rootRef: RefObject<HTMLElement | null>, closeRef: { readonly current: () => void }, focusIn: (root: HTMLElement) => void): void {
  useLayoutEffect(() => {
    if (!present) return;
    const root = rootRef.current!;
    const before = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const unregister = pushSheet(root);
    const release = sheetHistory().open(() => closeRef.current());
    focusIn(root);
    return () => {
      unregister();
      release();
      if (before?.isConnected && !before.closest('[inert]')) before.focus({ preventScroll: true });
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [present]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape' || !rootRef.current || !isTopSheet(rootRef.current)) return;
      e.stopPropagation();
      closeRef.current();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
}
