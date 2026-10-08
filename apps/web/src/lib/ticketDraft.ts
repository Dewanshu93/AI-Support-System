// Ticket draft review (playbook section 10, contract flows 4 and 5): the
// employee edits the draft's fields, confirms or cancels, and answers the
// duplicate prompt. Pure state and helpers, unit-tested; TicketDraftCard renders it.
import {
  type DuplicateCandidate,
  DuplicateCandidateSchema,
  EMAIL_LIMITS,
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

/** The escalation email as shown in the form (UC-07). */
export interface EmailValues {
  subject: string;
  body: string;
}

export interface DraftState {
  phase: DraftPhase;
  /** Field values as shown in the form ("unknown" shows as empty). */
  values: Record<string, string>;
  /** The email as shown in the form; null when the draft has no email. */
  email: EmailValues | null;
  duplicate: DuplicateCandidate['existing'] | null;
  error: string | null;
}

/** The email as the assistant drafted it (also used by "Reset to drafted text"). */
export const draftedEmail = (draft: TicketDraft): EmailValues | null =>
  draft.email ? { subject: draft.email.subject, body: draft.email.body } : null;

export function initialDraftState(draft: TicketDraft): DraftState {
  const values: Record<string, string> = {};
  for (const [key, value] of Object.entries(draft.fields))
    values[key] = value === UNKNOWN ? '' : value;
  return { phase: 'editing', values, email: draftedEmail(draft), duplicate: null, error: null };
}

export type DraftAction =
  | { type: 'edit'; key: string; value: string }
  /** The subject stays one line (newlines become spaces); both are cut to the limits. */
  | { type: 'emailEdit'; field: keyof EmailValues; value: string }
  /** Back to the text the assistant drafted. */
  | { type: 'emailReset'; email: EmailValues }
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
    case 'emailEdit': {
      if (!state.email || state.phase === 'submitting' || state.phase === 'cancelling') {
        return state;
      }
      const value =
        action.field === 'subject'
          ? action.value.replace(/[\r\n]+/g, ' ').slice(0, EMAIL_LIMITS.subject)
          : action.value.slice(0, EMAIL_LIMITS.body);
      return { ...state, email: { ...state.email, [action.field]: value } };
    }
    case 'emailReset':
      if (!state.email || state.phase === 'submitting' || state.phase === 'cancelling') {
        return state;
      }
      return { ...state, email: { ...action.email } };
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

/**
 * The confirm request. When the draft has an email, the on-screen text is
 * always sent (trimmed), so what is stored is exactly what the employee saw.
 */
export function confirmBody(
  draft: TicketDraft,
  values: Record<string, string>,
  duplicateDecision?: 'new' | 'same',
  email?: EmailValues | null,
): TicketDraftConfirmRequest {
  return {
    edits: editsFrom(draft, values),
    ...(duplicateDecision && { duplicateDecision }),
    ...(draft.email &&
      email && { email: { subject: email.subject.trim(), body: email.body.trim() } }),
  };
}

/** Which parts of the email the employee changed from the drafted text. */
export function emailEdited(
  draft: TicketDraft,
  email: EmailValues | null,
): { subject: boolean; body: boolean } {
  if (!draft.email || !email) return { subject: false, body: false };
  return {
    subject: email.subject.trim() !== draft.email.subject.trim(),
    body: email.body.trim() !== draft.email.body.trim(),
  };
}

/** Reasons the email cannot be sent yet (empty: it can). */
export function emailProblems(email: EmailValues | null): string[] {
  if (!email) return [];
  return [
    ...(email.subject.trim() ? [] : ['Add a subject to the email.']),
    ...(email.body.trim() ? [] : ['Add a message to the email.']),
  ];
}

/** A field was filled by code from the employee's own records (UC-07). */
export function isRecordFilled(draft: TicketDraft, values: Record<string, string>, key: string) {
  return (draft.recordFilledFields ?? []).includes(key) && !(key in editsFrom(draft, values));
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
