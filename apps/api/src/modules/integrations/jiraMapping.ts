// Jira issue → workspace task (UC-18, ADR-032). Pure: status, priority and colour
// are decided here by code, never by Jira's display names alone.
import type { Task, TaskListQuery, TaskPriority, TaskStatus } from '@sd/shared';
import { z } from 'zod';

/** The fields requested from Jira search; anything else is ignored. */
export const JIRA_ISSUE_FIELDS = ['summary', 'status', 'priority', 'duedate', 'project', 'updated'];

const nameOnly = z.object({ name: z.string() }).loose();

export const JiraIssueSchema = z
  .object({
    id: z.string().min(1),
    key: z.string().min(1),
    fields: z
      .object({
        summary: z.string().default(''),
        status: z
          .object({
            name: z.string(),
            statusCategory: z.object({ key: z.string() }).loose().optional(),
          })
          .loose()
          .nullish(),
        priority: nameOnly.nullish(),
        duedate: z
          .string()
          .regex(/^\d{4}-\d{2}-\d{2}$/)
          .nullish(),
        project: z.object({ id: z.string(), key: z.string(), name: z.string() }).loose(),
        updated: z.string().nullish(),
      })
      .loose(),
  })
  .loose();
export type JiraIssue = z.infer<typeof JiraIssueSchema>;

export const JiraSearchResponseSchema = z
  .object({ issues: z.array(z.unknown()).default([]) })
  .loose();

/** Status category new / indeterminate / done; a status named like "review" is in review. */
export function jiraStatus(status: JiraIssue['fields']['status']): TaskStatus {
  const category = status?.statusCategory?.key;
  if (category === 'done') return 'done';
  if (/review/i.test(status?.name ?? '')) return 'in_review';
  if (category === 'indeterminate') return 'in_progress';
  return 'todo';
}

export function jiraPriority(priority: JiraIssue['fields']['priority']): TaskPriority {
  const name = priority?.name.toLowerCase() ?? '';
  if (name === 'highest' || name === 'high' || name === 'critical' || name === 'blocker') {
    return 'high';
  }
  if (name === 'low' || name === 'lowest' || name === 'minor' || name === 'trivial') return 'low';
  return 'medium';
}

const PROJECT_COLOURS = ['#2563eb', '#7c3aed', '#0891b2', '#059669', '#d97706', '#db2777'];

/** A stable chip colour per Jira project key. */
export function projectColour(key: string): string {
  let hash = 0;
  for (const ch of key) hash = (hash * 31 + ch.charCodeAt(0)) >>> 0;
  return PROJECT_COLOURS[hash % PROJECT_COLOURS.length]!;
}

export function toJiraTask(issue: JiraIssue, siteUrl: string): Task {
  const { fields } = issue;
  return {
    id: issue.id,
    key: issue.key,
    title: fields.summary || issue.key,
    status: jiraStatus(fields.status),
    priority: jiraPriority(fields.priority),
    project: {
      id: fields.project.id,
      code: fields.project.key,
      name: fields.project.name,
      color: projectColour(fields.project.key),
    },
    dueDate: fields.duedate ?? null,
    updatedAt: fields.updated ? new Date(fields.updated).toISOString() : new Date(0).toISOString(),
    source: 'jira',
    url: `${siteUrl.replace(/\/+$/, '')}/browse/${encodeURIComponent(issue.key)}`,
  };
}

/** Issues assigned to the signed-in Jira user; `open` leaves out done ones. */
export function myIssuesJql(view: TaskListQuery['view']): string {
  return view === 'open'
    ? 'assignee = currentUser() AND statusCategory != Done ORDER BY updated DESC'
    : 'assignee = currentUser() ORDER BY updated DESC';
}

/** Parses each issue on its own: one odd issue is skipped, not the whole list. */
export function parseIssues(body: unknown, siteUrl: string): Task[] {
  const parsed = JiraSearchResponseSchema.safeParse(body);
  if (!parsed.success) return [];
  return parsed.data.issues.flatMap((raw) => {
    const issue = JiraIssueSchema.safeParse(raw);
    return issue.success ? [toJiraTask(issue.data, siteUrl)] : [];
  });
}
