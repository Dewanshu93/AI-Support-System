import { EMAIL_LIMITS } from '@sd/shared';
import { DRAFT, EMAIL_DRAFT } from '@/test/fixtures';
import {
  confirmBody,
  draftedEmail,
  draftReducer,
  duplicateFrom,
  editsFrom,
  emailEdited,
  emailProblems,
  fieldLabel,
  initialDraftState,
  isAiFilled,
  isRecordFilled,
  MAX_FIELD_LENGTH,
  missingRequired,
} from './ticketDraft';

describe('escalation email editing (UC-07)', () => {
  it('starts from the drafted email; drafts without one have none', () => {
    expect(initialDraftState(EMAIL_DRAFT).email).toEqual({
      subject: EMAIL_DRAFT.email!.subject,
      body: EMAIL_DRAFT.email!.body,
    });
    expect(initialDraftState(DRAFT).email).toBeNull();
  });

  it('keeps the subject on one line and cuts both to the limits', () => {
    let state = initialDraftState(EMAIL_DRAFT);
    state = draftReducer(state, { type: 'emailEdit', field: 'subject', value: 'A\r\nBcc: x' });
    expect(state.email!.subject).toBe('A Bcc: x');
    state = draftReducer(state, { type: 'emailEdit', field: 'subject', value: 's'.repeat(200) });
    expect(state.email!.subject).toHaveLength(EMAIL_LIMITS.subject);
    state = draftReducer(state, { type: 'emailEdit', field: 'body', value: 'Line 1\nLine 2' });
    expect(state.email!.body).toBe('Line 1\nLine 2'); // the body keeps its lines
    state = draftReducer(state, { type: 'emailEdit', field: 'body', value: 'b'.repeat(6000) });
    expect(state.email!.body).toHaveLength(EMAIL_LIMITS.body);
  });

  it('ignores email edits while sending, and on drafts without an email', () => {
    const sending = draftReducer(initialDraftState(EMAIL_DRAFT), { type: 'submit' });
    expect(draftReducer(sending, { type: 'emailEdit', field: 'body', value: 'x' })).toBe(sending);
    const plain = initialDraftState(DRAFT);
    expect(draftReducer(plain, { type: 'emailEdit', field: 'body', value: 'x' })).toBe(plain);
  });

  it('reset returns to the drafted text; edits survive the duplicate prompt', () => {
    let state = draftReducer(initialDraftState(EMAIL_DRAFT), {
      type: 'emailEdit',
      field: 'body',
      value: 'My own words',
    });
    state = draftReducer(state, {
      type: 'duplicate',
      existing: { humanId: 'HR-0042', summary: 'LOP', status: 'new' },
    });
    expect(state.email!.body).toBe('My own words');
    state = draftReducer(draftReducer(state, { type: 'back' }), {
      type: 'emailReset',
      email: draftedEmail(EMAIL_DRAFT)!,
    });
    expect(state.email).toEqual(draftedEmail(EMAIL_DRAFT));
  });

  it('confirm always sends the on-screen email, trimmed; drafts without one send none', () => {
    const email = { subject: '  Please review  ', body: '\nHello\n' };
    expect(confirmBody(EMAIL_DRAFT, {}, 'same', email)).toMatchObject({
      duplicateDecision: 'same',
      email: { subject: 'Please review', body: 'Hello' },
    });
    expect(confirmBody(DRAFT, {}, undefined, email)).not.toHaveProperty('email');
    expect(confirmBody(DRAFT, {})).not.toHaveProperty('email');
  });

  it('reports which parts changed and why Send is blocked', () => {
    const drafted = draftedEmail(EMAIL_DRAFT)!;
    expect(emailEdited(EMAIL_DRAFT, drafted)).toEqual({ subject: false, body: false });
    expect(emailEdited(EMAIL_DRAFT, { ...drafted, body: `${drafted.body} ` })).toEqual({
      subject: false,
      body: false, // whitespace only
    });
    expect(emailEdited(EMAIL_DRAFT, { ...drafted, subject: 'New' })).toEqual({
      subject: true,
      body: false,
    });
    expect(emailProblems(drafted)).toEqual([]);
    expect(emailProblems({ subject: ' ', body: '' })).toEqual([
      'Add a subject to the email.',
      'Add a message to the email.',
    ]);
    expect(emailProblems(null)).toEqual([]);
  });

  it('a record-filled field is marked until the employee changes it', () => {
    expect(isRecordFilled(EMAIL_DRAFT, initialDraftState(EMAIL_DRAFT).values, 'pay_period')).toBe(
      true,
    );
    expect(isRecordFilled(EMAIL_DRAFT, { pay_period: 'August' }, 'pay_period')).toBe(false);
    expect(isRecordFilled(EMAIL_DRAFT, initialDraftState(EMAIL_DRAFT).values, 'question')).toBe(
      false,
    );
  });
});

