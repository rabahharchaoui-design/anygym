import { describe, expect, it } from 'vitest';
import { parseTyped, pressKey, type PadKey } from '../numpad';

const type = (keys: string) => [...keys].reduce((t, k) => pressKey(t, (k === '<' ? 'del' : k) as PadKey), '');

describe('pressKey', () => {
  it('types digits and one decimal point', () => {
    expect(type('185')).toBe('185');
    expect(type('102.5')).toBe('102.5');
    expect(type('1.2.5')).toBe('1.25');
  });
  it('starts a bare decimal with 0 and drops leading zeros', () => {
    expect(type('.5')).toBe('0.5');
    expect(type('05')).toBe('5');
    expect(type('0.')).toBe('0.');
  });
  it('limits to 4 digits and 2 decimals', () => {
    expect(type('123456')).toBe('1234');
    expect(type('1.2345')).toBe('1.23');
  });
  it('deletes the last character', () => {
    expect(type('185<')).toBe('18');
    expect(type('<')).toBe('');
  });
});

describe('parseTyped', () => {
  it('parses complete and trailing dot input', () => {
    expect(parseTyped('315')).toBe(315);
    expect(parseTyped('102.')).toBe(102);
    expect(parseTyped('102.5')).toBe(102.5);
  });
  it('returns null for nothing usable', () => {
    expect(parseTyped('')).toBeNull();
    expect(parseTyped('.')).toBeNull();
    expect(parseTyped('0')).toBeNull();
  });
});
