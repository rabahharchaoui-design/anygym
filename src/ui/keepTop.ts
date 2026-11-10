// PLAN 3.5h: every screen is a fixed frame with its own scroller, so the document itself never
// scrolls. iOS still scrolls it to bring a focused field above the keyboard, and can leave it
// scrolled once the keyboard is gone, which lifts the whole frame (the workout header with the
// timer and Finish) under the status bar and the Dynamic Island. Once nothing is being typed in,
// the document goes back to the top.

const editing = (doc: Document) => {
  const el = doc.activeElement as HTMLElement | null;
  if (!el) return false;
  return el.isContentEditable || el.tagName === 'TEXTAREA' || el.tagName === 'SELECT' || (el.tagName === 'INPUT' && !['button', 'checkbox', 'radio', 'range', 'submit', 'reset', 'file'].includes((el as HTMLInputElement).type));
};

export function installKeepTop(win: Window = window): () => void {
  const doc = win.document;
  let frame = 0;
  const check = () => {
    cancelAnimationFrame(frame);
    // After the focus moves (one field to the next keeps the keyboard up).
    frame = requestAnimationFrame(() => {
      if (editing(doc)) return;
      if (win.scrollY !== 0 || win.scrollX !== 0) win.scrollTo(0, 0);
    });
  };
  doc.addEventListener('focusout', check);
  win.visualViewport?.addEventListener('resize', check);
  return () => {
    cancelAnimationFrame(frame);
    doc.removeEventListener('focusout', check);
    win.visualViewport?.removeEventListener('resize', check);
  };
}
