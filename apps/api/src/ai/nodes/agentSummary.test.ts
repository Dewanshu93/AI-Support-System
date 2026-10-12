import { ObjectId } from 'mongodb';
import { config } from '../../../test/helpers/chat';
import { memoryTicketsRepository } from '../../../test/helpers/tickets';
import type { TicketDoc } from '../../db/schemas';
import type { State, Trace } from '../graph/state';
import { fakeChatHandle, type FakeReply } from '../llm/fakeModels';
import { loadPromptRegistry } from '../prompts/registry';
import { AGENT_SUMMARY_FALLBACK, createAgentSummary, formatTicketForSummary } from './agentSummary';

const prompts = loadPromptRegistry(config.prompts.active);
const policy = { ...config.models.call, maxRetries: 0, timeoutMs: 5_000 };

function ticketFixture(over: Partial<TicketDoc> = {}): TicketDoc {
  return {
    _id: new ObjectId(),
    humanId: 'HR-0101',
    conversationId: new ObjectId(),
    requesterId: new ObjectId(),
    requesterSnapshot: {
      name: 'Priya Shah',
      email: 'priya.shah@example.com',
      country: 'US',
      employmentType: 'full_time',
      department: 'Engineering',
    },
    domain: 'HR',
    category: 'payroll',
    subcategory: 'payslip',
    queue: 'hr_payroll',
    priority: 'medium',
    aiUrgency: 'medium',
    priorityFloorApplied: null,
    status: 'new',
    summary: 'Loss of Pay deduction review',
    agentBrief: 'The employee description.',
    agentAssist: null,
    fields: { pay_period: 'Wed 16 Sept – Wed 30 Sept' },
    aiFilledFields: [],
    articlesShown: [{ documentId: new ObjectId(), docTitle: 'Loss of Pay (LOP)' }],
    restricted: false,
    duplicateOf: null,
    isEval: false,
    createdAt: new Date(),
    updatedAt: new Date(),
    resolvedAt: null,
    ...over,
  };
}

const SUMMARY = JSON.stringify({
  summary: 'Review Loss of Pay for a day the employee says they worked',
  agentBrief:
    'Priya was charged Loss of Pay for Fri 11 Sept (no timesheet, marked absent). She has now logged 8 hours as a late entry and asks payroll to review. She was shown the Loss of Pay policy.',
  suggestedFirstChecks: ['Confirm the late timesheet entry for 11 Sept', 'Check badge-in records'],
});

async function setup(replies: FakeReply[], ticket = ticketFixture()) {
  const tickets = memoryTicketsRepository();
  await tickets.insert(ticket);
  const chat = fakeChatHandle(replies, { nativeStructured: true });
  const node = createAgentSummary({
    prompts,
    chatFor: () => chat,
    policy,
    costs: config.models.costs,
    tickets,
  });
  const state = {
    input: {
      conversationId: ticket.conversationId.toHexString(),
      userId: ticket.requesterId.toHexString(),
      text: 'Please contact payroll about my Loss of Pay. Reach me at priya.home@mail.com',
    },
    history: [{ role: 'user', content: 'Why was my salary reduced?' }],
    output: {
      text: '',
      citations: [],
      uncovered: [],
      withdrawn: false,
      ticketId: ticket._id.toHexString(),
      draft: { description: 'The employee asks payroll to review a Loss of Pay deduction.' },
    },
  } as unknown as State;
  return { tickets, chat, node, state, ticket };
}

describe('agentSummary (P-6)', () => {
  it('writes the brief, headline and first checks; the employee-confirmed summary stays', async () => {
    const { tickets, node, state, ticket } = await setup([SUMMARY]);
    const update = await node(state);
    const saved = (await tickets.findById(ticket._id.toHexString()))!;
    expect(saved.summary).toBe('Loss of Pay deduction review');
    expect(saved.agentBrief).toContain('late entry');
    expect(saved.agentAssist).toMatchObject({
      status: 'generated',
      headline: 'Review Loss of Pay for a day the employee says they worked',
      firstChecks: ['Confirm the late timesheet entry for 11 Sept', 'Check badge-in records'],
      promptRef: expect.stringMatching(/^agent_ticket_summary@v1#/),
    });
    expect((update.trace as Partial<Trace>).llmCalls).toHaveLength(1);
  });

  it('redacts personal details from what the model sees', async () => {
    const { chat, node, state } = await setup([SUMMARY]);
    await node(state);
    const sent = JSON.stringify((chat.model as unknown as { calls: unknown[] }).calls[0]);
    expect(sent).toContain('[EMAIL]');
    expect(sent).not.toContain('priya.home@mail.com');
    expect(sent).toContain('Loss of Pay (LOP)');
  });

  it('a model failure keeps the description as the brief and flags the ticket', async () => {
    const { tickets, node, state, ticket } = await setup([new Error('503 overloaded')]);
    const update = await node(state);
    const saved = (await tickets.findById(ticket._id.toHexString()))!;
    expect(saved.agentBrief).toBe('The employee asks payroll to review a Loss of Pay deduction.');
    expect(saved.agentAssist).toMatchObject({
      status: 'fallback',
      headline: null,
      firstChecks: [],
    });
    expect((update.trace as Partial<Trace>).flags).toEqual([AGENT_SUMMARY_FALLBACK]);
  });

  it('an over-long brief is invalid output: retried once, then the fallback', async () => {
    const long = JSON.stringify({
      summary: 'x',
      agentBrief: Array.from({ length: 120 }, () => 'word').join(' '),
      suggestedFirstChecks: [],
    });
    const { tickets, node, state, ticket } = await setup([long, long]);
    await node(state);
    expect((await tickets.findById(ticket._id.toHexString()))!.agentAssist?.status).toBe(
      'fallback',
    );
  });

  it('confidential cases get no AI: skipped, no model call', async () => {
    const restricted = ticketFixture({ restricted: true, queue: 'hr_case' });
    const { tickets, chat, node, state } = await setup([SUMMARY], restricted);
    await node(state);
    const saved = (await tickets.findById(restricted._id.toHexString()))!;
    expect(saved.agentAssist).toMatchObject({ status: 'skipped', promptRef: null });
    expect((chat.model as unknown as { calls: unknown[] }).calls).toHaveLength(0);
  });

  it('leaves a ticket another conversation created (a "same issue" link) untouched', async () => {
    const other = ticketFixture();
    const { tickets, chat, node, state } = await setup([SUMMARY], other);
    const linked = {
      ...state,
      input: { ...state.input, conversationId: new ObjectId().toHexString() },
    };
    expect(await node(linked as State)).toEqual({});
    expect((await tickets.findById(other._id.toHexString()))!.agentAssist).toBeNull();
    expect((chat.model as unknown as { calls: unknown[] }).calls).toHaveLength(0);
  });

  it('the ticket text has the classification and fields but no requester identity', () => {
    const text = formatTicketForSummary(ticketFixture(), 'desc');
    expect(text).toContain('payroll / payslip');
    expect(text).toContain('pay_period: Wed 16 Sept – Wed 30 Sept');
    expect(text).not.toContain('Priya');
    expect(text).not.toContain('priya.shah@example.com');
  });
});
