// Leave rules (UC-11, ADR-025): working days of a request, balances and the
// checks every application passes, from the form and the copilot alike. Pure:
// no I/O, no model. Numbers come from config/workday.yaml (`leave`), which
// mirrors the leave policies in corpus/hr.
import type {
  Country,
  EmploymentType,
  IsoDate,
  LeaveBalance,
  LeaveStatus,
  LeaveType,
} from '@sd/shared';
import { LEAVE_TYPES } from '@sd/shared';
import type { ConfigFiles } from '../config/schemas';
import { addDays, type HolidayCalendar, workingDays } from './workday';

export type LeaveRules = ConfigFiles['workday']['leave'];

/** The parts of a stored request the rules need. */
export interface LeaveRecord {
  type: LeaveType;
  status: LeaveStatus;
  /** Working days covered, in order. */
  dates: IsoDate[];
}

/** Requests that hold days: approved ones and those waiting for approval. */
export const holdsDays = (status: LeaveStatus) => status === 'approved' || status === 'pending';

export const leaveYearOf = (date: IsoDate) => Number(date.slice(0, 4));

/** Balances for one calendar year: entitlement − approved − pending, per type. */
export function leaveBalances(
  rules: LeaveRules,
  country: Country,
  year: number,
  requests: readonly LeaveRecord[],
): LeaveBalance[] {
  const inYear = (r: LeaveRecord) => r.dates.filter((d) => leaveYearOf(d) === year).length;
  return LEAVE_TYPES.map((type) => {
    const ofType = requests.filter((r) => r.type === type);
    const used = ofType.filter((r) => r.status === 'approved').reduce((s, r) => s + inYear(r), 0);
    const pending = ofType.filter((r) => r.status === 'pending').reduce((s, r) => s + inYear(r), 0);
    const entitlement = rules.types[type].entitlement[country];
    return {
      type,
      label: rules.types[type].label,
      entitlement,
      used,
      pending,
      available: entitlement - used - pending,
    };
  });
}

export interface LeaveApplication {
  type: LeaveType;
  startDate: IsoDate;
  endDate: IsoDate;
}

export interface LeaveProblem {
  field: 'type' | 'startDate' | 'endDate';
  message: string;
}

export interface LeaveCheck {
  /** Working days the request would cover. */
  dates: IsoDate[];
  /** Blocking: the request cannot be made as it stands. */
  problems: LeaveProblem[];
  /** Policy reminders that do not block it. */
  warnings: string[];
  /** Balance for the type after this request. */
  availableAfter: number;
}

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`;

/** Checks an application against the leave rules and the employee's other requests. */
export function checkLeave(
  application: LeaveApplication,
  context: {
    today: IsoDate;
    country: Country;
    employmentType: EmploymentType;
    rules: LeaveRules;
    holidays: HolidayCalendar;
    /** The employee's other requests (any status). */
    existing: readonly LeaveRecord[];
  },
): LeaveCheck {
  const { type, startDate, endDate } = application;
  const { today, country, rules, holidays } = context;
  const typeRules = rules.types[type];
  const problems: LeaveProblem[] = [];
  const warnings: string[] = [];
  const dates = startDate <= endDate ? workingDays(startDate, endDate, holidays) : [];

  if (context.employmentType !== 'full_time') {
    problems.push({
      field: 'type',
      message:
        'contractors do not book leave here: agree time off with your manager and your agency',
    });
  }
  if (endDate < startDate) {
    problems.push({ field: 'endDate', message: 'must not be before the start date' });
  } else if (leaveYearOf(startDate) !== leaveYearOf(endDate)) {
    problems.push({ field: 'endDate', message: 'must be in the same calendar year as the start' });
  } else if (leaveYearOf(startDate) !== leaveYearOf(today)) {
    problems.push({
      field: 'startDate',
      message: `leave can be booked for ${leaveYearOf(today)} only (the current leave year)`,
    });
  } else if (dates.length === 0) {
    problems.push({ field: 'startDate', message: 'the dates contain no working days' });
  }

  if (type === 'sick') {
    const earliest = addDays(today, -(typeRules.maxBackDays ?? 0));
    if (endDate > today) {
      problems.push({ field: 'endDate', message: 'sick leave is recorded for today or past days' });
    }
    if (startDate < earliest) {
      problems.push({
        field: 'startDate',
        message: `sick leave can be recorded for the last ${typeRules.maxBackDays} days (from ${earliest})`,
      });
    }
  } else if (startDate < today) {
    problems.push({ field: 'startDate', message: `${typeRules.label} cannot start in the past` });
  }

  if (typeRules.maxConsecutiveDays !== undefined && dates.length > typeRules.maxConsecutiveDays) {
    problems.push({
      field: 'endDate',
      message:
        type === 'annual'
          ? `${typeRules.label} of more than ${typeRules.maxConsecutiveDays} working days needs the department head: raise an HR request instead`
          : `${typeRules.label} is at most ${plural(typeRules.maxConsecutiveDays, 'working day')} at a time`,
    });
  }

  const taken = new Set(
    context.existing.filter((r) => holdsDays(r.status)).flatMap((r) => r.dates),
  );
  const clash = dates.filter((d) => taken.has(d));
  if (clash.length > 0) {
    problems.push({
      field: 'startDate',
      message: `you already have leave on ${clash.join(', ')}`,
    });
  }

  const year = leaveYearOf(startDate);
  const balance = leaveBalances(rules, country, year, context.existing).find(
    (b) => b.type === type,
  )!;
  const availableAfter = balance.available - dates.length;
  if (dates.length > 0 && availableAfter < 0) {
    problems.push({
      field: 'endDate',
      message: `only ${plural(Math.max(balance.available, 0), 'day')} of ${typeRules.label.toLowerCase()} left in ${year}; days beyond your entitlement are Loss of Pay`,
    });
  }

  const notice = typeRules.notice?.[country];
  if (notice && dates.length > notice.overDays && startDate >= today) {
    const given = workingDays(addDays(today, 1), addDays(startDate, -1), holidays).length;
    if (given < notice.workingDays) {
      const needs = `${notice.workingDays} working ${notice.workingDays === 1 ? "day's" : "days'"} notice`;
      warnings.push(
        notice.overDays === 0
          ? `${typeRules.label} needs ${needs} except in an emergency: tell your manager as well.`
          : `${typeRules.label} of more than ${plural(notice.overDays, 'working day')} needs ${needs}; your manager may decline a late request.`,
      );
    }
  }
  const certificate = typeRules.certificateAfterDays?.[country];
  if (certificate !== undefined && dates.length > certificate) {
    warnings.push(`A doctor's note is needed after ${plural(certificate, 'consecutive day')}.`);
  }

  return { dates, problems, warnings, availableAfter };
}

/** The employee may cancel a request that is waiting, or approved and not started yet. */
export const canCancelLeave = (r: { status: LeaveStatus; dates: IsoDate[] }, today: IsoDate) =>
  r.status === 'pending' || (r.status === 'approved' && (r.dates[0] ?? today) > today);
