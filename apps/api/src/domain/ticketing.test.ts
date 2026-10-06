// W3-01: table-driven tests for the five ticketing modules, against the
// committed config files.
import { PRIORITIES, TICKET_STATUSES, type TicketStatus } from '@sd/shared';
import { loadConfig } from '../config';
import { findCrossFileProblems } from '../config/crossChecks';
import { VALID_ENV } from '../../test/helpers/config';
import { type DuplicateCandidate, findDuplicate } from './duplicateCheck';
import { applyPriorityFloor, restrictedCasePriority } from './priorityFloors';
import { routeTicket } from './routing';
import {
  fieldsFor,
  normaliseFields,
  requiredMissing,
  UNKNOWN,
  unknownEditKeys,
} from './ticketSchemas';
import { canTransition, isOpen, TRANSITIONS } from './ticketStateMachine';

const config = loadConfig(VALID_ENV);

describe('routing', () => {
  it.each([
    ['hardware', 'it_hardware'],
    ['software', 'it_software'],
    ['access', 'it_access'],
    ['network', 'it_software'],
    ['leave', 'hr_general'],
    ['benefits', 'hr_general'],
    ['payroll', 'hr_general'],
    ['policy', 'hr_general'],
    ['employee_relations', 'hr_case'],
  ])('%s → %s', (category, queue) => {
    expect(routeTicket(config.routing, { category, restricted: false }).id).toBe(queue);
  });

  it('every taxonomy category maps to exactly one queue in the committed config', () => {
    for (const c of config.taxonomy.categories) {
      const queue = routeTicket(config.routing, { category: c.id, restricted: false });
      expect(queue.domain).toBe(c.domain);
    }
    expect(findCrossFileProblems(config)).toEqual([]);
  });

  it('startup check rejects a category without a queue (acceptance)', () => {
    const broken = {
      ...config,
      routing: { ...config.routing, routes: { ...config.routing.routes } },
    };
    delete (broken.routing.routes as Record<string, string>).leave;
    expect(findCrossFileProblems(broken)).toContain(
      'taxonomy category "leave" has no queue in routing.yaml',
    );
  });

  it('restricted cases always go to the confidential HR queue', () => {
    expect(routeTicket(config.routing, { category: 'hardware', restricted: true })).toEqual({
      id: 'hr_case',
      label: 'HR Confidential Cases',
      domain: 'HR',
    });
  });

  it('an unknown category is a programming error', () => {
    expect(() => routeTicket(config.routing, { category: 'catering', restricted: false })).toThrow(
      'no queue for category "catering"',
    );
  });
});

describe('priority floors', () => {
  const floors = config.priorityRules.floors;
  it.each<[string, Parameters<typeof applyPriorityFloor>[0], string, string | null]>([
    ['no rule applies', { aiUrgency: 'low', matchedRules: [], impactScope: 'me' }, 'low', null],
    [
      'battery safety raises to critical',
      { aiUrgency: 'low', matchedRules: ['safety_battery'], impactScope: 'me' },
      'critical',
      'safety_battery',
    ],
    [
      'electrical safety raises to critical',
      { aiUrgency: 'medium', matchedRules: ['safety_electrical'], impactScope: 'unknown' },
      'critical',
      'safety_electrical',
    ],
    [
      'org-wide impact raises to high',
      { aiUrgency: 'low', matchedRules: [], impactScope: 'org' },
      'high',
      'impact_org_wide',
    ],
    [
      'a floor never lowers the AI urgency',
      { aiUrgency: 'critical', matchedRules: [], impactScope: 'org' },
      'critical',
      null,
    ],
    [
      'AI urgency already at the floor: no floor applied',
      { aiUrgency: 'high', matchedRules: [], impactScope: 'org' },
      'high',
      null,
    ],
    [
      'sensitive rule IDs do not set priority',
      { aiUrgency: 'low', matchedRules: ['harassment'], impactScope: 'me' },
      'low',
      null,
    ],
    [
      'safety and impact together: the highest floor wins',
      { aiUrgency: 'low', matchedRules: ['safety_battery'], impactScope: 'org' },
      'critical',
      'safety_battery',
    ],
  ])('%s', (_label, input, priority, floorApplied) => {
    expect(applyPriorityFloor(input, floors)).toEqual({ priority, floorApplied });
  });

  it('the highest floor wins regardless of rule order', () => {
    const reversed = [...floors].reverse();
    expect(
      applyPriorityFloor(
        { aiUrgency: 'low', matchedRules: ['safety_battery'], impactScope: 'org' },
        reversed,
      ),
    ).toEqual({ priority: 'critical', floorApplied: 'safety_battery' });
  });

  it('every safety floor in the committed config is critical (contract: safety → critical)', () => {
    const safety = floors.filter((f) => f.kind === 'safety');
    expect(safety.length).toBeGreaterThan(0);
    expect(safety.every((f) => f.floor === 'critical')).toBe(true);
    expect(PRIORITIES.at(-1)).toBe('critical');
  });
});

