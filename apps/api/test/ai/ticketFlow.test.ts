// AI workflow tests for W3-02: slotFill (P-5), clarifyForTicket (P-4 ticket
// mode) and buildDraft across turns on the real runtime graph with fake models.
import { Command } from '@langchain/langgraph';
import { TicketDraftSchema } from '@sd/shared';
import { ObjectId } from 'mongodb';
import { createMemoryCheckpointer, threadConfig } from '../../src/ai/graph/checkpointer';
import { buildTurnGraph } from '../../src/ai/graph/runtime';
import { newTurn, type State } from '../../src/ai/graph/state';
import type { FakeReply } from '../../src/ai/llm/fakeModels';
import { fakeChatHandle } from '../../src/ai/llm/fakeModels';
import { SLOT_FILL_FALLBACK } from '../../src/ai/nodes/slotFill';
import { TICKET_CLARIFY_FALLBACK } from '../../src/ai/nodes/clarifyForTicket';
import { MAX_TICKET_CLARIFY_ROUNDS } from '../../src/ai/graph/edges';
import { loadPromptRegistry } from '../../src/ai/prompts/registry';
import type { MessageDoc } from '../../src/db/schemas';
import { seededUsers } from '../helpers/app';
import {
  analysisReply,
  answerReply,
  chunk,
  config,
  rerankReply,
  retrievalOf,
} from '../helpers/chat';
import { memoryConversationsRepository } from '../helpers/conversations';
import { memoryTicketsRepository } from '../helpers/tickets';

const PRIYA = 'priya.shah@example.com';
const BATTERY = [
  chunk(
    'it-battery-safety',
    'If a laptop battery is swollen, stop using it, unplug it and do not charge it.',
    {
      domain: 'IT',
      docTitle: 'Laptop Battery Safety',
    },
  ),
];

const slots = (over: Record<string, unknown> = {}) =>
  JSON.stringify({
    category: 'hardware',
    subcategory: 'battery',
    urgency: 'medium',
    urgencyReason: 'cannot use laptop safely',
    impactScope: 'me',
    summary: 'Swollen laptop battery',
    description: 'The employee reports a swollen laptop battery and has stopped using it.',
    alreadyTried: [],
    errorMessages: [],
    fields: { device_model: 'unknown', symptoms: 'battery is swollen' },
    requiredMissing: ['device_model'],
    ...over,
  });
const question = (q: string, fieldsAsked: string[]) => JSON.stringify({ question: q, fieldsAsked });

function setup(replies: FakeReply[], retrieval = BATTERY) {
  const users = seededUsers();
  const conversations = memoryConversationsRepository();
  const chat = fakeChatHandle(replies, { nativeStructured: true });
  const tickets = memoryTicketsRepository();
  const graph = buildTurnGraph({
    config: {
      ...config,
      models: {
        ...config.models,
        call: { ...config.models.call, maxRetries: 0, timeoutMs: 5_000 },
      },
    },
    prompts: loadPromptRegistry(config.prompts.active),
    chatFor: () => chat,
    users: { findById: async (id) => users.find((u) => u._id.toHexString() === id) ?? null },
    conversations,
    tickets,
    retrieve: async () => retrievalOf(retrieval),
    checkpointer: createMemoryCheckpointer(),
  });
  const user = users.find((u) => u.email === PRIYA)!;
  const conversationId = new ObjectId();

  /** One employee turn: store the message, run the graph, return state and pending node. */
  async function turn(text: string, forceEscalate = false) {
    const message: MessageDoc = {
      _id: new ObjectId(),
      conversationId,
      role: 'user',
      content: text,
      decision: null,
      reasonCode: null,
      citations: [],
      uncovered: [],
      ticketDraft: null,
      status: 'complete',
      isEval: false,
      createdAt: new Date(),
    };
    await conversations.insertMessage(message);
    const state = (await graph.invoke(
      newTurn({
        conversationId: conversationId.toHexString(),
        userId: user._id.toHexString(),
        userMessageId: message._id.toHexString(),
        assistantMessageId: new ObjectId().toHexString(),
        text,
        forceEscalate,
      }),
      threadConfig(conversationId.toHexString()),
    )) as State;
    const pending = (await graph.getState(threadConfig(conversationId.toHexString()))).next;
    return { state, pending, path: state.trace.steps.map((s) => s.node) };
  }
  /** The employee confirms the waiting draft (the confirm endpoint's resume). */
  async function confirm() {
    const state = (await graph.invoke(
      new Command({ resume: { action: 'confirm' } }),
      threadConfig(conversationId.toHexString()),
    )) as State;
    return { state, path: state.trace.steps.map((s) => s.node) };
  }
  return { turn, confirm, chat, conversations, tickets };
}

