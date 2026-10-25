// The history file picked in Settings, held in memory for the review screen (SPEC 9.3). Never
// stored: a reload drops it and the review screen goes back to Settings.
import type { ParsedImport } from '../../lib/import/anygymImportV1';
import type { ImportResult } from '../../db/importHistory';

let draft: ParsedImport | null = null;

export const importDraft = {
  get: (): ParsedImport | null => draft,
  set: (next: ParsedImport | null): void => {
    draft = next;
  },
};

/** What the review screen hands back to Settings for the "Imported N sets · Undo" toast. */
export type ImportDone = { importDone: ImportResult };

export const isImportDone = (state: unknown): state is ImportDone =>
  !!state && typeof state === 'object' && 'importDone' in state && !!(state as ImportDone).importDone;
