import { ObjectId } from 'mongodb';
import { loadConfig } from '../../config';
import {
  ConversationSchema,
  FeedbackSchema,
  GapClusterSchema,
  MessageSchema,
  TicketEventSchema,
  TicketSchema,
  TurnTraceSchema,
  UserSchema,
} from '../../db/schemas';
import { VALID_ENV } from '../../../test/helpers/config';
import { loadSeedUsers } from '../users/seed';
import { buildHistoric, HISTORIC_CONVERSATIONS, loadHistoricCatalog } from './historic';

const { routing } = loadConfig(VALID_ENV);
const seeded = loadSeedUsers().map((u) => ({ ...u, createdAt: new Date(0) }));
const agents = {
  it: seeded.find((u) => u.email === 'sam.patel@example.com')!,
  hr: seeded.find((u) => u.email === 'hana.kim@example.com')!,
};
const TODAY = '2026-10-15';
const chunk = new ObjectId();
const build = (today = TODAY) =>
  buildHistoric({
    catalog: loadHistoricCatalog(),
    today,
    routing,
    agents,
    chunksBySlug: new Map([['hr-annual-leave-us', [chunk]]]),
  });

describe('historic demo data (W4-08)', () => {
  const data = build();

  it('is deterministic: the same "today" gives the same records', () => {
    expect(JSON.stringify(build())).toBe(JSON.stringify(data));
  });

  it('has the planned volumes: ~120 conversations, ~40 tickets, feedback, gap clusters', () => {
    expect(data.conversations).toHaveLength(HISTORIC_CONVERSATIONS);
    expect(data.turnTraces).toHaveLength(HISTORIC_CONVERSATIONS);
    expect(data.messages).toHaveLength(HISTORIC_CONVERSATIONS * 2);
    expect(data.tickets.length).toBeGreaterThanOrEqual(30);
    expect(data.tickets.length).toBeLessThanOrEqual(55);
    expect(data.feedback.length).toBeGreaterThan(10);
    expect(data.gapClusters.length).toBeGreaterThanOrEqual(3);
    expect(data.ticketEvents.some((e) => e.type === 'classification_correction')).toBe(true);
  });

  it('every record passes the collection schema', () => {
    const check = (schema: { parse: (d: unknown) => unknown }, docs: unknown[]) =>
      docs.forEach((d) => schema.parse(d));
    check(UserSchema, data.users);
    check(ConversationSchema, data.conversations);
    check(MessageSchema, data.messages);
    check(TurnTraceSchema, data.turnTraces);
    check(FeedbackSchema, data.feedback);
    check(TicketSchema, data.tickets);
    check(TicketEventSchema, data.ticketEvents);
    check(GapClusterSchema, data.gapClusters);
  });

  it('lies in the 14 days before today and is marked synthetic', () => {
    const from = new Date('2026-10-01T00:00:00Z').getTime();
    const to = new Date(`${TODAY}T00:00:00Z`).getTime();
    for (const c of data.conversations) {
      expect(c.createdAt.getTime()).toBeGreaterThanOrEqual(from);
      expect(c.updatedAt.getTime()).toBeLessThan(to);
      expect(c.synthetic).toBe(true);
    }
    expect(data.tickets.every((t) => t.synthetic)).toBe(true);
  });

  it('references hold: messages, traces, tickets and gaps point at historic conversations', () => {
    const conv = new Set(data.conversations.map((c) => c._id.toHexString()));
    const assistantIds = new Set(
      data.messages.filter((m) => m.role === 'assistant').map((m) => m._id.toHexString()),
    );
    for (const m of data.messages) expect(conv.has(m.conversationId.toHexString())).toBe(true);
    for (const t of data.turnTraces) {
      expect(conv.has(t.conversationId.toHexString())).toBe(true);
      expect(assistantIds.has(t.messageId.toHexString())).toBe(true);
    }
    for (const g of data.gapClusters) {
      expect(g.questionCount).toBe(g.messageIds.length);
      for (const id of g.conversationIds) expect(conv.has(id.toHexString())).toBe(true);
    }
    const tickets = new Set(data.tickets.map((t) => t._id.toHexString()));
    for (const e of data.ticketEvents) expect(tickets.has(e.ticketId.toHexString())).toBe(true);
  });

  it('keeps the rules the real system enforces', () => {
    for (const t of data.tickets) {
      expect(t.humanId).toMatch(/^(IT|HR)-5\d{3}$/);
      if (t.restricted) expect(t.queue).toBe('hr_case');
      expect(t.status === 'waiting_on_employee' && t.priority === 'low').toBe(false);
    }
    expect(new Set(data.tickets.map((t) => t.humanId)).size).toBe(data.tickets.length);
    // Confidential turns carry no analysis or retrieval, and are flagged restricted.
    for (const t of data.turnTraces.filter((x) => x.decision.value === 'SENSITIVE_HANDOFF')) {
      expect(t).toMatchObject({ restricted: true, analysis: null, retrieval: null, llmCalls: [] });
    }
    // Real chunk ids are used when the index has them.
    expect(
      data.turnTraces.some((t) => t.retrieval?.vector.some((v) => v.chunkId.equals(chunk))),
    ).toBe(true);
  });

  it('historic people are not demo personas and never collide with them', () => {
    const seededEmails = new Set(seeded.map((u) => u.email));
    for (const u of data.users) {
      expect(u.isDemo).toBe(false);
      expect(seededEmails.has(u.email)).toBe(false);
    }
  });
});
