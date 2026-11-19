import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

// PLAN M1 (SPEC 23.2, Monolith style sheet): the button's look is read from its CSS, so a later edit
// cannot quietly bring back a pill, a fill, a glow or a raw value.
const css = readFileSync(join(__dirname, '../Button.module.css'), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
const rule = (selector: string) => {
  const at = css.indexOf(`${selector} {`);
  expect(at, selector).toBeGreaterThan(-1);
  return css.slice(at, css.indexOf('}', at));
};

describe('Button look (M1)', () => {
  it('no fill, no shadow, no blur, no gradient, square', () => {
    expect(css).not.toMatch(/box-shadow|backdrop-filter|gradient|radius-pill/);
    expect(rule('.button')).toMatch(/background: none/);
    expect(rule('.button')).toMatch(/border-radius: var\(--radius-none\)/);
  });
  it('primary: a 4 px accent bar, 8 px and accent text while pressed', () => {
    expect(rule(".button[data-variant='primary']")).toMatch(/--line: var\(--bar-primary\);\s*--line-color: var\(--accent\)/);
    expect(rule(".button[data-variant='primary']:active:not(:disabled)")).toMatch(/--line: var\(--bar-pressed\);\s*color: var\(--accent\)/);
  });
  it('secondary: a hairline at white 35%', () => {
    expect(rule(".button[data-variant='secondary']")).toMatch(/--line: var\(--line-hair\);\s*--line-color: var\(--line-secondary\)/);
  });
  it('disabled: dim text over a dim bar', () => {
    expect(rule('.button:disabled')).toMatch(/color: var\(--text-disabled\)/);
    expect(css).toMatch(/:disabled \{\s*--line-color: var\(--bar-disabled\)/);
  });
  it('every button is at least 44 pt, the big one 56 pt', () => {
    expect(rule('.button')).toMatch(/min-height: var\(--tap\);\s*min-width: var\(--tap-min\)/);
    expect(rule(".button[data-size='lg']")).toMatch(/min-height: var\(--tap-lg\)/);
  });
  it('no raw pixel sizes: every length comes from a token', () => {
    const raw = [...css.matchAll(/:\s*[^;]*?(?<![\w-])([1-9]\d*px)/g)].map((m) => m[0]);
    expect(raw).toEqual([]);
  });
});
