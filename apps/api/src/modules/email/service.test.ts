import { ObjectId } from 'mongodb';
import { ConfigError } from '../../config/errors';
import type { EmailOutboxDoc } from '../../db/schemas';
import { memoryEmailRepository } from '../../../test/helpers/tickets';
import { createEmailService } from './service';
import { createEmailTransport, createMockTransport, type EmailTransport } from './transport';

const AT = new Date('2026-09-15T10:00:00Z');

function row(over: Partial<EmailOutboxDoc> = {}): EmailOutboxDoc {
  return {
    _id: new ObjectId(),
    conversationId: new ObjectId(),
    ticketId: new ObjectId(),
    ticketHumanId: 'HR-1001',
    requesterId: new ObjectId(),
    from: { name: 'Priya Shah', address: 'priya@example.com' },
    to: { queueId: 'hr_payroll', label: 'Payroll', address: 'payroll@example.com' },
    subject: 'Payroll request: LOP on my September payslip',
    body: 'Hello Payroll team,\n\nPlease review it.',
    aiDraft: { subject: 'Payroll request: LOP', body: 'Hello Payroll team,' },
    edited: { subject: true, body: true },
    issueSource: 'model',
    recordsAsOf: '2026-09-15',
    delivery: {
      mode: 'mock',
      status: 'queued',
      attempts: 0,
      lastError: null,
      deliveredAt: null,
      providerMessageId: null,
    },
    isEval: false,
    createdAt: AT,
    updatedAt: AT,
    ...over,
  };
}

const failing: EmailTransport = {
  kind: 'mock',
  deliver: async () => {
    throw new Error('mailbox unavailable');
  },
};

describe('email service', () => {
  it('records one row per conversation: a second recordOnce returns the first row', async () => {
    const repo = memoryEmailRepository();
    const email = createEmailService({ repository: repo, transport: createMockTransport() });
    const first = row();
    const again = row({ conversationId: first.conversationId, subject: 'A different subject' });

    expect((await email.recordOnce(first)).inserted).toBe(true);
    const second = await email.recordOnce(again);

    expect(second.inserted).toBe(false);
    expect(second.doc._id.equals(first._id)).toBe(true);
    expect(second.doc.subject).toBe(first.subject);
    expect(repo.rows).toHaveLength(1);
  });

  it('mock delivery marks the row recorded with a deterministic message ID', async () => {
    const repo = memoryEmailRepository();
    const email = createEmailService({
      repository: repo,
      transport: createMockTransport(),
      now: () => AT,
    });
    const { doc } = await email.recordOnce(row());

    const { doc: delivered, transitioned } = await email.deliver(doc);

    expect(transitioned).toBe(true);
    expect(delivered.delivery).toMatchObject({
      mode: 'mock',
      status: 'recorded',
      attempts: 1,
      lastError: null,
      deliveredAt: AT,
      providerMessageId: `<${doc._id.toHexString()}@outbox.mock>`,
    });
  });

  it('delivers once: a second deliver of the same row changes nothing', async () => {
    const repo = memoryEmailRepository();
    const transport = { kind: 'mock' as const, deliver: jest.fn(createMockTransport().deliver) };
    const email = createEmailService({ repository: repo, transport });
    const { doc } = await email.recordOnce(row());

    await email.deliver(doc);
    // The caller still holds the stale 'queued' copy (as after a crash and resume).
    const again = await email.deliver(doc);

    expect(again.transitioned).toBe(false);
    expect(again.doc.delivery.status).toBe('recorded');
    expect(again.doc.delivery.attempts).toBe(1);
    expect(transport.deliver).toHaveBeenCalledTimes(1);
  });

  it('a transport error marks the row failed with the error, never throwing', async () => {
    const repo = memoryEmailRepository();
    const email = createEmailService({ repository: repo, transport: failing, now: () => AT });
    const { doc } = await email.recordOnce(row());

    const { doc: failed, transitioned } = await email.deliver(doc);

    expect(transitioned).toBe(true);
    expect(failed.delivery).toMatchObject({
      status: 'failed',
      attempts: 1,
      lastError: 'mailbox unavailable',
      deliveredAt: null,
    });
  });

  it('lists a ticket’s emails oldest first and finds a row by conversation', async () => {
    const repo = memoryEmailRepository();
    const email = createEmailService({ repository: repo, transport: createMockTransport() });
    const ticketId = new ObjectId();
    const later = row({ ticketId, createdAt: new Date('2026-09-16T10:00:00Z') });
    const earlier = row({ ticketId });
    await email.recordOnce(later);
    await email.recordOnce(earlier);
    await email.recordOnce(row());

    const listed = await email.listForTicket(ticketId);

    expect(listed.map((e) => e._id.toHexString())).toEqual([
      earlier._id.toHexString(),
      later._id.toHexString(),
    ]);
    expect((await email.findByConversation(later.conversationId))?._id.equals(later._id)).toBe(
      true,
    );
    expect(await email.findByConversation(new ObjectId())).toBeNull();
  });

  it('the service reports the transport’s delivery mode', () => {
    const email = createEmailService({
      repository: memoryEmailRepository(),
      transport: createMockTransport(),
    });
    expect(email.mode).toBe('mock');
  });
});

describe('createEmailTransport', () => {
  it('EMAIL_DELIVERY=mock gives the mock transport', () => {
    expect(createEmailTransport('mock').kind).toBe('mock');
  });

  it('EMAIL_DELIVERY=smtp stops startup: no mail dependency is approved', () => {
    expect(() => createEmailTransport('smtp')).toThrow(ConfigError);
    expect(() => createEmailTransport('smtp')).toThrow(/Nodemailer, which is not approved/);
  });
});
