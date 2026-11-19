// PLAN D0, SPEC 9.4: applies G's hand review of the catalog demos (an anygym-review-v1 file exported
// from #/review) to the photo gate. G's verdict is the last word on every id it names: approved shows
// the demo, every other verdict hides it (no bad data: the honest empty state with the text cues).
// Ids the file does not name keep the earlier rule. Only the demo gate changes: muscles, cues and the
// catalog itself are never touched. Pure, so the app and the tests share one definition.
import type { MapEntry } from './catalog';
import { REVIEW_FORMAT, type Verdict } from './review';

type ShownKind = Exclude<MapEntry['match'], 'none'>;

export interface DemoReview {
  catalogSha: string;
  /** Catalog id to G's verdict and note. */
  verdicts: ReadonlyMap<string, { verdict: Verdict; note?: string }>;
}

export class DemoReviewError extends Error {
  override name = 'DemoReviewError';
}

const VERDICTS: readonly Verdict[] = ['approved', 'wrong-demo', 'wrong-muscles', 'fix-cues'];

/**
 * Reads a review file and refuses one that does not belong to this catalog: another format, another
 * catalog sha (the photos G judged may not be the ones shipped), an id not in the catalog, or an
 * unknown verdict. Throws a DemoReviewError with a plain message.
 */
export function parseDemoReview(raw: unknown, catalogSha: string, catalogIds: ReadonlySet<string>): DemoReview {
  const file = raw as { format?: unknown; catalogSha?: unknown; decisions?: unknown } | null;
  if (!file || typeof file !== 'object') throw new DemoReviewError('Demo review refused: the file is not a JSON object.');
  if (file.format !== REVIEW_FORMAT) throw new DemoReviewError(`Demo review refused: format is ${String(file.format)}, expected ${REVIEW_FORMAT}.`);
  if (file.catalogSha !== catalogSha) {
    throw new DemoReviewError(
      `Demo review refused: it was made for catalog ${String(file.catalogSha)} but data/catalog.json is ${catalogSha}. Review the demos again in #/review on this catalog and export a new file.`,
    );
  }
  if (!file.decisions || typeof file.decisions !== 'object') throw new DemoReviewError('Demo review refused: no decisions.');
  const verdicts = new Map<string, { verdict: Verdict; note?: string }>();
  for (const [id, d] of Object.entries(file.decisions as Record<string, { verdict?: unknown; note?: unknown }>)) {
    if (!catalogIds.has(id)) throw new DemoReviewError(`Demo review refused: ${id} is not in the catalog.`);
    if (!VERDICTS.includes(d?.verdict as Verdict)) throw new DemoReviewError(`Demo review refused: ${id} has an unknown verdict ${String(d?.verdict)}.`);
    const note = typeof d.note === 'string' && d.note.trim() ? d.note.trim() : undefined;
    verdicts.set(id, note ? { verdict: d.verdict as Verdict, note } : { verdict: d.verdict as Verdict });
  }
  return { catalogSha, verdicts };
}

/**
 * What the app ships (src/data/demoHidden.json, written by scripts/demo-review.ts): only the catalog
 * sha and the ids G hid, sorted. No notes, no times. Refuses a review that does not cover every
 * catalog id, since every id not listed is then shown as approved.
 */
export interface HiddenList {
  catalogSha: string;
  hidden: string[];
}
export function hiddenList(review: DemoReview, catalogIds: ReadonlySet<string>): HiddenList {
  const missing = [...catalogIds].filter((id) => !review.verdicts.has(id));
  if (missing.length) throw new DemoReviewError(`Demo review refused: ${missing.length} catalog exercises are not reviewed (${missing.slice(0, 3).join(', ')}).`);
  const hidden = [...review.verdicts].filter(([, d]) => d.verdict !== 'approved').map(([id]) => id);
  return { catalogSha: review.catalogSha, hidden: hidden.sort() };
}

/**
 * The sure demo ids after G's review (the shipped hidden list): a hidden id is never shown, every
 * other catalog id is (keeping an earlier kind, else exact). A list made for another catalog sha is
 * refused. Returns a new map; running it again on its own result changes nothing.
 */
export function applyHiddenList(eligible: ReadonlyMap<string, ShownKind>, list: HiddenList, catalogSha: string, catalogIds: Iterable<string>): Map<string, ShownKind> {
  if (list.catalogSha !== catalogSha) {
    throw new DemoReviewError(`Demo review refused: it was made for catalog ${list.catalogSha} but data/catalog.json is ${catalogSha}. Run npm run demo-review on a review of this catalog.`);
  }
  const hidden = new Set(list.hidden);
  const out = new Map(eligible);
  for (const id of catalogIds) {
    if (hidden.has(id)) out.delete(id);
    else out.set(id, eligible.get(id) ?? 'exact');
  }
  return out;
}