describe('ticket flow across turns', () => {
  it('complete first time: all required fields known → draft at once', async () => {
    const { turn, chat } = setup([
      analysisReply({ intent: 'talk_to_human', domain: 'IT', category: 'hardware' }),
      slots({
        fields: { device_model: 'ThinkPad T14', symptoms: 'battery is swollen' },
        requiredMissing: [],
      }),
    ]);
    const t = await turn('Please get me a person, my ThinkPad T14 battery is swollen', true);
    expect(t.path).toEqual([
      'loadContext',
      'precheck',
      'analyzeTurn',
      'slotFill',
      'buildDraft',
      'persist',
    ]);
    expect(t.pending).toEqual(['awaitConfirmation']);
    expect(chat.model.calls).toHaveLength(2); // P-1, P-5
    const draft = t.state.output!.draft!;
    expect(TicketDraftSchema.safeParse(draft).success).toBe(true); // DoD: matches the shared TicketDraft
    expect(draft).toMatchObject({
      domain: 'IT',
      category: 'hardware',
      subcategory: 'battery',
      queue: { id: 'it_hardware', label: 'IT Hardware' },
      fields: {
        device_model: 'ThinkPad T14',
        symptoms: 'battery is swollen',
        started_at: 'unknown',
        asset_tag: 'unknown',
      },
      aiFilledFields: ['device_model', 'symptoms'],
      requiredMissing: [],
      restricted: false,
    });
    expect(t.state.output!.text).toContain('IT Hardware team');
  });

  it('W3-06: confirm creates the ticket, then P-6 writes the agent brief (never before confirm)', async () => {
    const { turn, confirm, chat, tickets } = setup([
      analysisReply({ intent: 'talk_to_human', domain: 'IT', category: 'hardware' }),
      slots({
        fields: { device_model: 'ThinkPad T14', symptoms: 'battery is swollen' },
        requiredMissing: [],
      }),
      JSON.stringify({
        summary: 'Swollen ThinkPad T14 battery; employee stopped using it',
        agentBrief: 'The employee reports a swollen ThinkPad T14 battery and has stopped using it.',
        suggestedFirstChecks: ['Arrange a battery replacement', 'Offer a loan laptop'],
      }),
    ]);
    await turn('Please get me a person, my ThinkPad T14 battery is swollen', true);
    expect(chat.model.calls).toHaveLength(2); // P-1, P-5: nothing for agents before confirm
    const { state, path } = await confirm();
    // The resumed turn keeps its trace: the steps before confirmation, then these.
    expect(path.slice(-4)).toEqual([
      'awaitConfirmation',
      'createTicket',
      'sendEmail',
      'agentSummary',
    ]);
    expect(chat.model.calls).toHaveLength(3); // + P-6
    const ticket = (await tickets.findById(state.output!.ticketId!))!;
    expect(ticket.summary).toBe('Swollen laptop battery'); // the employee-confirmed summary
    expect(ticket.agentBrief).toContain('ThinkPad T14');
    expect(ticket.agentAssist).toMatchObject({
      status: 'generated',
      headline: 'Swollen ThinkPad T14 battery; employee stopped using it',
      firstChecks: ['Arrange a battery replacement', 'Offer a loan laptop'],
    });
    expect(state.trace.llmCalls.map((c) => c.node).at(-1)).toBe('agentSummary');
  });

  it('W3-06: a P-6 failure still creates the ticket, with the description as the brief', async () => {
    const { turn, confirm, tickets } = setup([
      analysisReply({ intent: 'talk_to_human', domain: 'IT', category: 'hardware' }),
      slots({
        fields: { device_model: 'ThinkPad T14', symptoms: 'battery is swollen' },
        requiredMissing: [],
      }),
      new Error('503 overloaded'),
    ]);
    await turn('Please get me a person, my ThinkPad T14 battery is swollen', true);
    const { state } = await confirm();
    const ticket = (await tickets.findById(state.output!.ticketId!))!;
    expect(ticket.agentBrief).toBe(
      'The employee reports a swollen laptop battery and has stopped using it.',
    );
    expect(ticket.agentAssist?.status).toBe('fallback');
    expect(state.trace.flags).toContain('AGENT_SUMMARY_FALLBACK');
  });

  it('one round: asks for the missing field, then drafts with the answer merged in', async () => {
    const { turn } = setup([
      analysisReply({ intent: 'talk_to_human', domain: 'IT', category: 'hardware' }),
      slots(),
      question('Which laptop model is it?', ['device_model']),
      analysisReply({ intent: 'follow_up', domain: 'IT', category: 'hardware' }),
      // The second extraction forgets the symptom; the earlier known value is kept.
      slots({
        fields: { device_model: 'Dell Latitude 7420', symptoms: 'unknown' },
        requiredMissing: ['symptoms'],
      }),
    ]);
    const first = await turn('My laptop battery is swollen, please raise a ticket', true);
    expect(first.path.slice(-3)).toEqual(['slotFill', 'clarifyForTicket', 'persist']);
    expect(first.state.output!.text).toBe('Which laptop model is it?');
    expect(first.state.ticketFlow).toMatchObject({
      active: true,
      clarifyRounds: 1,
      requiredMissing: ['device_model'],
    });
    expect(first.pending).toEqual([]);

    const second = await turn('It is a Dell Latitude 7420');
    expect(second.path).toEqual([
      'loadContext',
      'precheck',
      'analyzeTurn',
      'slotFill',
      'buildDraft',
      'persist',
    ]);
    expect(second.state.output!.draft!.fields).toMatchObject({
      device_model: 'Dell Latitude 7420',
      symptoms: 'battery is swollen',
    });
    expect(second.state.output!.draft!.requiredMissing).toEqual([]);
    expect(second.pending).toEqual(['awaitConfirmation']);
  });

  it(`two rounds (the maximum, ${MAX_TICKET_CLARIFY_ROUNDS}) then drafts with unknowns preserved`, async () => {
    const none = {
      fields: { device_model: 'unknown', symptoms: 'unknown' },
      requiredMissing: ['device_model', 'symptoms'],
    };
    const { turn } = setup([
      analysisReply({ intent: 'talk_to_human', domain: 'IT', category: 'hardware' }),
      slots(none),
      question('Which laptop is it, and what is happening?', ['device_model', 'symptoms']),
      analysisReply(),
      slots(none),
      question('Could you tell me the laptop model and what goes wrong?', [
        'device_model',
        'symptoms',
      ]),
      analysisReply(),
      slots(none),
    ]);
    const first = await turn('I need a person for my laptop', true);
    expect(first.path.at(-2)).toBe('clarifyForTicket');
    const second = await turn('not sure');
    expect(second.path.at(-2)).toBe('clarifyForTicket');
    expect(second.state.ticketFlow.clarifyRounds).toBe(2);
    const third = await turn('I really do not know');
    expect(third.path.slice(-3)).toEqual(['slotFill', 'buildDraft', 'persist']);
    const draft = third.state.output!.draft!;
    expect(draft.fields).toMatchObject({ device_model: 'unknown', symptoms: 'unknown' });
    expect(draft.requiredMissing).toEqual(['device_model', 'symptoms']);
    expect(draft.aiFilledFields).toEqual([]);
    expect(third.pending).toEqual(['awaitConfirmation']);
  });

  // Acceptance (W3-02): "battery case asks for device model once, then drafts".
  it('battery safety case: safety steps + one device-model question, then a critical draft', async () => {
    const { turn, chat } = setup([
      analysisReply({
        intent: 'report_issue',
        domain: 'IT',
        category: 'hardware',
        subcategory: 'battery',
        urgency: 'high',
      }),
      rerankReply(BATTERY),
      answerReply('Stop using the laptop, unplug it and do not charge it [S1].'),
      slots(),
      question('Which laptop model is it?', ['device_model']),
      analysisReply({ intent: 'follow_up', domain: 'IT', category: 'hardware' }),
      slots({
        fields: { device_model: 'ThinkPad T14', symptoms: 'battery is swollen' },
        requiredMissing: [],
      }),
    ]);
    const first = await turn('My laptop battery is swollen and the case is bulging');
    expect(first.state.decision).toMatchObject({ value: 'ESCALATE', reasonCode: 'SAFETY' });
    expect(first.path).toEqual([
      'loadContext',
      'precheck',
      'analyzeTurn',
      'retrieve',
      'rerankAssess',
      'decide',
      'answer',
      'validateCitations',
      'slotFill',
      'clarifyForTicket',
      'persist',
    ]);
    // Safety steps first, then the one question; the citation stays valid.
    expect(first.state.output!.text).toBe(
      'Stop using the laptop, unplug it and do not charge it [S1].\n\nWhich laptop model is it?',
    );
    expect(first.state.output!.citations).toHaveLength(1);

    const second = await turn('It is a ThinkPad T14');
    const runs = [...first.path, ...second.path].filter((n) => n === 'clarifyForTicket');
    expect(runs).toHaveLength(1); // asked once
    const draft = second.state.output!.draft!;
    expect(draft).toMatchObject({
      category: 'hardware',
      queue: { id: 'it_hardware' },
      // The AI said medium; the safety floor from turn 1 makes it critical.
      aiUrgency: 'medium',
      priority: 'critical',
      priorityFloorApplied: 'safety_battery',
      fields: { device_model: 'ThinkPad T14' },
    });
    expect(second.pending).toEqual(['awaitConfirmation']);
    expect(chat.model.calls).toHaveLength(7);
  });
});

