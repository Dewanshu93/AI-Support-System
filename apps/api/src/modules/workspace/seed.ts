// Mock HR data for the demo (UC-01): projects and tasks (mock task tracker),
// timesheets, attendance, payslips, notifications and a few requests. The data
// is generated deterministically from the seeded users and an anchor date
// ("today"), so a re-seed restores the same demo state. Synthetic only.
//
// Demo scenario (Build Contract v2.0 flow 5): Priya has no timesheet and no
// attendance record on the last working day on or before the 12th of the
// previous month; her next payslip carries a Loss of Pay deduction for it.
import { createHash } from 'node:crypto';
import type { Country, IsoDate, TaskStatus } from '@sd/shared';
import { type Collection, ObjectId } from 'mongodb';
import type { ConfigFiles } from '../../config/schemas';
import { validateForWrite } from '../../db/collections';
import {
  type AttendanceDoc,
  AttendanceSchema,
  type ConversationDoc,
  ConversationSchema,
  type MessageDoc,
  MessageSchema,
  type NotificationDoc,
  NotificationSchema,
  type PayslipDoc,
  PayslipSchema,
  type ProjectDoc,
  ProjectSchema,
  type TaskDoc,
  TaskSchema,
  type TicketDoc,
  type TicketEventDoc,
  TicketEventSchema,
  TicketSchema,
  type TimesheetEntryDoc,
  TimesheetEntrySchema,
  type UserDoc,
} from '../../db/schemas';
import {
  addDays,
  dateRange,
  dayOfWeek,
  firstDayOfMonth,
  holidayCalendar,
  isWorkingDay,
  payDateFor,
  payPeriodFor,
  workingDays,
} from '../../domain/workday';

/** Stable ObjectId from a seed key, so re-seeding keeps IDs (and links) unchanged. */
export const seedId = (key: string) =>
  new ObjectId(createHash('sha1').update(`mock-hr:${key}`).digest('hex').slice(0, 24));

export interface MockHrData {
  projects: ProjectDoc[];
  tasks: TaskDoc[];
  timesheetEntries: TimesheetEntryDoc[];
  attendance: AttendanceDoc[];
  payslips: PayslipDoc[];
  notifications: NotificationDoc[];
}

export interface MockRequests {
  conversations: ConversationDoc[];
  messages: MessageDoc[];
  tickets: TicketDoc[];
  ticketEvents: TicketEventDoc[];
}

// --- reference data -------------------------------------------------------------

const PRIYA = 'priya.shah@example.com';
const TOM = 'tom.clarke@example.com';
const OLIVIA = 'olivia.bennett@example.com';
const MARCUS = 'marcus.lee@example.com';
const RAVI = 'ravi.iyer@example.com';

const PROJECTS = [
  {
    code: 'BANK',
    name: 'Banking Module',
    client: 'Northwind Bank',
    color: '#4f46e5',
    members: [PRIYA, RAVI, MARCUS],
  },
  {
    code: 'API',
    name: 'API Integration',
    client: 'Northwind Bank',
    color: '#0891b2',
    members: [PRIYA, RAVI],
  },
  { code: 'BRAND', name: 'Brand Refresh', client: null, color: '#db2777', members: [TOM, OLIVIA] },
  {
    code: 'CLOSE',
    name: 'Quarter-End Close',
    client: null,
    color: '#059669',
    members: [OLIVIA, MARCUS],
  },
  { code: 'DATA', name: 'Data Platform', client: null, color: '#d97706', members: [MARCUS, RAVI] },
  {
    code: 'INT',
    name: 'Internal: Meetings & Training',
    client: null,
    color: '#64748b',
    members: [PRIYA, TOM, OLIVIA, MARCUS, RAVI],
  },
] as const;
type ProjectCode = (typeof PROJECTS)[number]['code'];

