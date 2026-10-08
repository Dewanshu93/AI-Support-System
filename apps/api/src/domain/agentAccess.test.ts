// W3-05: agent visibility and classification corrections, against the committed config.
import { loadConfig } from '../config';
import { VALID_ENV } from '../../test/helpers/config';
import { applyClassification, canSeeTicket, priorityRank, queueScope } from './agentAccess';

const config = loadConfig(VALID_ENV);
const SENSITIVE = config.routing.sensitiveQueue;
const sam = { role: 'agent' as const, queues: ['it_hardware', 'it_software', 'it_access'] };
const hana = { role: 'agent' as const, queues: ['hr_general', 'hr_case'] };
const hrGeneralOnly = { role: 'agent' as const, queues: ['hr_general'] };
const alex = { role: 'admin' as const, queues: [] };
const priya = { role: 'employee' as const, queues: [] };

describe('canSeeTicket', () => {
  it.each([
    ['Sam, IT ticket', sam, { queue: 'it_hardware', restricted: false }, true],
    ['Sam, HR ticket', sam, { queue: 'hr_general', restricted: false }, false],
    ['Sam, restricted case', sam, { queue: 'hr_case', restricted: true }, false],
    ['Hana, HR ticket', hana, { queue: 'hr_general', restricted: false }, true],
    ['Hana, restricted case', hana, { queue: 'hr_case', restricted: true }, true],
    ['Hana, IT ticket', hana, { queue: 'it_hardware', restricted: false }, false],
    // A restricted case needs the confidential queue even if mislabelled elsewhere.
    [
      'HR agent without hr_case, restricted',
      hrGeneralOnly,
      { queue: 'hr_general', restricted: true },
      false,
    ],
    ['admin, restricted case', alex, { queue: 'hr_case', restricted: true }, true],
    ['employee, any ticket', priya, { queue: 'it_hardware', restricted: false }, false],
  ])('%s → %s', (_label, viewer, ticket, expected) => {
    expect(canSeeTicket(viewer, ticket, SENSITIVE)).toBe(expected);
  });
});

describe('queueScope', () => {
  it('agents: their queues, one of them, or forbidden', () => {
    expect(queueScope(sam, undefined)).toEqual(sam.queues);
    expect(queueScope(sam, 'it_access')).toEqual(['it_access']);
    expect(queueScope(sam, 'hr_general')).toBe('forbidden');
  });
  it('admins: every queue (null) or the one asked for', () => {
    expect(queueScope(alex, undefined)).toBeNull();
    expect(queueScope(alex, 'hr_case')).toEqual(['hr_case']);
  });
});

it('ranks priorities by severity', () => {
  expect(['medium', 'critical', 'low', 'high'].map((p) => priorityRank(p as never))).toEqual([
    1, 3, 0, 2,
  ]);
});

describe('applyClassification', () => {
  const ticket = {
    category: 'hardware',
    subcategory: 'laptop_fault',
    priority: 'medium' as const,
    queue: 'it_hardware',
    domain: 'IT' as const,
    restricted: false,
  };

  it('a category change re-routes, drops the old subcategory and records each change', () => {
    const r = applyClassification(config, ticket, { category: 'access' });
    expect(r).toEqual({
      ok: true,
      next: {
        category: 'access',
        subcategory: null,
        priority: 'medium',
        queue: 'it_access',
        domain: 'IT',
      },
      changes: [
        { field: 'category', oldValue: 'hardware', newValue: 'access' },
        { field: 'subcategory', oldValue: 'laptop_fault', newValue: null },
      ],
      rerouted: true,
    });
  });

  it('moves a ticket across domains (IT → HR) when the category is HR', () => {
    const r = applyClassification(config, ticket, { category: 'payroll', subcategory: null });
    expect(r.ok && r.next).toMatchObject({ queue: 'hr_payroll', domain: 'HR' });
  });

  it('a category in the same queue is not a re-route', () => {
    const r = applyClassification(
      config,
      { ...ticket, category: 'software', subcategory: null, queue: 'it_software' },
      { category: 'network', subcategory: 'vpn' },
    );
    expect(r.ok && r.rerouted).toBe(false);
    expect(r.ok && r.changes.map((c) => c.field)).toEqual(['category', 'subcategory']);
  });

  it('priority and subcategory alone; unchanged values record nothing', () => {
    const r = applyClassification(config, ticket, { priority: 'high', subcategory: 'battery' });
    expect(r.ok && r.changes).toEqual([
      { field: 'subcategory', oldValue: 'laptop_fault', newValue: 'battery' },
      { field: 'priority', oldValue: 'medium', newValue: 'high' },
    ]);
    expect(r.ok && r.rerouted).toBe(false);
    const same = applyClassification(config, ticket, { category: 'hardware', priority: 'medium' });
    expect(same.ok && same.changes).toEqual([]);
  });

  it('clearing the subcategory is a change', () => {
    const r = applyClassification(config, ticket, { subcategory: null });
    expect(r.ok && r.changes).toEqual([
      { field: 'subcategory', oldValue: 'laptop_fault', newValue: null },
    ]);
  });

  it.each([
    [{ category: 'printers' }, 'unknown_category'],
    [{ subcategory: 'vpn' }, 'unknown_subcategory'],
    [{ category: 'access', subcategory: 'battery' }, 'unknown_subcategory'],
  ])('rejects %j (%s)', (request, reason) => {
    expect(applyClassification(config, ticket, request)).toEqual({ ok: false, reason });
  });

  it('restricted cases keep their category (and queue) but priority can change', () => {
    const restricted = {
      category: 'employee_relations',
      subcategory: null,
      priority: 'high' as const,
      queue: 'hr_case',
      domain: 'HR' as const,
      restricted: true,
    };
    expect(applyClassification(config, restricted, { category: 'leave' })).toEqual({
      ok: false,
      reason: 'restricted_category',
    });
    const r = applyClassification(config, restricted, { priority: 'critical' });
    expect(r.ok && r.next).toMatchObject({ queue: 'hr_case', priority: 'critical' });
  });
});
