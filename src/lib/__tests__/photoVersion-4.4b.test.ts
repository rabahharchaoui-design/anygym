import { describe, expect, it } from 'vitest';
import { PHOTO_URL_PATTERN, versionedAsset } from '../photoVersion';
import { assetUrl } from '../../data/exerciseInfo';

describe('photo URLs carry a version (PLAN 4.4b 12)', () => {
  it('a new version is a new URL, still kept by the service worker rule', () => {
    const a = versionedAsset('ex/Ab_Roller/0.webp', 'a1b2c3d4e5');
    const b = versionedAsset('ex/Ab_Roller/0.webp', 'f6a7b8c9d0');
    expect(a).not.toBe(b);
    for (const u of [a, b, 'ex/Ab_Roller/1.jpg']) expect(PHOTO_URL_PATTERN.test(`/anygym/${u}`)).toBe(true);
    expect(PHOTO_URL_PATTERN.test('/anygym/ex/Ab_Roller/0.webp?x=1')).toBe(false);
  });
  it('only exercise photos; none without a version', () => {
    expect(versionedAsset('exc/x/0.webp', 'v1')).toBe('exc/x/0.webp');
    expect(versionedAsset('ex/x/0.webp', '')).toBe('ex/x/0.webp');
  });
  it('the app builds its photo URLs through it (one shared fallback version in unit tests)', () => {
    expect(assetUrl('ex/Ab_Roller/0.webp')).toMatch(/ex\/Ab_Roller\/0\.webp\?v=[0-9a-z]+$/);
  });
});
