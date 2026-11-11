import type { Page } from '../fixtures';

/**
 * PLAN 3.5t: the colour a design token (src/styles/tokens.css) resolves to on this page, as the
 * computed "rgb(r, g, b)" a style check reads. Specs compare against the token, never a typed colour.
 */
export const tokenColor = (page: Page, token: string): Promise<string> =>
  page.evaluate((name) => {
    const probe = document.createElement('i');
    probe.style.color = `var(${name})`;
    document.body.appendChild(probe);
    const color = getComputedStyle(probe).color;
    probe.remove();
    return color;
  }, token);
