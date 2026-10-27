// GitHub search results → work items (UC-19, ADR-033). Pure: each query is fixed in
// code and always scoped to the signed-in user (@me).
import type { GithubItem, GithubItemKind } from '@sd/shared';
import { z } from 'zod';

/** Search query per list; `@me` is the user the token belongs to. */
export const GITHUB_QUERIES: Record<GithubItemKind, string> = {
  review_request: 'is:open is:pr review-requested:@me archived:false',
  pull_request: 'is:open is:pr author:@me archived:false',
  issue: 'is:open is:issue assignee:@me archived:false',
};

const SearchItemSchema = z
  .object({
    id: z.number(),
    number: z.number().int().positive(),
    title: z.string(),
    html_url: z.url(),
    repository_url: z.string(),
    updated_at: z.string(),
    draft: z.boolean().optional(),
  })
  .loose();

const SearchResponseSchema = z.object({ items: z.array(z.unknown()).default([]) }).loose();

/** owner/name from https://api.github.com/repos/owner/name */
export function repoName(repositoryUrl: string): string {
  const m = /\/repos\/([^/]+\/[^/]+)$/.exec(repositoryUrl);
  return m ? m[1]! : repositoryUrl;
}

/** Parses each item on its own: one odd item is skipped, not the whole list. */
export function parseSearch(body: unknown, kind: GithubItemKind): GithubItem[] {
  const parsed = SearchResponseSchema.safeParse(body);
  if (!parsed.success) return [];
  return parsed.data.items.flatMap((raw) => {
    const item = SearchItemSchema.safeParse(raw);
    if (!item.success) return [];
    const i = item.data;
    return [
      {
        id: String(i.id),
        kind,
        repo: repoName(i.repository_url),
        number: i.number,
        title: i.title,
        url: i.html_url,
        draft: i.draft ?? false,
        updatedAt: new Date(i.updated_at).toISOString(),
      },
    ];
  });
}