describe('ticket draft editing', () => {
  it('labels field keys for people', () => {
    expect(fieldLabel('device_model')).toBe('Device model');
    expect(fieldLabel('asset-tag')).toBe('Asset tag');
  });

  it('shows "unknown" as an empty field', () => {
    const state = initialDraftState(DRAFT);
    expect(state.values).toEqual({
      device_model: 'Dell Latitude 7440',
      symptoms: 'Does not power on',
      started_at: '',
      asset_tag: '',
    });
    expect(state.phase).toBe('editing');
  });

  it('sends only changed fields, trimmed; clearing a field sends "unknown"', () => {
    let state = initialDraftState(DRAFT);
    expect(editsFrom(DRAFT, state.values)).toEqual({});
    state = draftReducer(state, { type: 'edit', key: 'asset_tag', value: '  AT-1234 ' });
    state = draftReducer(state, { type: 'edit', key: 'device_model', value: '' });
    state = draftReducer(state, { type: 'edit', key: 'symptoms', value: 'Does not power on ' });
    expect(editsFrom(DRAFT, state.values)).toEqual({
      asset_tag: 'AT-1234',
      device_model: 'unknown',
    });
    expect(confirmBody(DRAFT, state.values)).toEqual({
      edits: { asset_tag: 'AT-1234', device_model: 'unknown' },
    });
    expect(confirmBody(DRAFT, state.values, 'same').duplicateDecision).toBe('same');
  });

  it('never sends requester, queue or priority: only the draft field keys', () => {
    const values = { ...initialDraftState(DRAFT).values, requesterId: 'x', priority: 'critical' };
    expect(Object.keys(editsFrom(DRAFT, values))).toEqual([]);
  });

  it('caps field length', () => {
    const state = draftReducer(initialDraftState(DRAFT), {
      type: 'edit',
      key: 'symptoms',
      value: 'x'.repeat(MAX_FIELD_LENGTH + 50),
    });
    expect(state.values.symptoms).toHaveLength(MAX_FIELD_LENGTH);
  });

  it('tracks required-missing fields and AI-filled markers as the employee types', () => {
    let state = initialDraftState(DRAFT);
    expect(missingRequired(DRAFT, state.values)).toEqual(['asset_tag']);
    expect(isAiFilled(DRAFT, state.values, 'device_model')).toBe(true);
    state = draftReducer(state, { type: 'edit', key: 'asset_tag', value: 'AT-1' });
    state = draftReducer(state, { type: 'edit', key: 'device_model', value: 'HP EliteBook' });
    expect(missingRequired(DRAFT, state.values)).toEqual([]);
    expect(isAiFilled(DRAFT, state.values, 'device_model')).toBe(false);
    expect(isAiFilled(DRAFT, state.values, 'symptoms')).toBe(true);
    expect(isAiFilled(DRAFT, state.values, 'asset_tag')).toBe(false);
  });

  it('moves through submit, duplicate prompt, back and failure', () => {
    let state = draftReducer(initialDraftState(DRAFT), { type: 'submit' });
    expect(state.phase).toBe('submitting');
    // Edits are ignored while a request is in flight.
    expect(draftReducer(state, { type: 'edit', key: 'symptoms', value: 'x' })).toBe(state);
    const existing = { humanId: 'IT-0007', summary: 'Laptop dead', status: 'new' as const };
    state = draftReducer(state, { type: 'duplicate', existing });
    expect(state).toMatchObject({ phase: 'duplicate', duplicate: existing });
    state = draftReducer(state, { type: 'back' });
    expect(state).toMatchObject({ phase: 'editing', duplicate: null });
    state = draftReducer(state, { type: 'failed', message: 'Server error' });
    expect(state).toMatchObject({ phase: 'error', error: 'Server error' });
    state = draftReducer(state, { type: 'cancel' });
    expect(state).toMatchObject({ phase: 'cancelling', error: null });
  });

  it('reads the existing ticket from DUPLICATE_CANDIDATE details', () => {
    const existing = { humanId: 'IT-0007', summary: 'Laptop dead', status: 'in_progress' };
    expect(duplicateFrom({ existing })).toEqual(existing);
    expect(duplicateFrom({ existing: { humanId: 'IT-0007' } })).toBeNull();
    expect(duplicateFrom(undefined)).toBeNull();
  });
});