/** [key number, assignee, project, title, status, priority, due in days (null = none)] */
const TASKS: [
  number,
  string,
  ProjectCode,
  string,
  TaskStatus,
  'low' | 'medium' | 'high',
  number | null,
][] = [
  [123, PRIYA, 'BANK', 'Payment reconciliation service', 'in_progress', 'high', 2],
  [124, PRIYA, 'API', 'Partner webhook integration', 'done', 'medium', -3],
  [127, PRIYA, 'BANK', 'Fix flaky settlement tests', 'in_review', 'medium', 1],
  [131, PRIYA, 'BANK', 'Design review: account statements', 'todo', 'medium', 5],
  [135, PRIYA, 'INT', 'Upgrade Node runtime on build agents', 'todo', 'low', null],
  [140, TOM, 'BRAND', 'Autumn campaign landing page copy', 'in_progress', 'high', 3],
  [141, TOM, 'BRAND', 'Brand voice guide v2', 'todo', 'medium', 9],
  [142, TOM, 'BRAND', 'October newsletter', 'in_review', 'medium', 1],
  [150, OLIVIA, 'CLOSE', 'Q3 close checklist', 'in_progress', 'high', 2],
  [151, OLIVIA, 'INT', 'Approve team leave plan for Q4', 'todo', 'medium', 6],
  [152, OLIVIA, 'BRAND', 'Brand budget sign-off', 'in_review', 'medium', 4],
  [160, MARCUS, 'DATA', 'Churn dashboard data model', 'in_progress', 'high', 4],
  [161, MARCUS, 'BANK', 'Banking KPI extract', 'todo', 'medium', 8],
  [162, MARCUS, 'CLOSE', 'Close reconciliations', 'done', 'medium', -2],
  [170, RAVI, 'BANK', 'Sprint planning: Banking Module', 'in_progress', 'medium', 1],
  [171, RAVI, 'API', 'API rate-limit design', 'in_review', 'high', 3],
  [172, RAVI, 'INT', 'Quarterly 1:1s and reviews', 'todo', 'medium', 10],
  [173, RAVI, 'DATA', 'Data platform hiring loop', 'todo', 'low', null],
];

/** How each employee's working day is split across projects (hours sum to 8). */
const DAY_SPLITS: Record<string, [ProjectCode, number][][]> = {
  [PRIYA]: [
    [
      ['BANK', 6],
      ['API', 2],
    ],
    [
      ['BANK', 7],
      ['INT', 1],
    ],
    [
      ['API', 5],
      ['BANK', 3],
    ],
  ],
  [TOM]: [
    [
      ['BRAND', 7],
      ['INT', 1],
    ],
    [['BRAND', 8]],
  ],
  [OLIVIA]: [
    [
      ['CLOSE', 5],
      ['BRAND', 2],
      ['INT', 1],
    ],
    [
      ['CLOSE', 6],
      ['INT', 2],
    ],
  ],
  [MARCUS]: [
    [
      ['DATA', 5],
      ['CLOSE', 3],
    ],
    [
      ['DATA', 4],
      ['BANK', 4],
    ],
  ],
  [RAVI]: [
    [
      ['BANK', 4],
      ['API', 2],
      ['INT', 2],
    ],
    [
      ['DATA', 3],
      ['BANK', 3],
      ['INT', 2],
    ],
  ],
};

/** Annual base salary of full-time employees (contractors are paid by their agency). */
const SALARIES: Record<string, number> = { [PRIYA]: 104_000, [OLIVIA]: 78_000, [RAVI]: 156_000 };

/** LOP daily rate = annual salary / 260 working days (corpus hr-loss-of-pay). */
export const LOP_WORKING_DAYS_PER_YEAR = 260;

const money = (n: number) => Math.round(n * 100) / 100;

// --- generation ------------------------------------------------------------------

export interface MockHrOptions {
  users: UserDoc[];
  today: IsoDate;
  workday: ConfigFiles['workday'];
}

/** Last working day on or before the 12th of the month before `today` (the LOP demo day). */
export function lopDemoDay(
  today: IsoDate,
  country: Country,
  workday: ConfigFiles['workday'],
): IsoDate {
  const holidays = holidayCalendar(workday.holidays[country]);
  let day = `${addDays(firstDayOfMonth(today), -1).slice(0, 7)}-12`;
  while (!isWorkingDay(day, holidays)) day = addDays(day, -1);
  return day;
}

