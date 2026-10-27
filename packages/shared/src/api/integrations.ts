// Connected tools (UC-18, ADR-032): each employee connects their own Jira Cloud
// account through Atlassian's sign-in page. The app only reads; changes are made in
// Jira through the issue links.
import { z } from 'zod';

export const INTEGRATION_PROVIDERS = ['jira'] as const;
export type IntegrationProvider = (typeof INTEGRATION_PROVIDERS)[number];

export const IntegrationStatusSchema = z.object({
  provider: z.enum(INTEGRATION_PROVIDERS),
  /** False when the server has no client credentials for this tool. */
  available: z.boolean(),
  connected: z.boolean(),
  siteName: z.string().nullable(),
  siteUrl: z.url().nullable(),
  connectedAt: z.string().nullable(),
});
export type IntegrationStatus = z.infer<typeof IntegrationStatusSchema>;

export const IntegrationListResponseSchema = z.object({
  items: z.array(IntegrationStatusSchema),
});
export type IntegrationListResponse = z.infer<typeof IntegrationListResponseSchema>;

/** Atlassian's redirect back to the app: a code on success, an error when declined. */
export const JiraCallbackQuerySchema = z.object({
  state: z.string().min(1).max(200),
  code: z.string().min(1).max(2000).optional(),
  error: z.string().max(200).optional(),
  error_description: z.string().max(1000).optional(),
});
export type JiraCallbackQuery = z.infer<typeof JiraCallbackQuerySchema>;

/** Result shown on the Tasks page after the callback (`?jira=`). */
export const JIRA_CONNECT_RESULTS = ['connected', 'declined', 'failed', 'no_site'] as const;
export type JiraConnectResult = (typeof JIRA_CONNECT_RESULTS)[number];
