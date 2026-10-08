import { loadConfig } from '../../config';
import {
  NotificationSchema,
  PayslipSchema,
  TicketSchema,
  TimesheetEntrySchema,
} from '../../db/schemas';
import { loadSeedUsers } from '../users/seed';
import { buildMockHrData, buildMockRequests, lopDemoDay } from './seed';

const config = loadConfig({
  MONGODB_URI: 'mongodb://localhost:27017/servicedesk',
  JWT_SECRET: 'test-secret-that-is-at-least-32-bytes-long',
});
const users = loadSeedUsers().map((u) => ({ ...u, createdAt: new Date('2026-10-01T00:00:00Z') }));
const build = (today = '2026-10-07') => buildMockHrData({ users, today, workday: config.workday });
const priya = users.find((u) => u.email === 'priya.shah@example.com')!;

describe('mock HR data', () => {
  it('is deterministic for the same anchor date', () => {
    expect(JSON.stringify(build())).toBe(JSON.stringify(build()));
  });

  it('places the LOP demo day on a working day before the 12th of last month', () => {
    // 12 Sep 2026 is a Saturday, so the demo day is Friday 11 Sep.
    expect(lopDemoDay('2026-10-07', 'US', config.workday)).toBe('2026-09-11');
    expect(build().scenario).toMatchObject({
      lopDay: '2026-09-11',
      lopAmount: 400,
      missingThisWeek: '2026-10-06',
    });
  });

  it("leaves Priya's LOP day without hours and marks her absent", () => {
    const data = build();
    expect(
      data.timesheetEntries.some((e) => e.userId.equals(priya._id) && e.date === '2026-09-11'),
    ).toBe(false);
    expect(
      data.attendance.find((a) => a.userId.equals(priya._id) && a.date === '2026-09-11'),
    ).toMatchObject({
      status: 'absent',
    });
  });

  it('deducts LOP at 1/260 of salary on the next payslip, and the payslip balances', () => {
    const slips = build().payslips.filter((p) => p.userId.equals(priya._id));
    const lop = slips.find((p) => p.deductions.some((d) => d.code === 'lop'))!;
    expect(lop).toMatchObject({
      periodStart: '2026-09-16',
      periodEnd: '2026-09-30',
      payDate: '2026-09-30',
    });
    expect(lop.deductions.find((d) => d.code === 'lop')).toMatchObject({
      amount: 400,
      dates: ['2026-09-11'],
    });
    for (const slip of build().payslips) expect(PayslipSchema.safeParse(slip).success).toBe(true);
  });

  it('only pays full-time employees, never with a future pay date', () => {
    const data = build();
    const contractors = users.filter((u) => u.employmentType === 'contractor').map((u) => u._id);
    expect(data.payslips.some((p) => contractors.some((c) => c.equals(p.userId)))).toBe(false);
    expect(data.payslips.every((p) => p.payDate <= '2026-10-07')).toBe(true);
  });

  it('never logs time on weekends, holidays or in the future', () => {
    const data = build();
    for (const e of data.timesheetEntries) {
      expect(TimesheetEntrySchema.safeParse(e).success).toBe(true);
      expect(e.date < '2026-10-07').toBe(true);
      expect([0, 6]).not.toContain(new Date(`${e.date}T00:00:00Z`).getUTCDay());
    }
    // Labor Day: no US employee logs time.
    expect(
      data.timesheetEntries.some((e) => e.date === '2026-09-07' && e.userId.equals(priya._id)),
    ).toBe(false);
  });

  it('builds valid notifications and demo requests', () => {
    for (const n of build().notifications)
      expect(NotificationSchema.safeParse(n).success).toBe(true);
    const requests = buildMockRequests({ users, today: '2026-10-07', routing: config.routing });
    for (const t of requests.tickets) expect(TicketSchema.safeParse(t).success).toBe(true);
    expect(requests.tickets.map((t) => t.queue)).toEqual(['it_access', 'hr_general', 'hr_payroll']);
  });
});
