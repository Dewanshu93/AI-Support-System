// Shared formatting of state into prompt variables (no names, emails or IDs).
import type { PromptName } from '../../config/schemas';
import { LANGUAGE_NAME, replyLanguageFor } from '../../domain/language';
import { withoutPayrollRecords } from '../../domain/workspaceReplies';
import type { HistoryMessage, Profile, State } from '../graph/state';
import type { PromptRegistry } from '../prompts/registry';

/**
 * `{ language }` for answer prompts that take it (UC-15, v2 and later), decided by
 * code from the setting and the message; `{}` for active versions without it, which
 * the registry would otherwise reject as an unknown variable.
 */
export function languageVariable(
  prompts: PromptRegistry,
  name: PromptName,
  state: Pick<State, 'profile' | 'input'>,
): { language?: string } {
  if (!prompts.get(name).variables.includes('language')) return {};
  return {
    language: LANGUAGE_NAME[replyLanguageFor(state.profile?.replyLanguage, state.input.text)],
  };
}

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