export function buildMockHrData({ users, today, workday }: MockHrOptions): MockHrData & {
  scenario: {
    lopUser: string;
    lopDay: IsoDate;
    lopAmount: number;
    missingThisWeek: IsoDate | null;
  };
} {
  const at = (date: IsoDate, hour = 9) =>
    new Date(`${date}T${String(hour).padStart(2, '0')}:00:00Z`);
  const byEmail = new Map(users.map((u) => [u.email, u]));
  const user = (email: string) => {
    const u = byEmail.get(email);
    if (!u) throw new Error(`mock HR data needs seeded user ${email}`);
    return u;
  };
  const employees = [PRIYA, TOM, OLIVIA, MARCUS, RAVI].map(user);

  const projects: ProjectDoc[] = PROJECTS.map((p) => ({
    _id: seedId(`project:${p.code}`),
    code: p.code,
    name: p.name,
    client: p.client,
    color: p.color,
    memberIds: p.members.map((m) => user(m)._id),
    active: true,
    createdAt: new Date('2026-01-05T09:00:00Z'),
  }));
  const projectId = (code: ProjectCode) => projects.find((p) => p.code === code)!._id;

  const tasks: TaskDoc[] = TASKS.map(([n, email, code, title, status, priority, due]) => ({
    _id: seedId(`task:${n}`),
    key: `PROJ-${n}`,
    projectId: projectId(code),
    assigneeId: user(email)._id,
    title,
    status,
    priority,
    dueDate: due === null ? null : addDays(today, due),
    createdAt: at(addDays(today, -20)),
    updatedAt: at(addDays(today, status === 'done' ? (due ?? -1) : -1), 15),
  }));

  // Timesheets and attendance from the first day of the previous month to yesterday.
  const from = firstDayOfMonth(addDays(firstDayOfMonth(today), -1));
  const yesterday = addDays(today, -1);
  const lopDay = lopDemoDay(today, 'US', workday);
  const usHolidays = holidayCalendar(workday.holidays.US);
  // Priya's most recent past working day this week is left empty (dashboard "!").
  const priyaMissing =
    workingDays(addDays(today, -((dayOfWeek(today) + 6) % 7)), yesterday, usHolidays).at(-1) ??
    null;
  // Tom logged only half a day on last week's Wednesday; Ravi was on leave for two days last month.
  const tomPartial = addDays(addDays(today, -((dayOfWeek(today) + 6) % 7)), -5);
  const raviLeave = new Set(
    [addDays(lopDay, 10), addDays(lopDay, 11)].filter((d) => isWorkingDay(d, usHolidays)),
  );

  const timesheetEntries: TimesheetEntryDoc[] = [];
  const attendance: AttendanceDoc[] = [];
  for (const employee of employees) {
    const holidays = holidayCalendar(workday.holidays[employee.country]);
    const splits = DAY_SPLITS[employee.email]!;
    dateRange(from, yesterday).forEach((date, index) => {
      if (!isWorkingDay(date, holidays)) {
        if (holidays.has(date)) {
          attendance.push({
            _id: seedId(`att:${employee.email}:${date}`),
            userId: employee._id,
            date,
            status: 'holiday',
            note: holidays.get(date)!,
          });
        }
        return;
      }
      const isPriya = employee.email === PRIYA;
      if (isPriya && date === lopDay) {
        attendance.push({
          _id: seedId(`att:${employee.email}:${date}`),
          userId: employee._id,
          date,
          status: 'absent',
          note: 'No badge-in or timesheet recorded',
        });
        return;
      }
      if (employee.email === RAVI && raviLeave.has(date)) {
        attendance.push({
          _id: seedId(`att:${employee.email}:${date}`),
          userId: employee._id,
          date,
          status: 'leave',
          note: 'Annual leave',
        });
        return;
      }
      const remote = [1, 5].includes(dayOfWeek(date));
      attendance.push({
        _id: seedId(`att:${employee.email}:${date}`),
        userId: employee._id,
        date,
        status: remote ? 'remote' : 'present',
        note: null,
      });
      if (isPriya && date === priyaMissing) return; // attended, but no timesheet yet
      const split = splits[index % splits.length]!;
      const halfDay = employee.email === TOM && date === tomPartial;
      for (const [code, hours] of halfDay ? [[split[0]![0], 4] as [ProjectCode, number]] : split) {
        timesheetEntries.push({
          _id: seedId(`ts:${employee.email}:${date}:${code}`),
          userId: employee._id,
          date,
          projectId: projectId(code),
          hours,
          note: null,
          source: 'seed',
          late: false,
          createdAt: at(date, 17),
          updatedAt: at(date, 17),
        });
      }
    });
  }

  // Payslips: full-time employees, every period paid on or before today, starting two months back.
  const payslips: PayslipDoc[] = [];
  let lopAmount = 0;
  for (const employee of employees.filter((e) => e.employmentType === 'full_time')) {
    const salary = SALARIES[employee.email]!;
    const holidays = holidayCalendar(workday.holidays[employee.country]);
    const periodsPerYear = employee.country === 'US' ? 24 : 12;
    const gross = money(salary / periodsPerYear);
    const daily = money(salary / LOP_WORKING_DAYS_PER_YEAR);
    const currency = employee.country === 'US' ? 'USD' : 'GBP';
    const lopPeriod =
      employee.email === PRIYA
        ? payPeriodFor(addDays(payPeriodFor(lopDay, 'US').end, 1), 'US')
        : null;

    let start = firstDayOfMonth(addDays(firstDayOfMonth(addDays(firstDayOfMonth(today), -1)), -1));
    while (start <= today) {
      const period = payPeriodFor(start, employee.country);
      const payDate = payDateFor(period, employee.country, holidays);
      start = addDays(period.end, 1);
      if (payDate > today) continue;

      const deductions: PayslipDoc['deductions'] = [];
      const line = (
        code: PayslipDoc['deductions'][number]['code'],
        label: string,
        amount: number,
      ) => deductions.push({ code, label, amount: money(amount), dates: [], note: null });
      if (employee.country === 'US') {
        line('tax', 'Federal and state income tax', gross * 0.16);
        line('social_security', 'Social Security and Medicare', gross * 0.0765);
        line('retirement', '401(k) contribution (5%)', gross * 0.05);
        line('health', 'Medical plan premium', 120);
      } else {
        line('tax', 'Income tax (PAYE)', gross * 0.18);
        line('social_security', 'National Insurance', gross * 0.08);
        line('retirement', 'Pension contribution (5%)', gross * 0.05);
      }
      if (lopPeriod && period.start === lopPeriod.start) {
        lopAmount = daily;
        deductions.push({
          code: 'lop',
          label: 'Loss of Pay (1 day)',
          amount: daily,
          dates: [lopDay],
          note: 'No timesheet or attendance record at the payroll cutoff',
        });
      }
      const totalDeductions = money(deductions.reduce((s, d) => s + d.amount, 0));
      payslips.push({
        _id: seedId(`payslip:${employee.email}:${period.start}`),
        userId: employee._id,
        periodStart: period.start,
        periodEnd: period.end,
        payDate,
        currency,
        earnings: [{ code: 'base', label: 'Base salary', amount: gross }],
        deductions,
        gross,
        net: money(gross - totalDeductions),
        createdAt: at(addDays(payDate, -2), 8),
      });
    }
  }

  // Notifications.
  const notifications: NotificationDoc[] = [];
  const notify = (email: string, key: string, n: Omit<NotificationDoc, '_id' | 'userId'>) =>
    notifications.push({ _id: seedId(`notif:${email}:${key}`), userId: user(email)._id, ...n });
  const fmt = (d: IsoDate) =>
    new Date(`${d}T00:00:00Z`).toLocaleDateString('en-GB', {
      weekday: 'short',
      day: 'numeric',
      month: 'short',
      timeZone: 'UTC',
    });
  const symbol = (c: string) => (c === 'USD' ? '$' : '£');

  for (const slip of payslips) {
    const email = employees.find((e) => e._id.equals(slip.userId))!.email;
    const latest = payslips
      .filter((p) => p.userId.equals(slip.userId))
      .sort((a, b) => b.payDate.localeCompare(a.payDate))[0]!;
    const lop = slip.deductions.find((d) => d.code === 'lop');
    if (slip !== latest && !lop) continue;
    notify(email, `payslip:${slip.periodStart}`, {
      kind: 'payroll',
      title: lop ? 'Salary reduced: Loss of Pay deduction' : 'Your payslip is ready',
      body: lop
        ? `Your payslip paid ${fmt(slip.payDate)} includes a Loss of Pay deduction of ${symbol(slip.currency)}${lop.amount.toFixed(2)} for ${fmt(lop.dates[0]!)}.`
        : `Net pay ${symbol(slip.currency)}${slip.net.toFixed(2)} for ${fmt(slip.periodStart)} – ${fmt(slip.periodEnd)}.`,
      link: '/payroll',
      readAt: null,
      createdAt: slip.createdAt,
    });
  }
  if (priyaMissing) {
    notify(PRIYA, `ts-missing:${priyaMissing}`, {
      kind: 'timesheet',
      title: `Timesheet missing for ${fmt(priyaMissing)}`,
      body: 'Log your hours so this day is not treated as unpaid at the payroll cutoff.',
      link: '/timesheets',
      readAt: null,
      createdAt: at(today, 8),
    });
  }
  notify(TOM, `ts-partial:${tomPartial}`, {
    kind: 'timesheet',
    title: `Only 4 hours logged on ${fmt(tomPartial)}`,
    body: 'Contractor hours are approved weekly by your agency. Complete the day if you worked more.',
    link: '/timesheets',
    readAt: null,
    createdAt: at(addDays(tomPartial, 1), 8),
  });
  for (const [n, email] of [
    [131, PRIYA],
    [141, TOM],
    [151, OLIVIA],
    [161, MARCUS],
    [172, RAVI],
  ] as const) {
    notify(email, `task:${n}`, {
      kind: 'task',
      title: `PROJ-${n} assigned to you`,
      body: TASKS.find((t) => t[0] === n)![3],
      link: '/tasks',
      readAt: at(addDays(today, -2), 10),
      createdAt: at(addDays(today, -3), 11),
    });
  }

  return {
    projects,
    tasks,
    timesheetEntries,
    attendance,
    payslips,
    notifications,
    scenario: { lopUser: PRIYA, lopDay, lopAmount, missingThisWeek: priyaMissing },
  };
}

