import { REGION_NAMES, regionsIn, type BodyKind, type Region, type View } from '../../lib/bodyArt';
import type { MuscleMapData } from '../../lib/muscles';
import { ChevronDown, ICON_STROKE } from '../../ui/icons';
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
 * The drawing is tap only (and hidden from assistive tech in the compact pair), and some muscles
 * (forearms, calves seen from the front) are far narrower than a finger. So every drawn muscle is
 * also offered by a visible "Pick a muscle" control (PLAN 2.0k, ui-2.2c #1; SPEC 13.3: a 48 pt
 * target): the phone's own picker opens with every muscle by name, and picking one does exactly
 * what a tap on it does. VoiceOver and keyboards reach the same control.
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
  /** The option's words (the readout's own, e.g. "Chest · main muscle"). */
  line: (region: Region) => string;
  onPick: (region: Region | null) => void;
}) {
  if (!regions.length) return null;
  return (
    <label className={`${styles.pickControl} pressable`} data-testid="muscle-pick-control">
      <span className={styles.pickControlText} aria-hidden="true">
        Pick a muscle
      </span>
      <ChevronDown className={styles.pickControlIcon} strokeWidth={ICON_STROKE} aria-hidden="true" />
      <select className={styles.pickSelect} aria-label={label} value={picked ?? ''} onChange={(e) => onPick((e.target.value || null) as Region | null)} data-testid="muscle-a11y-pick">
        <option value="">No muscle picked</option>
        {regions.map((r) => (
          <option key={r} value={r}>
            {line(r)}
          </option>
        ))}
      </select>
    </label>
  );
}
