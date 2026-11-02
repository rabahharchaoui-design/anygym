import { Sheet } from '../../ui/Sheet';
import { CheckIcon } from '../../ui/icons';
import { InfoButton } from '../../components/info/InfoButton';
import { SET_TYPES, SET_TYPE_INFO, SET_TYPE_WORDS, type SetType } from '../../lib/setTable';
import styles from './SetTypeSheet.module.css';

type Props = {
  open: boolean;
  onClose: () => void;
  /** "Set 2" */
  title: string;
  value: SetType;
  onPick: (t: SetType) => void;
  /** PLAN 2.2d: the row's menu also removes it (long press, or a tap on the set number). */
  onRemove?: () => void;
};

/**
 * Tap a set number (SPEC 21.1, in plain words): a small sheet with the four set types, one line
 * each and an ⓘ for more. The current one carries the lime check. One tap picks and closes.
 */
export function SetTypeSheet({ open, onClose, title, value, onPick, onRemove }: Props) {
  return (
    <Sheet open={open} onClose={onClose} label="Set type">
      <div className={styles.body}>
        {/* Named after the set (critic P1): its type is one group, Remove set waits at the bottom. */}
        <h2 className={styles.title}>{title}</h2>
        <p className={styles.sub} id="set-type-group">
          Set type
        </p>
        <div className={styles.list} role="radiogroup" aria-labelledby="set-type-group">
          {SET_TYPES.map((t) => (
            <div key={t} className={styles.option} data-type={t}>
              <button
                type="button"
                role="radio"
                aria-checked={t === value}
                className={`${styles.choice} pressable`}
                onClick={() => onPick(t)}
                data-testid={`set-type-${t}`}
              >
                <span className={styles.label}>{SET_TYPE_WORDS[t]}</span>
                <span className={styles.line}>{SET_TYPE_INFO[t].line}</span>
                <span className={styles.check} aria-hidden="true">
                  {t === value ? <CheckIcon width={20} height={20} strokeWidth={3} /> : null}
                </span>
              </button>
              <span className={styles.info}>
                <InfoButton id={SET_TYPE_INFO[t].glossary} />
              </span>
            </div>
          ))}
        </div>
        {onRemove && (
          <button type="button" className={`${styles.remove} pressable`} onClick={onRemove} data-testid="remove-set">
            Remove set
          </button>
        )}
      </div>
    </Sheet>
  );
}