/** Two demo requests for Priya and one for Tom, each with its originating conversation. */
export function buildMockRequests({
  users,
  today,
  routing,
}: {
  users: UserDoc[];
  today: IsoDate;
  routing: ConfigFiles['routing'];
}): MockRequests & { notifications: NotificationDoc[] } {
  const out: MockRequests & { notifications: NotificationDoc[] } = {
    conversations: [],
    messages: [],
    tickets: [],
    ticketEvents: [],
    notifications: [],
  };
  const at = (days: number, hour: number) =>
    new Date(`${addDays(today, days)}T${String(hour).padStart(2, '0')}:00:00Z`);
  const specs: {
    key: string;
    email: string;
    humanId: string;
    domain: 'IT' | 'HR';
    category: string;
    subcategory: string;
    status: 'in_progress' | 'resolved' | 'waiting_on_employee';
    priority: 'low' | 'medium';
    created: number;
    updated: number;
    ask: string;
    summary: string;
    fields: Record<string, string>;
    update: string;
  }[] = [
    {
      key: 'vpn',
      email: PRIYA,
      humanId: 'IT-9001',
      domain: 'IT' as const,
      category: 'access',
      subcategory: 'new_access',
      status: 'in_progress' as const,
      priority: 'medium' as const,
      created: -3,
      updated: -1,
      ask: 'I need VPN access for the Northwind Bank staging environment.',
      summary: 'VPN access for Northwind Bank staging',
      fields: {
        system: 'Northwind Bank staging VPN profile',
        access_level: 'Developer',
        business_reason: 'Payment reconciliation work on PROJ-123',
        manager_approval: 'Approved by Ravi Iyer',
      },
      update: 'IT is setting up your VPN profile. Expect access within 1 working day.',
    },
    {
      key: 'parental',
      email: PRIYA,
      humanId: 'HR-9001',
      domain: 'HR' as const,
      category: 'leave',
      subcategory: 'parental_leave',
      status: 'resolved' as const,
      priority: 'low' as const,
      created: -12,
      updated: -9,
      ask: 'Can HR confirm how my parental leave would be paid if it starts in January?',
      summary: 'Parental leave pay from January',
      fields: {
        leave_type: 'parental',
        dates: 'From January 2027',
        question: 'How the leave is paid',
      },
      update: 'Answered: 16 weeks fully paid under policy 3.0. Marked resolved.',
    },
    {
      key: 'agency',
      email: TOM,
      humanId: 'HR-9002',
      domain: 'HR' as const,
      category: 'payroll',
      subcategory: 'payslip',
      status: 'waiting_on_employee' as const,
      priority: 'low' as const,
      created: -5,
      updated: -2,
      ask: 'Who do I ask about my contractor timesheet approval?',
      summary: 'Contractor timesheet approval contact',
      fields: { pay_period: 'Last week', question: 'Who approves contractor timesheets' },
      update: 'Please confirm the name of your agency so we can share the right contact.',
    },
  ];
  for (const s of specs) {
    const requester = users.find((u) => u.email === s.email)!;
    const conversationId = seedId(`conv:${s.key}`);
    const ticketId = seedId(`ticket:${s.key}`);
    const created = at(s.created, 10);
    const updated = at(s.updated, 14);
    const queue = routing.routes[s.category]!;
    out.conversations.push({
      _id: conversationId,
      userId: requester._id,
      title: s.summary,
      status: 'escalated',
      resolution: null,
      ticketId,
      restricted: false,
      lastDecision: 'ESCALATE',
      turnCount: 1,
      isEval: false,
      createdAt: created,
      updatedAt: created,
    });
    out.messages.push(
      {
        _id: seedId(`msg:${s.key}:1`),
        conversationId,
        role: 'user',
        content: s.ask,
        decision: null,
        reasonCode: null,
        citations: [],
        uncovered: [],
        ticketDraft: null,
        status: 'complete',
        isEval: false,
        createdAt: created,
      },
      {
        _id: seedId(`msg:${s.key}:2`),
        conversationId,
        role: 'assistant',
        content: 'I have prepared a request for the team. Please review it before it is sent.',
        decision: 'ESCALATE',
        reasonCode: 'USER_REQUESTED',
        citations: [],
        uncovered: [],
        ticketDraft: null,
        status: 'complete',
        isEval: false,
        createdAt: new Date(created.getTime() + 60_000),
      },
    );
    out.tickets.push({
      _id: ticketId,
      humanId: s.humanId,
      conversationId,
      requesterId: requester._id,
      requesterSnapshot: {
        name: requester.name,
        email: requester.email,
        country: requester.country,
        employmentType: requester.employmentType,
        department: requester.department,
      },
      domain: s.domain,
      category: s.category,
      subcategory: s.subcategory,
      queue,
      priority: s.priority,
      aiUrgency: s.priority,
      priorityFloorApplied: null,
      status: s.status,
      summary: s.summary,
      agentBrief: '',
      fields: s.fields,
      aiFilledFields: Object.keys(s.fields),
      articlesShown: [],
      restricted: false,
      duplicateOf: null,
      isEval: false,
      createdAt: created,
      updatedAt: updated,
      resolvedAt: s.status === 'resolved' ? updated : null,
    });
    out.ticketEvents.push(
      {
        _id: seedId(`ev:${s.key}:created`),
        ticketId,
        actorId: requester._id,
        type: 'created',
        visibility: 'public',
        body: null,
        field: null,
        oldValue: null,
        newValue: null,
        createdAt: created,
      },
      {
        _id: seedId(`ev:${s.key}:status`),
        ticketId,
        actorId: null,
        type: 'status_change',
        visibility: 'public',
        body: s.update,
        field: null,
        oldValue: 'new',
        newValue: s.status,
        createdAt: updated,
      },
    );
    out.notifications.push({
      _id: seedId(`notif:${s.email}:request:${s.key}`),
      userId: requester._id,
      kind: 'request',
      title: `${s.humanId} ${s.status === 'resolved' ? 'resolved' : s.status === 'waiting_on_employee' ? 'needs your reply' : 'is under review'}`,
      body: s.update,
      link: `/tickets/${ticketId.toHexString()}`,
      readAt: s.status === 'resolved' ? updated : null,
      createdAt: updated,
    });
  }
  return out;
}