describe('code decides, model proposes', () => {
  it('drops invented field keys and ignores the model’s own missing list', async () => {
    const { turn } = setup([
      analysisReply({ intent: 'talk_to_human', domain: 'IT', category: 'hardware' }),
      slots({
        fields: {
          device_model: 'ThinkPad',
          symptoms: 'swollen',
          employee_name: 'Priya Shah',
          password: 'x',
        },
        requiredMissing: ['asset_tag'],
      }),
    ]);
    const t = await turn('Get me a person, ThinkPad battery swollen', true);
    expect(Object.keys(t.state.output!.draft!.fields)).toEqual([
      'device_model',
      'symptoms',
      'started_at',
      'asset_tag',
    ]);
    expect(t.state.output!.draft!.requiredMissing).toEqual([]);
    expect(t.state.trace.outputs.slotFill).toMatchObject({ modelRequiredMissing: ['asset_tag'] });
  });

  it('the category is kept once chosen, even if a later extraction proposes another', async () => {
    const { turn } = setup([
      analysisReply({ intent: 'talk_to_human', domain: 'IT', category: 'hardware' }),
      slots(),
      question('Which laptop?', ['device_model']),
      analysisReply(),
      slots({
        category: 'software',
        subcategory: 'application_error',
        fields: { application: 'Excel', symptoms: 'crash' },
      }),
    ]);
    await turn('ticket please, battery swollen', true);
    const second = await turn('Excel keeps crashing actually');
    expect(second.state.ticketFlow.category).toBe('hardware');
  });
});

