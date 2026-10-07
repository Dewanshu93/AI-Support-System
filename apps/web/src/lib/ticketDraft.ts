// Ticket draft review (playbook section 10, contract flows 4 and 5): the
// employee edits the draft's fields, confirms or cancels, and answers the
// duplicate prompt. Pure state and helpers, unit-tested; TicketDraftCard renders it.
import {
  type DuplicateCandidate,
  DuplicateCandidateSchema,
  type TicketDraft,
  type TicketDraftConfirmRequest,
} from '@sd/shared';

/** The value the slot filler uses for information it could not find. */
export const UNKNOWN = 'unknown';
export const MAX_FIELD_LENGTH = 500;

/** "device_model" → "Device model". */
export function fieldLabel(key: string): string {
  const words = key.replace(/[_-]+/g, ' ').trim();
  return words.charAt(0).toUpperCase() + words.slice(1);
}

export type DraftPhase = 'editing' | 'submitting' | 'duplicate' | 'cancelling' | 'error';

export interface DraftState {
  phase: DraftPhase;
  /** Field values as shown in the form ("unknown" shows as empty). */
  values: Record<string, string>;
  duplicate: DuplicateCandidate['existing'] | null;
  error: string | null;
}

export function initialDraftState(draft: TicketDraft): DraftState {
  const values: Record<string, string> = {};
  for (const [key, value] of Object.entries(draft.fields))
    values[key] = value === UNKNOWN ? '' : value;
  return { phase: 'editing', values, duplicate: null, error: null };
}

export type DraftAction =
  | { type: 'edit'; key: string; value: string }
  | { type: 'submit' }
  | { type: 'cancel' }
  | { type: 'duplicate'; existing: DuplicateCandidate['existing'] }
  | { type: 'failed'; message: string }
  /** Leave the duplicate prompt without choosing (back to the form). */
  | { type: 'back' };

export function draftReducer(state: DraftState, action: DraftAction): DraftState {
  switch (action.type) {
    case 'edit':
      if (state.phase === 'submitting' || state.phase === 'cancelling') return state;
      return {
        ...state,
        values: { ...state.values, [action.key]: action.value.slice(0, MAX_FIELD_LENGTH) },
      };
    case 'submit':
      return { ...state, phase: 'submitting', error: null };
    case 'cancel':
      return { ...state, phase: 'cancelling', error: null };
    case 'duplicate':
      return { ...state, phase: 'duplicate', duplicate: action.existing, error: null };
    case 'failed':
      return { ...state, phase: 'error', error: action.message };
    case 'back':
      return { ...state, phase: 'editing', duplicate: null };
  }
}

/** Only the fields the employee changed (trimmed); untouched AI values are not sent. */
export function editsFrom(
  draft: TicketDraft,
  values: Record<string, string>,
): Record<string, string> {
  const edits: Record<string, string> = {};
  for (const [key, original] of Object.entries(draft.fields)) {
    const value = (values[key] ?? '').trim();
    const before = original === UNKNOWN ? '' : original.trim();
    if (value !== before) edits[key] = value === '' ? UNKNOWN : value;
  }
  return edits;
}

export function confirmBody(
  draft: TicketDraft,
  values: Record<string, string>,
  duplicateDecision?: 'new' | 'same',
): TicketDraftConfirmRequest {
  return { edits: editsFrom(draft, values), ...(duplicateDecision && { duplicateDecision }) };
}

/** Required fields that are still empty in the form. */
export function missingRequired(draft: TicketDraft, values: Record<string, string>): string[] {
  return draft.requiredMissing.filter((key) => !(values[key] ?? '').trim());
}

/** A field was filled by the AI and not changed by the employee. */
export function isAiFilled(draft: TicketDraft, values: Record<string, string>, key: string) {
  return draft.aiFilledFields.includes(key) && !(key in editsFrom(draft, values));
}

/** The existing ticket from a 409 DUPLICATE_CANDIDATE error's details, if valid. */
export function duplicateFrom(details: unknown): DuplicateCandidate['existing'] | null {
  const parsed = DuplicateCandidateSchema.safeParse(details);
  return parsed.success ? parsed.data.existing : null;
}
