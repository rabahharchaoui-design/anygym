import { useEffect } from 'react';
import { Chip } from '../../ui/Chip';
import { IconButton } from '../../ui/IconButton';
import { CheckIcon, ChevronLeft, FixIcon, MoreIcon, XIcon } from '../../ui/icons';
import { UndoChip } from './UndoChip';
import styles from './Fit.module.css';

// The one screen review's chrome (PLAN 3.5v), shared by the core review and New exercises: the top
// bar, the notice row (reason chips for 3 seconds, or a message) and the row of small icon buttons.

/** How long the reason chips stay after a left swipe. */
export const REASON_MS = 3000;

/** Back, the name and the counter on one line, and the menu. */
export function ReviewBar({ name, nameTestId, count, countTestId, backLabel, onBack, onMenu }: { name: string; nameTestId?: string; count: string; countTestId?: string; backLabel: string; onBack: () => void; onMenu: () => void }) {
  return (
    <header className={styles.bar}>
      <IconButton label={backLabel} onPress={onBack}>
        <ChevronLeft aria-hidden="true" />
      </IconButton>
      <h1 className={styles.name} data-testid={nameTestId}>
        {name}
      </h1>
      <span className={`${styles.count} num`} data-testid={countTestId}>
        {count}
      </span>
      <IconButton label="More" onPress={onMenu} testId="review-menu">
        <MoreIcon aria-hidden="true" />
      </IconButton>
    </header>
  );
}

export type Reasons<K extends string> = { options: readonly { key: K; label: string }[]; picked: K | null; token: unknown; onPick: (key: K) => void; onGone: () => void };

/** The row under the card: what was wrong (3 seconds, then gone), else the screen's message. */
export function ReviewNotice<K extends string>({ reasons, message, messageTestId }: { reasons: Reasons<K> | null; message: string; messageTestId: string }) {
  const token = reasons?.token;
  useEffect(() => {
    if (!reasons) return;
    const t = window.setTimeout(reasons.onGone, REASON_MS);
    return () => window.clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token, !reasons]);
  return (
    <div className={styles.notice}>
      {reasons && (
        <div className={styles.reasons} role="group" aria-label="What was wrong" data-testid="review-reasons">
          {reasons.options.map((o) => (
            <Chip key={o.key} small label={o.label} picked={reasons.picked === o.key} onPress={() => reasons.onPick(o.key)} testId={`reason-${o.key}`} />
          ))}
        </div>
      )}
      <p className={reasons ? styles.srOnly : styles.message} role="status" data-testid={messageTestId}>
        {message}
      </p>
    </div>
  );
}

type Undo = { words: string | null; token: unknown; onUndo: () => void; onGone: () => void };

/** The small icon buttons: they mirror the swipe (Wrong left, Approve right), Fix, and Undo between. */
export function ReviewActions({ undo, onWrong, onFix, onApprove, ids }: { undo: Undo; onWrong: () => void; onFix: () => void; onApprove: () => void; ids: { wrong: string; fix: string; approve: string } }) {
  return (
    <div className={styles.actions}>
      <IconButton label="Wrong" tone="red" onPress={onWrong} testId={ids.wrong}>
        <XIcon aria-hidden="true" />
      </IconButton>
      <IconButton label="Fix" onPress={onFix} testId={ids.fix}>
        <FixIcon aria-hidden="true" />
      </IconButton>
      <UndoChip {...undo} />
      <IconButton label="Approve" tone="accent" onPress={onApprove} testId={ids.approve}>
        <CheckIcon aria-hidden="true" />
      </IconButton>
    </div>
  );
}
