import { DRAFT } from '@/test/fixtures';
import {
  confirmBody,
  draftReducer,
  duplicateFrom,
  editsFrom,
  fieldLabel,
  initialDraftState,
  isAiFilled,
  MAX_FIELD_LENGTH,
  missingRequired,
} from './ticketDraft';

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
