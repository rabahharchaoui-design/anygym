// First use prompt copy and answers (SPEC 5.3). Pure: which question to ask for a piece of
// equipment, and which stored answer a choice becomes. No weight math.
import type { EquipmentWeight, Unit } from '../db/types';

export type PromptKind = 'smith' | 'plate_machine' | 'stack' | 'ez_curl' | 'trap';

export type Prompt = {
  title: string;
  /** Glossary id for the ⓘ next to the title (SPEC 13.7). */
  info: string;
  question: string;
  /** The one non number answer, e.g. "Plates only". */
  alternative?: { label: string; entry: EquipmentWeight };
  /** Quick picks (stack step). The number pad is behind "Other". */
  chips?: number[];
  /** Label of the save button for a typed number. */
  save: string;
};

const PLATES_ONLY: EquipmentWeight = { kind: 'plates_only', value: 0 };

export function promptFor(kind: PromptKind, unit: Unit): Prompt {
  switch (kind) {
    case 'smith':
      return {
        title: 'Smith machine bar',
        info: 'smith-machine',
        question: 'Enter the bar weight (usually on a sticker on the frame).',
        alternative: { label: 'Count plates only', entry: PLATES_ONLY },
        save: 'Save bar weight',
      };
    case 'plate_machine':
      return {
        title: 'Starting weight',
        info: 'plate-loaded-machine',
        question: 'Enter the listed starting resistance, or count plates only.',
        alternative: { label: 'Plates only', entry: PLATES_ONLY },
        save: 'Save starting weight',
      };
    case 'stack':
      return {
        title: 'Weight steps',
        info: 'weight-stack-machine',
        question: `Do the plates on this machine go up by ${unit === 'lb' ? '5, 10' : '2.5, 5'}, or other?`,
        chips: unit === 'lb' ? [5, 10] : [2.5, 5],
        save: 'Save step',
      };
    case 'ez_curl':
      return { title: 'EZ curl bar', info: 'ez-curl-bar', question: 'Enter the bar weight.', save: 'Save bar weight' };
    case 'trap':
      return { title: 'Trap bar', info: 'trap-bar', question: 'Enter the bar weight.', save: 'Save bar weight' };
  }
}

/** Stored answer for a typed or picked number. */
export function entryFor(kind: PromptKind, value: number): EquipmentWeight {
  switch (kind) {
    case 'plate_machine':
      return { kind: 'starting_resistance', value };
    case 'stack':
      return { kind: 'stack_step', value };
    case 'smith':
    case 'ez_curl':
    case 'trap':
      return { kind: 'bar_weight', value };
  }
}
