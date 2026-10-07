// Display labels for ticket statuses and public events (employee views).
import type { TicketEventType, TicketStatus } from '@sd/shared';

export const STATUS_LABEL: Record<TicketStatus, string> = {
  new: 'New',
  in_progress: 'In progress',
  waiting_on_employee: 'Waiting on you',
  resolved: 'Resolved',
  closed: 'Closed',
};

export const STATUS_TONE: Record<TicketStatus, 'info' | 'warning' | 'success' | 'neutral'> = {
  new: 'info',
  in_progress: 'info',
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
};

export const formatDateTime = (iso: string) =>
  new Date(iso).toLocaleString('en-GB', { dateStyle: 'medium', timeStyle: 'short' });
