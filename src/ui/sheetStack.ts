// Open sheets, bottom to top (SPEC 13.3 accessibility). Only the top sheet is live: everything
// else on the page (the app, lower sheets, toasts) is inert, so taps, Tab and screen readers stay
// inside it, and Escape closes only it.

const stack: HTMLElement[] = [];
/** Elements this module made inert, so it never touches inert set by anyone else. */
const ours = new Set<Element>();

function sync(): void {
  const top = stack[stack.length - 1];
  // iOS card stack (SPEC 23.1): the app behind scales back while any sheet is open, and every
  // sheet under the top one steps back too (styles in Sheet.module.css).
  const html = document.documentElement;
  if (stack.length) html.dataset.sheets = String(stack.length);
  else delete html.dataset.sheets;
  stack.forEach((root, i) => {
    if (i < stack.length - 1) root.dataset.under = 'true';
    else delete root.dataset.under;
  });
  const want = new Set<Element>();
  if (top) {
    for (const el of Array.from(document.body.children)) {
      if (el !== top && !el.contains(top) && !(el instanceof HTMLScriptElement)) want.add(el);
    }
  }
  for (const el of ours) {
    if (!want.has(el)) {
      el.removeAttribute('inert');
      ours.delete(el);
    }
  }
  for (const el of want) {
    if (!ours.has(el) && !el.hasAttribute('inert')) {
      el.setAttribute('inert', '');
      ours.add(el);
    }
  }
}

/** Registers an open sheet's root (a direct child of body). Returns the function that unregisters it. */
export function pushSheet(root: HTMLElement): () => void {
  stack.push(root);
  sync();
  return () => {
    const i = stack.lastIndexOf(root);
    if (i >= 0) stack.splice(i, 1);
    sync();
  };
}

export function isTopSheet(root: HTMLElement): boolean {
  return stack[stack.length - 1] === root;
}

/** Keyboard reachable controls inside `root`, in tab order. */
export function focusables(root: HTMLElement): HTMLElement[] {
  const sel = 'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';
  return Array.from(root.querySelectorAll<HTMLElement>(sel)).filter((el) => !el.closest('[inert]') && el.getClientRects().length > 0);
}
