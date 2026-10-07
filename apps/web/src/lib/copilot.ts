// Copilot entry points: suggested prompts and the link that opens the copilot
// chat with a question already sent.

export interface PromptSuggestion {
  group: 'Timesheets' | 'Pay' | 'Policies' | 'Requests';
  text: string;
}

export const COPILOT_SUGGESTIONS: PromptSuggestion[] = [
  { group: 'Pay', text: 'Why was my salary reduced last month?' },
  { group: 'Timesheets', text: 'Log 8 hours for the Banking Module yesterday' },
  { group: 'Timesheets', text: 'Which days am I missing on my timesheet?' },
  { group: 'Policies', text: 'What is the Loss of Pay policy?' },
  { group: 'Policies', text: 'I cannot access the VPN' },
  { group: 'Requests', text: 'Show my pending requests' },
];

/** /chat?q=… starts a new copilot conversation with this question. */
export const copilotHref = (question: string) => `/chat?q=${encodeURIComponent(question)}`;
