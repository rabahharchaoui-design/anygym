import { useState } from 'react';
import { glossaryEntry } from '../../data/glossary';
import { InfoSheet } from './InfoSheet';
import styles from './Info.module.css';

type Props = {
  /** Glossary id, e.g. 'smith-machine'. */
  id: string;
  className?: string;
};

/**
 * The small ⓘ next to an equipment name or gym term (SPEC 13.7): secondary colour, a 24 pt glyph
 * inside a 48 pt hit area. Opens the info sheet. Renders nothing for an unknown id.
 */
export function InfoButton({ id, className }: Props) {
  const [open, setOpen] = useState(false);
  const entry = glossaryEntry(id);
  if (!entry) return null;
  return (
    <>
      <button
        type="button"
        className={`${styles.button} pressable${className ? ` ${className}` : ''}`}
        aria-label={`What is ${entry.term}?`}
        aria-haspopup="dialog"
        data-info={id}
        onClick={(e) => {
          e.stopPropagation();
          setOpen(true);
        }}
      >
        <svg viewBox="0 0 24 24" width="24" height="24" aria-hidden="true" focusable="false">
          <circle cx="12" cy="12" r="9.25" fill="none" stroke="currentColor" strokeWidth="1.6" />
          <circle cx="12" cy="7.6" r="1.25" fill="currentColor" />
          <path d="M12 11v6" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" />
        </svg>
      </button>
      <InfoSheet entry={entry} open={open} onClose={() => setOpen(false)} />
    </>
  );
}
