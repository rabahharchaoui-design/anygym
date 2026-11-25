import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter } from 'react-router-dom';
import { Odometer } from '../Odometer';
import { Button, buttonLook } from '../Button';
import { EmptyState } from '../EmptyState';
import { Ring } from '../Ring';
import { TopBar } from '../TopBar';
import { BackButton } from '../BackButton';

const text = (html: string) => html.replace(/<[^>]+>/g, '');

/** Text a screen reader gets: every text node outside aria-hidden subtrees (static markup walk). */
function accessibleText(html: string): string {
  let out = '';
  const hidden: number[] = [];
  let depth = 0;
  for (const tok of html.match(/<[^>]+>|[^<]+/g) ?? []) {
    if (tok.startsWith('</')) {
      if (hidden.length && hidden[hidden.length - 1] === depth) hidden.pop();
      depth--;
    } else if (tok.startsWith('<')) {
      depth++;
      if (tok.includes('aria-hidden="true"')) hidden.push(depth);
      if (tok.endsWith('/>')) {
        if (hidden.length && hidden[hidden.length - 1] === depth) hidden.pop();
        depth--;
      }
    } else if (!hidden.length) out += tok;
  }
  return out;
}

describe('Odometer (SPEC 23.3, 13.3)', () => {
  it('exposes the exact value once; the rolling faces are hidden and hold no text', () => {
    const html = renderToStaticMarkup(<Odometer value="3,885 lb" />);
    expect(accessibleText(html)).toBe('3,885 lb');
    expect(text(html)).toBe('3,885 lb');
    expect(html.match(/--d:/g)).toHaveLength(4);
    expect(html).toContain('--d:3');
    expect(html).toContain('--d:5');
    expect(html).toMatch(/aria-hidden="true"/);
  });
  it('works for plain numbers and clock values', () => {
    for (const v of [0, 7, 185, '1:30', '12,345']) {
      expect(accessibleText(renderToStaticMarkup(<Odometer value={v} />))).toBe(String(v));
    }
  });
  it('counts up from zero when asked: the faces start at 0, the text is already exact', () => {
    const html = renderToStaticMarkup(<Odometer value={42} countUp />);
    expect(accessibleText(html)).toBe('42');
    expect(html.match(/--d:0/g)).toHaveLength(2);
  });
});

describe('Button (SPEC 23.2)', () => {
  it('a disabled button explains why', () => {
    const html = renderToStaticMarkup(
      <Button disabled disabledReason="Set the starting weight first">
        Log set
      </Button>,
    );
    expect(html).toContain('disabled');
    expect(text(html)).toBe('Log setSet the starting weight first');
  });
  it('variants and sizes', () => {
    expect(renderToStaticMarkup(<Button>Start</Button>)).toMatch(/data-variant="primary".*data-size="lg".*data-block="true"/);
    expect(renderToStaticMarkup(<Button variant="quiet">Change day</Button>)).toMatch(/data-variant="quiet" data-size="md"/);
    expect(renderToStaticMarkup(<Button variant="destructive">Delete set</Button>)).not.toContain('role="note"');
  });
  it('Monolith defaults (M1): primary is the big full width action, secondary full width, quiet and destructive inline', () => {
    expect(buttonLook('primary')).toEqual({ size: 'lg', block: true });
    expect(buttonLook('secondary')).toEqual({ size: 'md', block: true });
    expect(buttonLook('quiet')).toEqual({ size: 'md', block: false });
    expect(buttonLook('destructive')).toEqual({ size: 'md', block: false });
    expect(buttonLook('secondary', 'lg', false)).toEqual({ size: 'lg', block: false });
    const html = renderToStaticMarkup(<Button variant="secondary" size="lg" block={false}>Share</Button>);
    expect(html).toMatch(/data-variant="secondary" data-size="lg"/);
    expect(html).not.toContain('data-block');
  });
  it('a disabled button without a reason adds no note; the reason is a note under it', () => {
    expect(renderToStaticMarkup(<Button disabled>Start</Button>)).not.toContain('role="note"');
    expect(renderToStaticMarkup(<Button disabled disabledReason="Pick a day first">Start</Button>)).toMatch(/<\/button><span[^>]*role="note">Pick a day first/);
    expect(renderToStaticMarkup(<Button disabledReason="Pick a day first">Start</Button>)).not.toContain('role="note"');
  });
});

describe('EmptyState', () => {
  it('has the words and one action as a primary button, no drawing (Monolith, PLAN M15)', () => {
    const html = renderToStaticMarkup(<EmptyState title="No workouts yet" next="Finish your first workout." action={{ label: 'Go to Today', onPress: () => {} }} />);
    expect(html).not.toContain('<svg');
    expect(html).toContain('data-variant="primary"');
    expect(text(html)).toBe('No workouts yetFinish your first workout.Go to Today');
  });
});

describe('Ring', () => {
  it('draws the fraction, and a full disc when done', () => {
    const half = renderToStaticMarkup(<Ring fraction={0.5} size={44} stroke={4} />);
    const c = 2 * Math.PI * 20;
    expect(half).toContain(`stroke-dashoffset="${c * 0.5}"`);
    expect(renderToStaticMarkup(<Ring fraction={1} full />)).toContain('data-full="true"');
    expect(renderToStaticMarkup(<Ring fraction={0} />)).not.toContain('stroke-dashoffset');
  });
});

describe('TopBar', () => {
  it('one h1 (the large title), the compact copy is hidden from screen readers, the bar is a header', () => {
    const html = renderToStaticMarkup(
      <MemoryRouter>
        <TopBar title="Settings" leading={<BackButton to="/" label="Back to Today" />} />
      </MemoryRouter>,
    );
    expect(html.match(/<h1/g)).toHaveLength(1);
    expect(html).toMatch(/<header[^>]*>/);
    expect(html).toMatch(/aria-hidden="true"[^>]*>Settings</);
    expect(html).toContain('aria-label="Back to Today"');
  });
});
