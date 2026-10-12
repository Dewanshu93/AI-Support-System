import { config } from '../../../test/helpers/chat';
import { fakeChatHandle, type FakeReply } from '../llm/fakeModels';
import { loadPromptRegistry } from '../prompts/registry';
import { createDraftReply, type DraftReplyInput, formatDraftSources } from './draftReply';

const prompts = loadPromptRegistry(config.prompts.active);

const INPUT: DraftReplyInput = {
  ticket: 'Employee first name: Priya\nRequest HR-0101: Loss of Pay deduction review',
  brief: 'Priya logged 8 hours for 11 Sept late and asks payroll to review the deduction.',
  sources: [
    {
      documentId: 'aaaaaaaaaaaaaaaaaaaaaaaa',
      docTitle: 'Loss of Pay (LOP)',
      sectionPath: ['Reversing an LOP deduction'],
      text: 'Payroll will review your request within 3 working days.',
    },
  ],
  tone: 'standard',
};

function draftWith(replies: FakeReply[]) {
  const chat = fakeChatHandle(replies, { nativeStructured: true });
  const draft = createDraftReply({
    prompts,
    chatFor: () => chat,
    policy: { ...config.models.call, maxRetries: 0, timeoutMs: 5_000 },
    costs: config.models.costs,
  });
  return { draft, chat };
}

describe('draftReply (P-7)', () => {
  it('returns the draft, keeps only cited documents that were given, and records the call', async () => {
    const { draft } = draftWith([
      JSON.stringify({
        body: 'Hi Priya, payroll will review your request within 3 working days. [agent name]',
        citedDocumentIds: [
          'aaaaaaaaaaaaaaaaaaaaaaaa',
          'bbbbbbbbbbbbbbbbbbbbbbbb',
          'aaaaaaaaaaaaaaaaaaaaaaaa',
        ],
      }),
    ]);
    const outcome = await draft(INPUT);
    expect(outcome.draft).toEqual({
      body: 'Hi Priya, payroll will review your request within 3 working days. [agent name]',
      citedDocumentIds: ['aaaaaaaaaaaaaaaaaaaaaaaa'],
    });
    expect(outcome.promptVersion).toBe(1);
    expect(outcome.llmCalls).toHaveLength(1);
    expect(outcome.llmCalls[0]).toMatchObject({
      node: 'draftReply',
      promptName: 'agent_draft_reply',
      promptVersion: 1,
      error: null,
    });
  });

  it('a provider failure gives no draft (the endpoint answers 503) and logs the failed call', async () => {
    const { draft } = draftWith([new Error('503 overloaded')]);
    const outcome = await draft(INPUT);
    expect(outcome.draft).toBeNull();
    expect(outcome.llmCalls[0]?.error).toContain('503');
  });

  it('the tone and the sources reach the prompt', async () => {
    const { draft, chat } = draftWith([
      JSON.stringify({ body: 'Hi Priya,', citedDocumentIds: [] }),
    ]);
    await draft({ ...INPUT, tone: 'brief' });
    const sent = JSON.stringify((chat.model as unknown as { calls: unknown[] }).calls[0]);
    expect(sent).toContain('brief: two or three short sentences');
    expect(sent).toContain('[document aaaaaaaaaaaaaaaaaaaaaaaa] Loss of Pay (LOP)');
  });

  it('formats no sources explicitly', () => {
    expect(formatDraftSources([])).toBe('(no documents)');
  });
});
