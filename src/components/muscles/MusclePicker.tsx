import { REGION_NAMES, regionsIn, type BodyKind, type Region, type View } from '../../lib/bodyArt';
import type { MuscleMapData } from '../../lib/muscles';
import styles from './MuscleMap.module.css';

/**
 * Every region drawn in these views of this body, lit ones first (primary, then secondary), then
 * the unlit ones by name (PLAN 2.0j): the same set a finger can tap. Resting art (no region) is not
 * selectable, so it is never listed.
 */
export function selectableRegions(body: BodyKind, views: readonly View[], data: MuscleMapData): Region[] {
  const drawn = new Set<Region>();
  for (const v of views) for (const r of regionsIn(body, v)) drawn.add(r);
  const rank = (r: Region) => (data.shading[r] === 'primary' ? 0 : data.shading[r] ? 1 : 2);
  return [...drawn].sort((a, b) => rank(a) - rank(b) || REGION_NAMES[a].localeCompare(REGION_NAMES[b]));
}

/**
 * The drawing is tap only (and hidden from assistive tech in the compact pair), so every drawn muscle
 * is also a labelled native picker (SPEC 13.3): VoiceOver and keyboards reach the same pick, with the
 * same handler as a tap. Revealed on focus.
 */
export function MusclePicker({
  regions,
  picked,
  label,
  line,
  onPick,
}: {
  regions: readonly Region[];
  picked: Region | null;
  label: string;
  /** The option's words (the readout's own, e.g. "Chest · primary"). */
  line: (region: Region) => string;
  onPick: (region: Region | null) => void;
}) {
  if (!regions.length) return null;
  return (
    <select
      className={styles.a11yPick}
      aria-label={label}
      value={picked ?? ''}
      onChange={(e) => onPick((e.target.value || null) as Region | null)}
      data-testid="muscle-a11y-pick"
    >
      <option value="">No muscle picked</option>
      {regions.map((r) => (
        <option key={r} value={r}>
          {line(r)}
        </option>
      ))}
    </select>
  );
}
