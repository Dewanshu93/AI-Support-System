// Enums shared by web and api (playbook sections 3–5). Each is a const tuple
// plus a Zod schema, so both sides validate against the same values.
import { z } from 'zod';

export const DOMAINS = ['IT', 'HR'] as const;
export type Domain = (typeof DOMAINS)[number];
export const DomainSchema = z.enum(DOMAINS);

/** Ordered lowest to highest; priority floors compare by index. */
export const PRIORITIES = ['low', 'medium', 'high', 'critical'] as const;
export type Priority = (typeof PRIORITIES)[number];
export const PrioritySchema = z.enum(PRIORITIES);

export const ROLES = ['employee', 'agent', 'admin'] as const;
export type Role = (typeof ROLES)[number];
export const RoleSchema = z.enum(ROLES);

// Employee profile attributes that drive document access (section 7).
export const COUNTRIES = ['US', 'UK'] as const;
export type Country = (typeof COUNTRIES)[number];
export const CountrySchema = z.enum(COUNTRIES);

export const EMPLOYMENT_TYPES = ['full_time', 'contractor'] as const;
export type EmploymentType = (typeof EMPLOYMENT_TYPES)[number];
export const EmploymentTypeSchema = z.enum(EMPLOYMENT_TYPES);

/** Ordered: a manager may read everything a standard employee can. */
export const ACCESS_LEVELS = ['standard', 'manager'] as const;
export type AccessLevel = (typeof ACCESS_LEVELS)[number];
export const AccessLevelSchema = z.enum(ACCESS_LEVELS);

/** The six turn decisions made by domain/decision-rules (section 5). */
export const DECISIONS = [
  'ANSWER',
  'PARTIAL',
  'CLARIFY',
  'ESCALATE',
  'OUT_OF_SCOPE',
  'SENSITIVE_HANDOFF',
] as const;
export type Decision = (typeof DECISIONS)[number];
export const DecisionSchema = z.enum(DECISIONS);

export const CONVERSATION_STATUSES = [
  'open',
  'resolved',
  'escalated',
  'handed_off',
  'abandoned',
] as const;
export type ConversationStatus = (typeof CONVERSATION_STATUSES)[number];
export const ConversationStatusSchema = z.enum(CONVERSATION_STATUSES);

export const MESSAGE_ROLES = ['user', 'assistant', 'system_event'] as const;
export type MessageRole = (typeof MESSAGE_ROLES)[number];
export const MessageRoleSchema = z.enum(MESSAGE_ROLES);

export const MESSAGE_STATUSES = ['complete', 'withdrawn', 'error'] as const;
export type MessageStatus = (typeof MESSAGE_STATUSES)[number];
export const MessageStatusSchema = z.enum(MESSAGE_STATUSES);

export const TICKET_STATUSES = [
  'new',
  'in_progress',
  'waiting_on_employee',
  'resolved',
  'closed',
] as const;
export type TicketStatus = (typeof TICKET_STATUSES)[number];
export const TicketStatusSchema = z.enum(TICKET_STATUSES);

export const TICKET_EVENT_TYPES = [
  'created',
  'reply',
  'note',
  'status_change',
  'classification_correction',
  'ai_draft_generated',
] as const;
export type TicketEventType = (typeof TICKET_EVENT_TYPES)[number];
export const TicketEventTypeSchema = z.enum(TICKET_EVENT_TYPES);

export const EVENT_VISIBILITIES = ['public', 'internal'] as const;
export type EventVisibility = (typeof EVENT_VISIBILITIES)[number];
export const EventVisibilitySchema = z.enum(EVENT_VISIBILITIES);

export const DOCUMENT_STATUSES = ['active', 'superseded', 'inactive'] as const;
export type DocumentStatus = (typeof DOCUMENT_STATUSES)[number];
export const DocumentStatusSchema = z.enum(DOCUMENT_STATUSES);

export const INGEST_STATUSES = ['pending', 'indexed', 'failed'] as const;
export type IngestStatus = (typeof INGEST_STATUSES)[number];
export const IngestStatusSchema = z.enum(INGEST_STATUSES);

export const SOURCE_TYPES = ['markdown', 'pdf'] as const;
export type SourceType = (typeof SOURCE_TYPES)[number];
export const SourceTypeSchema = z.enum(SOURCE_TYPES);

export const FEEDBACK_RATINGS = ['up', 'down'] as const;
export type FeedbackRating = (typeof FEEDBACK_RATINGS)[number];
export const FeedbackRatingSchema = z.enum(FEEDBACK_RATINGS);

export const EVAL_SUITES = ['retrieval', 'full', 'judge'] as const;
export type EvalSuite = (typeof EVAL_SUITES)[number];
export const EvalSuiteSchema = z.enum(EVAL_SUITES);

export const EVAL_RUN_STATUSES = ['queued', 'running', 'completed', 'failed'] as const;
export type EvalRunStatus = (typeof EVAL_RUN_STATUSES)[number];
export const EvalRunStatusSchema = z.enum(EVAL_RUN_STATUSES);
