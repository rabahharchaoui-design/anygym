import { useId, useState } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import { FADE, SHEET_SPRING } from '../../ui/motion';
import type { Tip, TipId } from '../../lib/coachTips';
import { CheckIcon, ChevronDown, CoachIcon } from '../../ui/icons';
import styles from './CoachTips.module.css';

type Props = {
  tips: readonly Tip[];
  applied: readonly TipId[];
  onApply: (id: TipId) => void;
  onUndo: (id: TipId) => void;
  onApplyAll: () => void;
  onHide: () => void;
};

/**
 * "Coach tips (N)" on a plan (SPEC 22): one quiet row, collapsed by default. Open, each tip says what
 * is off and why in one line each, with its own Apply; Apply all and "Hide tips for this plan" below.
 * Never inside a workout. Applying is undoable from the tip itself and from the toast.
 */
export function CoachTips({ tips, applied, onApply, onUndo, onApplyAll, onHide }: Props) {
  const [open, setOpen] = useState(false);
  const panel = useId();
  const reduce = useReducedMotion();
  if (!tips.length) return null;
  const left = tips.filter((t) => !applied.includes(t.id)).length;
  return (
    <section className={styles.coach} data-open={open || undefined} data-testid="coach-tips" aria-label="Coach tips">
      <button type="button" className={`${styles.toggle} pressable`} aria-expanded={open} aria-controls={panel} onClick={() => setOpen((o) => !o)} data-testid="coach-tips-toggle">
        <CoachIcon className={styles.icon} width={18} height={18} strokeWidth={2.2} aria-hidden="true" />
        <span className={styles.toggleText}>
          Coach tips <span className="num">({tips.length})</span>
        </span>
        {applied.length > 0 && <span className={`${styles.count} num`}>{applied.length} applied</span>}
        <ChevronDown className={styles.chevron} width={18} height={18} strokeWidth={2.4} aria-hidden="true" />
      </button>
      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            key="panel"
            className={styles.fold}
            id={panel}
            initial={reduce ? { opacity: 0 } : { height: 0, opacity: 0 }}
            animate={reduce ? { opacity: 1 } : { height: 'auto', opacity: 1 }}
            exit={reduce ? { opacity: 0 } : { height: 0, opacity: 0 }}
            transition={reduce ? FADE : SHEET_SPRING}
          >
            <ol className={styles.list}>
              {tips.map((t) => {
                const on = applied.includes(t.id);
                return (
                  <li key={t.id} className={styles.tip} data-applied={on || undefined} data-testid={`tip-${t.id}`}>
                    <p className={styles.title}>{t.title}</p>
                    <p className={styles.why}>{t.why}</p>
                    {t.detail && (
                      <ul className={styles.detail}>
                        {t.detail.map((d) => (
                          <li key={d}>{d}</li>
                        ))}
                      </ul>
                    )}
                    <div className={styles.actions}>
                      {on ? (
                        <>
                          <span className={styles.done}>
                            <CheckIcon width={16} height={16} strokeWidth={3} aria-hidden="true" />
                            Applied
                          </span>
                          <button type="button" className={`${styles.textButton} pressable`} onClick={() => onUndo(t.id)} aria-label={`Undo: ${t.title}`}>
                            Undo
                          </button>
                        </>
                      ) : (
                        <button type="button" className={`${styles.apply} pressable`} onClick={() => onApply(t.id)} aria-label={`Apply: ${t.title}`}>
                          Apply
                        </button>
                      )}
                    </div>
                  </li>
                );
              })}
            </ol>
            <div className={styles.footer}>
              {left > 1 && (
                <button type="button" className={`${styles.apply} pressable`} onClick={onApplyAll} data-testid="apply-all">
                  Apply all <span className="num">({left})</span>
                </button>
              )}
              <button type="button" className={`${styles.textButton} pressable`} onClick={onHide}>
                Hide tips for this plan
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </section>
  );
}
