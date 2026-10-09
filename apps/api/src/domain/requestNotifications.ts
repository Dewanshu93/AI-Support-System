// Request notifications (UC-08; Build Contract v2.0 flow 7): what the employee
// sees in the bell when an agent changes their request or replies. Pure; the
// agent service writes the notification. Internal notes never notify.
import { REQUEST_STAGE_LABEL, type TicketStatus } from '@sd/shared';

export interface RequestRef {
  humanId: string;
  summary: string;
}

export interface RequestNotice {
  title: string;
  body: string;
}

/** The longest reply excerpt shown in a notification; the full reply is on the request. */
export const REPLY_EXCERPT_LENGTH = 140;

const STATUS_TITLE: Record<TicketStatus, (id: string) => string> = {
  new: (id) => `${id} is ${REQUEST_STAGE_LABEL.new.toLowerCase()}`,
  in_progress: (id) => `${id} is under review`,
  waiting_on_employee: (id) => `${id} needs your reply`,
  resolved: (id) => `${id} resolved`,
  closed: (id) => `${id} closed`,
};

export function statusNotice(request: RequestRef, to: TicketStatus): RequestNotice {
  return {
    title: STATUS_TITLE[to](request.humanId),
    body: `${request.summary} · now ${REQUEST_STAGE_LABEL[to]}`,
  };
}

/** One line, cut on a word boundary when possible. */
function excerpt(text: string, max: number): string {
  const flat = text.replace(/\s+/g, ' ').trim();
  if (flat.length <= max) return flat;
  const cut = flat.slice(0, max);
  const space = cut.lastIndexOf(' ');
  return `${(space > max / 2 ? cut.slice(0, space) : cut).trimEnd()}…`;
}

export function replyNotice(request: RequestRef, reply: string): RequestNotice {
  return {
    title: `The team replied on ${request.humanId}`,
    body: excerpt(reply, REPLY_EXCERPT_LENGTH),
  };
}
