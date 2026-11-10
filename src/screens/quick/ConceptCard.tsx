// One idea card on Quick workout (PLAN 3.5b): the style chip, 3 effort dots, the title, the why line,
// the counts, a short card's reason, the gear in words with small drawings, and the mini muscle map.
// Moved out of QuickScreen as it was (PLAN 3.5g, code organization).
import { Fragment, useMemo } from 'react';
import { workoutMuscles } from '../../data/quick';
import { cardKey, gearWords, metaLine, shortLine, type Concept } from '../../lib/quick';
import { EQUIPMENT_LABEL } from '../../lib/intake/options';
import { MiniMusclePair } from '../../components/muscles/MuscleMap';
import { EquipmentArt } from '../intake/EquipmentArt';
import styles from './ConceptCard.module.css';

/** The meta line's parts as they may break: the last two ("2 pairs · ~28 min") are one part. */
function metaParts(line: string): string[] {
  const parts = line.split(' · ');
  return parts.length > 2 ? [...parts.slice(0, -2), parts.slice(-2).join(' · ')] : parts;
}

/** At most this many gear drawings on a card; more say "+N". */
const GEAR_MAX = 4;

export function ConceptCard({ concept, onPick, entering, flash, label, reduced }: { concept: Concept; onPick: () => void; entering: boolean; flash: boolean; label: string; reduced: boolean }) {
  const muscles = useMemo(() => workoutMuscles(concept.items.map((it) => it.id)), [concept]);
  const gear = concept.gear.slice(0, GEAR_MAX);
  const allGear = concept.gear.map((g) => EQUIPMENT_LABEL[g].toLowerCase()).join(', ');
  const gearLine = gearWords(concept.gear);
  return (
    <button
      type="button"
      className={`${styles.concept} pressable`}
      onClick={onPick}
      data-testid={`concept-${concept.id}`}
      data-concept={concept.id}
      data-key={cardKey(concept)}
      data-entering={entering || undefined}
      data-flash={flash || undefined}
      data-reduced={reduced || undefined}
    >
      <span className={styles.conceptText}>
        <span className={styles.conceptTop}>
          <span className={styles.styleChip} data-testid="style-chip" data-kind={concept.chip}>
            {concept.chip}
          </span>
          <span className={styles.effort} role="img" aria-label={`Effort ${concept.effort} of 3`} data-testid="effort" data-level={concept.effort}>
            {[1, 2, 3].map((n) => (
              <span key={n} className={styles.dot} data-on={n <= concept.effort || undefined} />
            ))}
          </span>
        </span>
        <span className={styles.conceptTitle} data-testid="concept-title">{label}</span>
        <span className={styles.conceptLine} data-testid="concept-why">
          {concept.line}
        </span>
        <span className={`${styles.conceptMeta} num`} data-testid="concept-meta">
          {/* Each part stays on one line ("~28 min" never splits); the line breaks between parts. */}
          {/* 3.5b round 4 (P13): "· ~28 min" stays together; the line only breaks before a dot. */}
          {/* 3.5d (11): a break never starts a line with a dot: each part carries its own dot after it, and
              the last two ("2 pairs · ~28 min") stay together. */}
          {metaParts(metaLine(concept.items, concept.minutes)).map((part, i, all) => (
            <Fragment key={i}>
              {i > 0 ? ' ' : ''}
              <span className={styles.metaPart}>{part}{i < all.length - 1 ? ' ·' : ''}</span>
            </Fragment>
          ))}
        </span>
        {shortLine(concept) && (
          <span className={styles.conceptShort} data-testid="concept-short">
            {shortLine(concept)}
          </span>
        )}
        {/* 3.5b round 4 (P14): the gear in words ("Dumbbells, bench +2"), small drawings beside it. */}
        <span className={styles.gear} data-testid="concept-gear" aria-label={allGear ? `Uses ${allGear}` : 'No equipment'}>
          {gear.slice(0, 2).map((g) => (
            <EquipmentArt key={g} id={g} className={styles.gearIcon} />
          ))}
          <span className={styles.gearWords} aria-hidden="true">
            {gearLine}
          </span>
        </span>
      </span>
      <MiniMusclePair data={muscles} className={styles.conceptMap} />
    </button>
  );
}
