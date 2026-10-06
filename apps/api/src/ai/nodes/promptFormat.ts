// Shared formatting of state into prompt variables (no names, emails or IDs).
import type { HistoryMessage, Profile } from '../graph/state';

/** Profile summary for prompts: country, employment type and department only. */
export function formatProfile(profile: Profile | null): string {
  if (!profile) return 'unknown';
  return `country ${profile.country}; employment type ${profile.employmentType}; department ${profile.department}`;
}

export function formatHistory(history: HistoryMessage[]): string {
  if (history.length === 0) return '(no earlier messages)';
  return history.map((m) => `${m.role}: ${m.content}`).join('\n');
}
