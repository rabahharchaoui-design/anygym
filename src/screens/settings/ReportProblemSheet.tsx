import { useEffect, useId, useRef, useState } from 'react';
import { Sheet } from '../../ui/Sheet';
import { Button } from '../../ui/Button';
import { CheckIcon, ImagePlusIcon, XIcon } from '../../ui/icons';
import { buildFeedback, MESSAGE_MAX, type GymFacts } from '../../lib/reporting/feedback';
import { prepareScreenshot, type Screenshot } from '../../lib/reporting/screenshots';
import { transport, type SendResult } from '../../lib/reporting/transport';
import styles from './ReportProblem.module.css';

type Props = { open: boolean; onClose: () => void; facts: GymFacts };

/** Exactly what a report carries (SPEC 24), shown under Send. */
export const DISCLOSURE =
  'Sends what you write, your screenshot if you add one, the app version, the screen you were on, your phone model, iOS version and screen size, lb or kg, your gym type and the last 20 app errors. Never your workouts, names or anything personal.';

export const SENT_TEXT = 'Sent. Thanks, this goes straight to the builder.';
export const QUEUED_TEXT = 'No signal right now. Your report is saved on this phone and sends by itself when you are back online.';

type Shot = { state: 'none' } | { state: 'working' } | { state: 'ready'; shot: Screenshot };

/**
 * Settings → Help → Report a problem (SPEC 24): one text box, an optional screenshot from Photos,
 * Send. Offline it waits in the phone's queue and sends itself later.
 */
export function ReportProblemSheet({ open, onClose, facts }: Props) {
  const [text, setText] = useState('');
  const [shot, setShot] = useState<Shot>({ state: 'none' });
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<SendResult | null>(null);
  const [error, setError] = useState('');
  const fileRef = useRef<HTMLInputElement>(null);
  const textRef = useRef<HTMLTextAreaElement>(null);
  // Generation of screenshot work: bumped on every open, close and unmount, so a picture still
  // being prepared for an earlier sheet never lands in this one (its preview URL is revoked).
  const pick = useRef(0);
  // Busy guard that holds within one task (three taps before React re-renders: one report).
  const sending = useRef(false);
  const fieldId = useId();

  useEffect(() => {
    pick.current++;
    return () => void pick.current++;
  }, [open]);

  // A fresh sheet every time it opens; the finished one keeps its words while it slides away.
  useEffect(() => {
    if (!open) return;
    sending.current = false;
    setText('');
    setShot({ state: 'none' });
    setBusy(false);
    setResult(null);
    setError('');
  }, [open]);

  const previewUrl = shot.state === 'ready' ? shot.shot.previewUrl : null;
  useEffect(() => () => void (previewUrl && URL.revokeObjectURL(previewUrl)), [previewUrl]);

  const choose = async (file: File | undefined) => {
    if (!file) return;
    const mine = ++pick.current;
    setError('');
    setShot({ state: 'working' });
    try {
      const ready = await prepareScreenshot(file);
      if (mine !== pick.current) return URL.revokeObjectURL(ready.previewUrl);
      setShot({ state: 'ready', shot: ready });
    } catch {
      if (mine !== pick.current) return;
      setShot({ state: 'none' });
      setError('Could not use that picture. Try another one.');
    }
  };

  const remove = () => {
    pick.current++;
    setShot({ state: 'none' });
  };

  const send = async () => {
    if (sending.current || shot.state === 'working') return;
    if (!text.trim()) {
      setError('Write what went wrong first.');
      textRef.current?.focus();
      return;
    }
    sending.current = true;
    setBusy(true);
    setError('');
    const payload = buildFeedback(text, facts, shot.state === 'ready' ? shot.shot.base64 : undefined);
    const r = await transport.sendFeedback(payload);
    setBusy(false);
    if (r === 'error') {
      sending.current = false;
      setError('Could not send that. Try again in a moment.');
    } else setResult(r);
  };

  return (
    <Sheet open={open} onClose={onClose} label="Report a problem" scroll>
      {result ? (
        <div className={styles.done} data-testid="report-done">
          <span className={styles.doneIcon} aria-hidden="true">
            <CheckIcon />
          </span>
          <p className={styles.doneText} role="status">
            {result === 'sent' ? SENT_TEXT : QUEUED_TEXT}
          </p>
          <Button onClick={onClose}>Done</Button>
        </div>
      ) : (
        <div className={styles.body}>
          <h2 className={styles.title}>Report a problem</h2>
          <label className={styles.label} htmlFor={fieldId}>
            What went wrong?
          </label>
          <textarea
            id={fieldId}
            ref={textRef}
            className={styles.text}
            value={text}
            maxLength={MESSAGE_MAX}
            rows={5}
            placeholder="For example: the timer stopped when I locked my phone."
            enterKeyHint="send"
            onChange={(e) => {
              setText(e.target.value);
              if (error) setError('');
            }}
            data-testid="report-text"
          />
          {shot.state === 'none' ? (
            <button type="button" className={`${styles.addShot} pressable`} onClick={() => fileRef.current?.click()}>
              <ImagePlusIcon aria-hidden="true" className={styles.addIcon} />
              Add a screenshot
            </button>
          ) : (
            <div className={styles.shotRow}>
              {shot.state === 'working' ? (
                <span className={styles.shotSkeleton} aria-label="Preparing the screenshot" role="img" />
              ) : (
                <img className={styles.shot} src={shot.shot.previewUrl} alt="Your screenshot" data-testid="report-shot" />
              )}
              <button type="button" className={`${styles.removeShot} pressable`} onClick={remove} aria-label="Remove screenshot">
                <XIcon aria-hidden="true" className={styles.removeIcon} />
                Remove
              </button>
            </div>
          )}
          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            className={styles.file}
            tabIndex={-1}
            aria-hidden="true"
            data-testid="report-file"
            onChange={(e) => {
              const file = e.target.files?.[0];
              e.target.value = '';
              void choose(file);
            }}
          />
          <p className={styles.error} role="status" data-testid="report-error">
            {error}
          </p>
          <Button onClick={() => void send()} disabled={busy} aria-busy={busy || undefined} data-testid="report-send">
            {busy ? 'Sending…' : 'Send'}
          </Button>
          <p className={styles.disclosure} data-testid="report-disclosure">
            {DISCLOSURE}
          </p>
        </div>
      )}
    </Sheet>
  );
}
