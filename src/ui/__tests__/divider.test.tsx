import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { Divider } from '../Divider';

describe('Divider (PLAN M1, SPEC 10)', () => {
  it('is a hairline screen readers skip', () => {
    const html = renderToStaticMarkup(<Divider />);
    expect(html).toMatch(/^<hr class="[^"]*divider[^"]*" aria-hidden="true"\/>$/);
    expect(html).not.toContain('data-inset');
  });
  it('can sit inside the side margins and take a class', () => {
    const html = renderToStaticMarkup(<Divider inset className="x" />);
    expect(html).toContain('data-inset="true"');
    expect(html).toMatch(/class="[^"]*divider[^"]* x"/);
  });
  it('draws with the divider token, never a raw colour or width', () => {
    const css = readFileSync(join(__dirname, '../Divider.module.css'), 'utf8');
    expect(css).toMatch(/border-top: var\(--divider\)/);
    expect(css).not.toMatch(/#[0-9a-f]{3,8}|rgb|[1-9]px/i);
    const tokens = readFileSync(join(__dirname, '../../styles/tokens.css'), 'utf8');
    expect(tokens).toMatch(/--divider: var\(--line-hair\) solid var\(--hairline\)/);
    expect(tokens).toMatch(/--hairline: rgb\(255 255 255 \/ 0\.12\)/);
    expect(tokens).toMatch(/--line-hair: 1px/);
  });
});
