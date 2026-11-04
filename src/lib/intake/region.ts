// Units preselected from the phone's region (PLAN 3.3): never from Apple Health or anything else.
// navigator.language is like "en-US", "fr-FR", "zh-Hant-TW" or just "en". US: lb, mi, in;
// everywhere else (and no region): kg, km, cm. The user changes any of them with one tap.
import type { UnitsAnswer } from './funnel';

/** The region subtag ("US") of a BCP 47 language tag, or null when it has none. */
export function regionOf(locale: string | undefined | null): string | null {
  if (!locale) return null;
  const parts = locale.replace(/_/g, '-').split('-').slice(1);
  // The region is the 2 letter or 3 digit subtag after the language (and an optional script).
  const region = parts.find((p) => /^[A-Za-z]{2}$/.test(p) || /^\d{3}$/.test(p));
  return region ? region.toUpperCase() : null;
}

export function unitsForLocale(locale: string | undefined | null): Omit<UnitsAnswer, 'body'> {
  return regionOf(locale) === 'US' ? { weight: 'lb', distance: 'mi', measure: 'in' } : { weight: 'kg', distance: 'km', measure: 'cm' };
}

/** The phone's language tag (first preference). */
export function phoneLocale(): string | null {
  if (typeof navigator === 'undefined') return null;
  return navigator.languages?.[0] ?? navigator.language ?? null;
}