describe('fallbacks', () => {
  it('P-5 fails twice → template extraction (all unknown, redacted description), then asks', async () => {
    const { turn } = setup([
      analysisReply({ intent: 'talk_to_human', domain: 'IT', category: 'hardware' }),
      'not json',
      '{"category": "hardware"}',
      question('Which laptop, and what happens?', ['device_model', 'symptoms']),
    ]);
    const t = await turn('Ticket please. Reach me at priya@example.com, my laptop is broken', true);
    expect(t.state.trace.flags).toContain(SLOT_FILL_FALLBACK);
    expect(t.state.ticketFlow.fields).toMatchObject({
      device_model: 'unknown',
      symptoms: 'unknown',
    });
    expect(t.state.ticketFlow.extraction).toMatchObject({
      fromModel: false,
      impactScope: 'unknown',
    });
    expect(t.state.ticketFlow.extraction!.description).toContain('[EMAIL]');
    expect(t.state.ticketFlow.extraction!.description).not.toContain('priya@example.com');
    expect(t.path.at(-2)).toBe('clarifyForTicket');
  });

  it('P-4 fails → templated question listing the missing fields', async () => {
    const { turn } = setup([
      analysisReply({ intent: 'talk_to_human', domain: 'IT', category: 'hardware' }),
      slots(),
      '{"question": ""}',
      '{}',
    ]);
    const t = await turn('Ticket please, my battery is swollen', true);
    expect(t.state.trace.flags).toContain(TICKET_CLARIFY_FALLBACK);
    expect(t.state.output!.text).toBe(
      'To raise your ticket I need a little more detail: device make and model. Could you tell me?',
    );
  });

  it('no category from the analysis or the model → the domain default category', async () => {
    const { turn } = setup([
      analysisReply({ intent: 'talk_to_human', domain: 'HR', category: 'none' }),
      'bad',
      'bad again',
      question('What do you need from HR?', ['policy_topic', 'question']),
    ]);
    const t = await turn('I want to talk to someone', true);
    expect(t.state.ticketFlow.category).toBe('policy');
  });

  it('the configured clarification limit matches the graph edge', () => {
    expect(config.thresholds.ticket.maxClarifyRounds).toBe(MAX_TICKET_CLARIFY_ROUNDS);
  });
});
