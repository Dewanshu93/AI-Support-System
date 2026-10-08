// Display labels for ticket statuses and public events (employee views).
import { REQUEST_STAGE_LABEL, type TicketEventType, type TicketStatus } from '@sd/shared';

/** Employee-facing stages (Build Contract v2.0, section G). */
export const STATUS_LABEL: Record<TicketStatus, string> = REQUEST_STAGE_LABEL;

export const STATUS_TONE: Record<
  TicketStatus,
  'info' | 'brand' | 'warning' | 'success' | 'neutral'
> = {
  new: 'info',
  in_progress: 'brand',
  waiting_on_employee: 'warning',
  resolved: 'success',
  closed: 'neutral',
};

export const EVENT_LABEL: Record<TicketEventType, string> = {
  created: 'Ticket created',
  reply: 'Reply from the team',
  note: 'Note',
  status_change: 'Status changed',
  classification_correction: 'Category updated',
  ai_draft_generated: 'Draft prepared',
  email_sent: 'Email sent',
};

export const formatDateTime = (iso: string) =>
  new Date(iso).toLocaleString('en-GB', { dateStyle: 'medium', timeStyle: 'short' });
