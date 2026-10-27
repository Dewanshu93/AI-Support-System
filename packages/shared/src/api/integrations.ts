// Connected apps (UC-18, UC-19; ADR-032, ADR-033): each employee connects their own
// account on each tool through that tool's sign-in page. The app only reads; changes
// are made in the tool through the links.
import { z } from 'zod';

export const INTEGRATION_PROVIDERS = ['jira', 'github'] as const;
export type IntegrationProvider = (typeof INTEGRATION_PROVIDERS)[number];
export const IntegrationProviderSchema = z.enum(INTEGRATION_PROVIDERS);

export const INTEGRATION_LABEL: Record<IntegrationProvider, string> = {
  jira: 'Jira',
  github: 'GitHub',
};

export const IntegrationStatusSchema = z.object({
  provider: IntegrationProviderSchema,
  /** False when the server has no client credentials for this tool. */
  available: z.boolean(),
  connected: z.boolean(),
  /** The connected account: Jira site, GitHub login. */
  accountName: z.string().nullable(),
  accountUrl: z.url().nullable(),
  connectedAt: z.string().nullable(),
});
export type IntegrationStatus = z.infer<typeof IntegrationStatusSchema>;

export const IntegrationListResponseSchema = z.object({
  items: z.array(IntegrationStatusSchema),
});
export type IntegrationListResponse = z.infer<typeof IntegrationListResponseSchema>;

export const IntegrationParamsSchema = z.object({ provider: IntegrationProviderSchema });
export type IntegrationParams = z.infer<typeof IntegrationParamsSchema>;

/** The tool's redirect back to the app: a code on success, an error when declined. */
export const OAuthCallbackQuerySchema = z.object({
  state: z.string().min(1).max(200),
  code: z.string().min(1).max(2000).optional(),
  error: z.string().max(200).optional(),
  error_description: z.string().max(1000).optional(),
});
export type OAuthCallbackQuery = z.infer<typeof OAuthCallbackQuerySchema>;

/** Result shown after the callback (`?<provider>=<result>`). */
export const CONNECT_RESULTS = ['connected', 'declined', 'failed', 'no_site'] as const;
export type ConnectResult = (typeof CONNECT_RESULTS)[number];

/** Why a connected app shows nothing: sign in again, or the tool is unreachable. */
export const IntegrationProblemSchema = z.enum(['unreachable', 'reconnect']);
export type IntegrationProblem = z.infer<typeof IntegrationProblemSchema>;

// --- GitHub (UC-19) -------------------------------------------------------------

export const GITHUB_ITEM_KINDS = ['review_request', 'pull_request', 'issue'] as const;
export type GithubItemKind = (typeof GITHUB_ITEM_KINDS)[number];

export const GithubItemSchema = z.object({
  id: z.string(),
  kind: z.enum(GITHUB_ITEM_KINDS),
  /** owner/name */
  repo: z.string(),
  number: z.number().int().positive(),
  title: z.string(),
  url: z.url(),
  draft: z.boolean(),
  updatedAt: z.string(),
});
export type GithubItem = z.infer<typeof GithubItemSchema>;

export const GithubWorkResponseSchema = z.object({
  connected: z.boolean(),
  accountName: z.string().nullable(),
  problem: IntegrationProblemSchema.nullable(),
  /** Open pull requests waiting for the employee's review. */
  reviewRequests: z.array(GithubItemSchema),
  /** The employee's own open pull requests. */
  pullRequests: z.array(GithubItemSchema),
  /** Open issues assigned to the employee. */
  issues: z.array(GithubItemSchema),
});
export type GithubWorkResponse = z.infer<typeof GithubWorkResponseSchema>;
