// Shared formatting of state into prompt variables (no names, emails or IDs).
import { withoutPayrollRecords } from '../../domain/workspaceReplies';
import type { HistoryMessage, Profile } from '../graph/state';

/** Profile summary for prompts: country, employment type and department only. */
export function formatProfile(profile: Profile | null): string {
  if (!profile) return 'unknown';
  return `country ${profile.country}; employment type ${profile.employmentType}; department ${profile.department}`;
}

/** Earlier turns for prompts; pay figures from payroll replies are left out (UC-06). */
export function formatHistory(history: HistoryMessage[]): string {
  if (history.length === 0) return '(no earlier messages)';
  return history
    .map(
      (m) => `${m.role}: ${m.role === 'assistant' ? withoutPayrollRecords(m.content) : m.content}`,
    )
    .join('\n');
}

/** The conversation for P-5: earlier turns, then the current message. */
export function formatConversation(history: HistoryMessage[], current: string): string {
  return [
    ...history.map(
      (m) => `${m.role}: ${m.role === 'assistant' ? withoutPayrollRecords(m.content) : m.content}`,
    ),
    `user: ${current}`,
  ].join('\n');
}

/** Ticket fields per category for P-5: "- category: key (description, required)". */
export function formatFieldSchemas(
  schemas: Record<string, { fields: { key: string; description: string; required: boolean }[] }>,
): string {
  return Object.entries(schemas)
    .filter(([, s]) => s.fields.length > 0)
    .map(
      ([category, s]) =>
        `- ${category}: ${s.fields.map((f) => `${f.key} (${f.description}, ${f.required ? 'required' : 'optional'})`).join('; ')}`,
    )
    .join('\n');
}
