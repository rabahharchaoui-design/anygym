import { expect, type Page } from '../fixtures';

// Split from tests/helpers/layout.ts (PLAN 3.5h); layout.ts re-exports it.

// ---------------------------------------------------------------- controls (SPEC 13.3)

/**
 * Runs in the page: every visible control (in the top sheet when one is open) has a non empty
 * accessible name, and every enabled one a reachable hit area of at least 48 × 48: scrolled into
 * view, its middle and the four edge midpoints of a 48 px square around it all hit the control
 * itself (its padding and pseudo elements count, a neighbour or an overlay does not). Scroll positions are put back.
 */
function auditControls([scopeSel]: [string | null]): string[] {
  const visible = (el: Element) => {
    for (let e: Element | null = el; e; e = e.parentElement) {
      const s = getComputedStyle(e);
      if (s.display === 'none' || s.visibility === 'hidden' || Number(s.opacity) === 0) return false;
    }
    return true;
  };
  const textOf = (el: Element): string => {
    let out = '';
    for (const n of el.childNodes) {
      if (n.nodeType === Node.TEXT_NODE) out += n.textContent ?? '';
      else if (n instanceof Element && n.getAttribute('aria-hidden') !== 'true') {
        out += n instanceof HTMLImageElement ? (n.alt ?? '') : n.getAttribute('aria-label') ?? textOf(n);
      }
    }
    return out;
  };
  const nameOf = (el: Element): string => {
    const by = el.getAttribute('aria-labelledby');
    if (by) {
      const t = by.split(/\s+/).map((id) => document.getElementById(id)?.textContent ?? '').join(' ').trim();
      if (t) return t;
    }
    const aria = el.getAttribute('aria-label')?.trim();
    if (aria) return aria;
    if (el instanceof HTMLInputElement || el instanceof HTMLSelectElement || el instanceof HTMLTextAreaElement) {
      const labels = [...(el.labels ?? [])].map((l) => l.textContent ?? '').join(' ').trim();
      if (labels) return labels;
      if ('placeholder' in el && el.placeholder) return el.placeholder;
    }
    const text = textOf(el).trim();
    if (text) return text;
    return el.getAttribute('title')?.trim() ?? '';
  };
  const dialogs = [...document.querySelectorAll('[role="dialog"]')].filter(visible);
  const root = scopeSel ? [...document.querySelectorAll(scopeSel)].pop() ?? document.body : dialogs.length ? dialogs[dialogs.length - 1]! : document.body;
  const controls = [
    ...root.querySelectorAll<HTMLElement>(
      'button, a[href], input:not([type="hidden"]), select, textarea, [role="button"], [role="link"], [role="radio"], [role="tab"], [role="slider"], [role="option"], [role="switch"], [role="checkbox"]',
    ),
  ].filter((el) => visible(el) && !el.closest('[inert]') && el.getBoundingClientRect().width > 0);
  const label = (el: Element) => `${el.tagName.toLowerCase()}${el.getAttribute('data-testid') ? `[${el.getAttribute('data-testid')}]` : ''}.${String(el.className).split(' ')[0]?.slice(0, 24)} "${(el.getAttribute('aria-label') ?? el.textContent ?? '').trim().slice(0, 30)}"`;
  const saved = new Map<HTMLElement, [number, number, string]>();
  const problems: string[] = [];
  try {
    for (const el of controls) {
      if (!nameOf(el)) problems.push(`${label(el)} has no accessible name`);
      if ((el as HTMLButtonElement).disabled || getComputedStyle(el).pointerEvents === 'none') continue;
      for (let p = el.parentElement; p; p = p.parentElement) {
        const s = getComputedStyle(p);
        if (/(auto|scroll)/.test(s.overflowY + s.overflowX) && !saved.has(p)) {
          saved.set(p, [p.scrollTop, p.scrollLeft, p.style.scrollBehavior]);
          p.style.scrollBehavior = 'auto';
        }
      }
      el.scrollIntoView({ block: 'center', inline: 'center', behavior: 'instant' as ScrollBehavior });
      const r = el.getBoundingClientRect();
      const cx = (r.left + r.right) / 2;
      const cy = (r.top + r.bottom) / 2;
      // The edges of a 48 px target around the middle (a 48 px round button reaches all four; its
      // rounded corners are not part of any shape's extent).
      const misses = [
        [cx, cy],
        [cx - 23.5, cy],
        [cx + 23.5, cy],
        [cx, cy - 23.5],
        [cx, cy + 23.5],
      ]
        // A layer that hands plain taps on to what is under it (the edge swipe strip) is looked through.
        .map(([x, y]) => document.elementsFromPoint(x!, y!).find((e) => !e.closest('[data-tap-through]')) ?? null)
        .filter((hit) => !hit || !(hit === el || el.contains(hit)));
      if (misses.length) {
        const hit = misses[0];
        const h = hit?.getBoundingClientRect();
        problems.push(
          `${label(el)} ${Math.round(r.width)}×${Math.round(r.height)} at ${Math.round(r.top)}..${Math.round(r.bottom)}: its hit area is smaller than 48 × 48 (${misses.length} of 5 probe points hit ${hit ? `${hit.tagName.toLowerCase()}.${String(hit.className).split(' ')[0]?.slice(0, 24)} ${Math.round(h!.top)}..${Math.round(h!.bottom)}` : 'nothing'})`,
        );
      }
    }
  } finally {
    for (const [sc, [top, left, behavior]] of saved) {
      sc.scrollTop = top;
      sc.scrollLeft = left;
      sc.style.scrollBehavior = behavior;
    }
  }
  return problems;
}

/**
 * 3.5w: the app behind a sheet comes forward again over 200 ms as the sheet closes, and a box
 * measured mid way is scaled. Waits until #root has no transition running before measuring.
 */
export async function rootAtRest(page: Page): Promise<void> {
  await page.waitForFunction(() => (document.getElementById('root')?.getAnimations().length ?? 0) === 0, null, { timeout: 5000 });
}

/** The control problems of the screen as it is now (see auditControls). */
export async function controlProblems(page: Page, scope?: string): Promise<string[]> {
  await rootAtRest(page);
  return page.evaluate(auditControls, [scope ?? null] as [string | null]);
}

/** SPEC 13.3 on this screen: every control is named and has a 48 × 48 hit area. */
export async function checkControls(page: Page, scope?: string) {
  // Staggered entrances wait still before they move: every control must hold its place for 600 ms.
  await page
    .waitForFunction(
      () =>
        new Promise<boolean>((resolve) => {
          const at = () => [...document.querySelectorAll('button, a[href], [role="radio"], [role="option"]')].map((e) => { const r = e.getBoundingClientRect(); return `${r.x},${r.y},${r.width},${r.height}`; }).join('|');
          const a = at();
          setTimeout(() => resolve(at() === a), 600);
        }),
      null,
      { timeout: 6000 },
    )
    .catch(() => {});
  expect(await controlProblems(page, scope), 'every control has an accessible name and a 48 × 48 hit area').toEqual([]);
}
