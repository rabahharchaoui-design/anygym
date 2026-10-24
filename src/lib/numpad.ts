// Number pad text editing for "Type it" (SPEC 5.2). Pure string rules, no weight math.

export type PadKey = '0' | '1' | '2' | '3' | '4' | '5' | '6' | '7' | '8' | '9' | '.' | 'del';

/** Max digits before and after the decimal point. 9999.99 is far past any real bar. */
const MAX_INT = 4;
const MAX_DEC = 2;

/** The typed text after one key press. Invalid presses leave the text unchanged. */
export function pressKey(text: string, key: PadKey): string {
  if (key === 'del') return text.slice(0, -1);
  const [int = '', dec] = text.split('.');
  if (key === '.') {
    if (dec !== undefined) return text;
    return (int || '0') + '.';
  }
  if (dec !== undefined) return dec.length >= MAX_DEC ? text : text + key;
  if (int === '0') return key; // no leading zeros
  return int.length >= MAX_INT ? text : text + key;
}

/** The typed number, or null when nothing usable is typed yet. */
export function parseTyped(text: string): number | null {
  if (!/\d/.test(text)) return null;
  const n = Number(text.endsWith('.') ? text.slice(0, -1) : text);
  return Number.isFinite(n) && n > 0 ? n : null;
}