describe('ticket state machine', () => {
  const allowed: [TicketStatus, TicketStatus][] = Object.entries(TRANSITIONS).flatMap(
    ([from, tos]) => tos.map((to) => [from as TicketStatus, to] as [TicketStatus, TicketStatus]),
  );

  it.each([
    ['new', 'in_progress', true],
    ['new', 'waiting_on_employee', true],
    ['new', 'resolved', true],
    ['new', 'closed', false],
    ['in_progress', 'waiting_on_employee', true],
    ['in_progress', 'resolved', true],
    ['in_progress', 'new', false],
    ['in_progress', 'closed', false],
    ['waiting_on_employee', 'in_progress', true],
    ['waiting_on_employee', 'resolved', true],
    ['waiting_on_employee', 'closed', false],
    ['resolved', 'closed', true],
    ['resolved', 'in_progress', true],
    ['resolved', 'new', false],
    ['closed', 'in_progress', false],
    ['closed', 'resolved', false],
  ] as [TicketStatus, TicketStatus, boolean][])('%s → %s: %s', (from, to, ok) => {
    expect(canTransition(from, to)).toBe(ok);
  });

  it('covers every status, never transitions to itself, and closed is final', () => {
    expect(Object.keys(TRANSITIONS).sort()).toEqual([...TICKET_STATUSES].sort());
    expect(allowed.some(([a, b]) => a === b)).toBe(false);
    expect(TRANSITIONS.closed).toEqual([]);
    expect(allowed.some(([, to]) => to === 'new')).toBe(false);
  });

  it('isOpen: everything except resolved and closed', () => {
    expect(TICKET_STATUSES.filter(isOpen)).toEqual(['new', 'in_progress', 'waiting_on_employee']);
  });
});

describe('ticket schemas', () => {
  const schemas = config.ticketSchemas.schemas;

  it('every category has a schema; all but the confidential HR category have a required field', () => {
    for (const c of config.taxonomy.categories) {
      const fields = fieldsFor(schemas, c.id);
      // Sensitive cases get no AI field extraction (contract flow 6): an empty schema.
      if (c.id === 'employee_relations') expect(fields).toEqual([]);
      else expect(fields.some((f) => f.required)).toBe(true);
    }
  });

  it.each([
    ['hardware', {}, ['device_model', 'symptoms']],
    ['hardware', { device_model: 'ThinkPad T14', symptoms: 'battery swells' }, []],
    ['hardware', { device_model: 'unknown', symptoms: '  ' }, ['device_model', 'symptoms']],
    ['hardware', { device_model: 'UNKNOWN', symptoms: 'fan noise' }, ['device_model']],
    ['access', { system: 'Finance SharePoint' }, ['business_reason']],
    ['leave', { leave_type: 'parental', question: 'how long?' }, []],
  ] as [string, Record<string, string>, string[]][])(
    '%s %j → missing %j',
    (category, values, missing) => {
      expect(requiredMissing(schemas, category, values)).toEqual(missing);
    },
  );

  it('normalises to exactly the schema fields, in order, with "unknown" for absent values', () => {
    expect(
      normaliseFields(schemas, 'software', {
        symptoms: ' crashes on start ',
        application: 'Excel 365',
        invented: 'x',
      }),
    ).toEqual({ application: 'Excel 365', symptoms: 'crashes on start', error_message: UNKNOWN });
  });

  it('an unknown category is a programming error', () => {
    expect(() => fieldsFor(schemas, 'catering')).toThrow(
      'no ticket schema for category "catering"',
    );
  });
});

describe('duplicate check', () => {
  const now = new Date('2026-10-06T12:00:00Z');
  const daysAgo = (d: number) => new Date(now.getTime() - d * 24 * 60 * 60 * 1000);
  const ticket = (over: Partial<DuplicateCandidate>): DuplicateCandidate => ({
    id: 't1',
    requesterId: 'u1',
    category: 'hardware',
    status: 'new',
    createdAt: daysAgo(1),
    ...over,
  });
  const check = (tickets: DuplicateCandidate[]) =>
    findDuplicate({ requesterId: 'u1', category: 'hardware' }, tickets, {
      now,
      windowDays: config.thresholds.ticket.duplicateWindowDays,
    });

  it.each<[string, Partial<DuplicateCandidate>, boolean]>([
    ['same requester, category, open, recent', {}, true],
    ['waiting on employee is still open', { status: 'waiting_on_employee' }, true],
    ['exactly 7 days old is within the window', { createdAt: daysAgo(7) }, true],
    ['older than 7 days', { createdAt: daysAgo(7.01) }, false],
    ['resolved', { status: 'resolved' }, false],
    ['closed', { status: 'closed' }, false],
    ['another requester', { requesterId: 'u2' }, false],
    ['another category', { category: 'software' }, false],
  ])('%s → %s', (_label, over, isDuplicate) => {
    expect(check([ticket(over)]) !== null).toBe(isDuplicate);
  });

  it('offers the newest open match', () => {
    const found = check([
      ticket({ id: 'old', createdAt: daysAgo(5) }),
      ticket({ id: 'new', createdAt: daysAgo(1) }),
      ticket({ id: 'mid', createdAt: daysAgo(3) }),
    ]);
    expect(found?.id).toBe('new');
    expect(check([])).toBeNull();
  });
});

describe('W3-03 additions', () => {
  it('unknownEditKeys: only the category fields may be edited (never requester, queue or priority)', () => {
    const schemas = config.ticketSchemas.schemas;
    expect(unknownEditKeys(schemas, 'hardware', { device_model: 'X', symptoms: 'Y' })).toEqual([]);
    expect(
      unknownEditKeys(schemas, 'hardware', {
        requesterId: 'u2',
        queue: 'hr_case',
        priority: 'critical',
        device_model: 'X',
      }),
    ).toEqual(['requesterId', 'queue', 'priority']);
    // Restricted cases have no fields: any edit is rejected.
    expect(unknownEditKeys(schemas, 'employee_relations', { question: 'x' })).toEqual(['question']);
  });

  it('restrictedCasePriority: critical for wellbeing, otherwise high (ADR-013)', () => {
    expect(restrictedCasePriority(['wellbeing'])).toBe('critical');
    expect(restrictedCasePriority(['harassment', 'wellbeing'])).toBe('critical');
    expect(restrictedCasePriority(['harassment'])).toBe('high');
    expect(restrictedCasePriority([])).toBe('high');
  });
});