// --- writing --------------------------------------------------------------------

export interface MockHrCollections {
  projects: Collection<ProjectDoc>;
  tasks: Collection<TaskDoc>;
  timesheetEntries: Collection<TimesheetEntryDoc>;
  attendance: Collection<AttendanceDoc>;
  payslips: Collection<PayslipDoc>;
  notifications: Collection<NotificationDoc>;
  conversations: Collection<ConversationDoc>;
  messages: Collection<MessageDoc>;
  tickets: Collection<TicketDoc>;
  ticketEvents: Collection<TicketEventDoc>;
}

/**
 * Restores the demo state: the employees' timesheets, attendance, payslips and
 * notifications are replaced; projects, tasks and demo requests are upserted
 * by their stable IDs. Running it twice gives the same result.
 */
export async function seedMockHr(
  c: MockHrCollections,
  data: MockHrData,
  requests: MockRequests & { notifications: NotificationDoc[] },
  employeeIds: ObjectId[],
): Promise<Record<string, number>> {
  const check = <T>(name: string, schema: { safeParse: (d: unknown) => unknown }, docs: T[]) =>
    docs.map((d) => validateForWrite(name, schema as never, d) as T);
  const upsertAll = async <T extends { _id: ObjectId }>(col: Collection<T>, docs: T[]) => {
    if (docs.length === 0) return;
    await col.bulkWrite(
      docs.map((d) => ({
        replaceOne: { filter: { _id: d._id } as never, replacement: d, upsert: true },
      })),
    );
  };
  const replaceFor = async <T extends { userId: ObjectId }>(col: Collection<T>, docs: T[]) => {
    await col.deleteMany({ userId: { $in: employeeIds } } as never);
    if (docs.length > 0) await col.insertMany(docs as never);
  };

  const projects = check('projects', ProjectSchema, data.projects);
  const tasks = check('tasks', TaskSchema, data.tasks);
  await upsertAll(c.projects, projects);
  await c.tasks.deleteMany({
    assigneeId: { $in: employeeIds },
    _id: { $nin: tasks.map((t) => t._id) },
  });
  await upsertAll(c.tasks, tasks);
  await replaceFor(
    c.timesheetEntries,
    check('timesheet_entries', TimesheetEntrySchema, data.timesheetEntries),
  );
  await replaceFor(c.attendance, check('attendance', AttendanceSchema, data.attendance));
  await replaceFor(c.payslips, check('payslips', PayslipSchema, data.payslips));
  await replaceFor(
    c.notifications,
    check('notifications', NotificationSchema, [...data.notifications, ...requests.notifications]),
  );
  await upsertAll(
    c.conversations,
    check('conversations', ConversationSchema, requests.conversations),
  );
  await upsertAll(c.messages, check('messages', MessageSchema, requests.messages));
  await upsertAll(c.tickets, check('tickets', TicketSchema, requests.tickets));
  await upsertAll(c.ticketEvents, check('ticket_events', TicketEventSchema, requests.ticketEvents));

  return {
    projects: projects.length,
    tasks: tasks.length,
    timesheetEntries: data.timesheetEntries.length,
    attendance: data.attendance.length,
    payslips: data.payslips.length,
    notifications: data.notifications.length + requests.notifications.length,
    requests: requests.tickets.length,
  };
}
