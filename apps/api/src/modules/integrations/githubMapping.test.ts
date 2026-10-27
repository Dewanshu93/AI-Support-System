import { GITHUB_QUERIES, parseSearch, repoName } from './githubMapping';

describe('GITHUB_QUERIES', () => {
  it('scopes every list to the signed-in user and open items', () => {
    for (const q of Object.values(GITHUB_QUERIES)) {
      expect(q).toContain('@me');
      expect(q).toContain('is:open');
    }
  });
});

describe('parseSearch', () => {
  const item = {
    id: 99,
    number: 7,
    title: 'Fix build',
    html_url: 'https://github.com/acme/portal/pull/7',
    repository_url: 'https://api.github.com/repos/acme/portal',
    updated_at: '2026-10-06T09:00:00Z',
    draft: true,
  };

  it('maps a search item to a work item with its GitHub link', () => {
    expect(parseSearch({ items: [item] }, 'pull_request')).toEqual([
      {
        id: '99',
        kind: 'pull_request',
        repo: 'acme/portal',
        number: 7,
        title: 'Fix build',
        url: 'https://github.com/acme/portal/pull/7',
        draft: true,
        updatedAt: '2026-10-06T09:00:00.000Z',
      },
    ]);
  });

  it('skips an item it cannot read and survives an odd body', () => {
    expect(parseSearch({ items: [{ id: 1 }, item] }, 'issue')).toHaveLength(1);
    expect(parseSearch(null, 'issue')).toEqual([]);
  });

  it('reads owner/name from the repository URL', () => {
    expect(repoName('https://api.github.com/repos/acme/portal')).toBe('acme/portal');
  });
});
