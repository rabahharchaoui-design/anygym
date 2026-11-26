// Shared by the personal name scans (PLAN 1.10f, SPEC 0.6; the art scan added Nov 26).
/**
 * The personal names found in `text`, after removing URLs on github.io / github.com and the
 * public report API host on workers.dev (SPEC 24), which carry the account name.
 */
export function personalNames(text: string): string[] {
  const clean = text.replace(/\S*github\.(io|com)\S*/gi, '').replace(/\S*\.workers\.dev\S*/gi, '');
  return [...clean.matchAll(/ohrabah|harchaoui|\brabah\b/gi)].map((m) => m[0]);
}
