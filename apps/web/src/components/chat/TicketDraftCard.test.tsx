// Component tests for draft editing and the duplicate prompt (W3-04). Rendered
// to static HTML with react-dom/server: the editing logic itself is the pure
// reducer in lib/ticketDraft (tested there); these check what the employee sees
// in each state.
import { renderToStaticMarkup } from 'react-dom/server';
import { draftReducer, type DraftState, initialDraftState } from '@/lib/ticketDraft';
import { DRAFT } from '@/test/fixtures';
import { HandoffCard } from './HandoffCard';
import { TicketDraftView } from './TicketDraftCard';

const noop = () => undefined;
const render = (state: DraftState, draft = DRAFT) =>
  renderToStaticMarkup(
    <TicketDraftView
      draft={draft}
      state={state}
      onEdit={noop}
      onConfirm={noop}
      onCancel={noop}
      onDuplicate={noop}
      onBack={noop}
    />,
  );

/** The HTML of one field row, by key. */
const fieldHtml = (html: string, key: string) =>
  html.split('data-testid="draft-field"').find((part) => part.startsWith(` data-key="${key}"`)) ??
  '';

describe('TicketDraftView', () => {
  it('shows every field with AI-filled markers and required-missing highlights', () => {
    const html = render(initialDraftState(DRAFT));
    expect(html.match(/data-testid="draft-field"/g)).toHaveLength(4);
    expect(fieldHtml(html, 'device_model')).toContain('data-testid="ai-filled"');
    expect(fieldHtml(html, 'device_model')).toContain('value="Dell Latitude 7440"');
    expect(fieldHtml(html, 'symptoms')).toContain('data-testid="ai-filled"');
    expect(fieldHtml(html, 'started_at')).not.toContain('ai-filled');
    // "unknown" shows as an empty input.
    expect(fieldHtml(html, 'started_at')).toContain('value=""');
    expect(fieldHtml(html, 'asset_tag')).toContain('data-testid="required-missing"');
    expect(fieldHtml(html, 'asset_tag')).toContain('aria-invalid="true"');
    expect(fieldHtml(html, 'device_model')).not.toContain('required-missing');
  });

  it('shows queue and proposed priority read-only (no input for them)', () => {
    const html = render(initialDraftState(DRAFT));
    expect(html).toContain('data-testid="draft-queue"');
    expect(html).toContain('IT Hardware');
    expect(html).toMatch(/data-testid="draft-priority" data-priority="high"/);
    expect(html).toContain('raised by a company rule');
    expect(html).not.toMatch(/id="draft-field-(priority|queue|requester)/);
    expect(html).toContain('Confirm and create ticket');
    expect(html).not.toContain('data-testid="duplicate-prompt"');
  });

  it('updates markers as the employee edits', () => {
    let state = initialDraftState(DRAFT);
    state = draftReducer(state, { type: 'edit', key: 'device_model', value: 'HP EliteBook 840' });
    state = draftReducer(state, { type: 'edit', key: 'asset_tag', value: 'AT-1234' });
    const html = render(state);
    expect(fieldHtml(html, 'device_model')).not.toContain('ai-filled');
    expect(fieldHtml(html, 'device_model')).toContain('value="HP EliteBook 840"');
    expect(fieldHtml(html, 'symptoms')).toContain('ai-filled');
    expect(html).not.toContain('data-testid="required-missing"');
  });

  it('disables the form while confirming', () => {
    const html = render(draftReducer(initialDraftState(DRAFT), { type: 'submit' }));
    expect(html).toContain('Creating…');
    expect(html).toMatch(/<fieldset[^>]*disabled/);
    expect(html).toMatch(/data-testid="draft-confirm" disabled/);
    expect(html).toMatch(/data-testid="draft-cancel" disabled/);
  });

  it('shows the duplicate prompt with both choices instead of the confirm buttons', () => {
    const state = draftReducer(draftReducer(initialDraftState(DRAFT), { type: 'submit' }), {
      type: 'duplicate',
      existing: { humanId: 'IT-0042', summary: 'Laptop will not start', status: 'in_progress' },
    });
    const html = render(state);
    expect(html).toContain('data-testid="duplicate-prompt"');
    expect(html).toContain('IT-0042');
    expect(html).toContain('Laptop will not start');
    expect(html).toContain('in progress');
    expect(html).toContain('Add to IT-0042');
    expect(html).toContain('data-testid="duplicate-new"');
    expect(html).not.toContain('data-testid="draft-confirm"');
    // The fields are locked while the employee decides.
    expect(html).toMatch(/<fieldset[^>]*disabled/);
  });

  it('shows a failure with the confirm button available again', () => {
    const html = render(
      draftReducer(initialDraftState(DRAFT), { type: 'failed', message: 'Server error' }),
    );
    expect(html).toContain('data-testid="draft-error"');
    expect(html).toContain('Server error');
    expect(html).not.toMatch(/data-testid="draft-confirm" disabled/);
  });

  it('renders a draft without fields (no form)', () => {
    const html = render(initialDraftState({ ...DRAFT, fields: {}, requiredMissing: [] }), {
      ...DRAFT,
      fields: {},
      requiredMissing: [],
      aiFilledFields: [],
    });
    expect(html).not.toContain('<fieldset');
    expect(html).toContain('data-testid="draft-confirm"');
  });
});

describe('HandoffCard private-contact offer', () => {
  const offer = { busy: false, error: null, onAnswer: noop };

  it('shows Yes and No while the offer is open', () => {
    const html = renderToStaticMarkup(
      <HandoffCard
        kind="sensitive"
        text="Would you like HR to contact you privately?"
        offer={offer}
      />,
    );
    expect(html).toContain('data-testid="private-contact-yes"');
    expect(html).toContain('data-testid="private-contact-no"');
    expect(html).not.toMatch(/data-testid="private-contact-yes" disabled/);
  });

  it('disables both while answering and shows errors', () => {
    const html = renderToStaticMarkup(
      <HandoffCard
        kind="sensitive"
        text="t"
        offer={{ ...offer, busy: true, error: 'Try again' }}
      />,
    );
    expect(html).toMatch(/data-testid="private-contact-yes" disabled/);
    expect(html).toMatch(/data-testid="private-contact-no" disabled/);
    expect(html).toContain('Try again');
  });

  it('has no buttons once answered, nor for out of scope', () => {
    expect(
      renderToStaticMarkup(<HandoffCard kind="sensitive" text="t" offer={null} />),
    ).not.toContain('private-contact');
    expect(
      renderToStaticMarkup(<HandoffCard kind="out_of_scope" text="t" offer={offer} />),
    ).not.toContain('private-contact');
  });
});
