'use client';

// "From your apps" on the dashboard (UC-19): shown only when GitHub is connected.
// Loaded separately from GET /api/dashboard so a slow tool never delays it.
import type { GithubWorkResponse } from '@sd/shared';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { Card, CardHeader } from '@/components/ui/Card';
import { Icon } from '@/components/ui/Icon';
import { api } from '@/lib/api';
import { problemText } from './connectedApps';

export function AppsCard() {
  const [work, setWork] = useState<GithubWorkResponse | null>(null);

  useEffect(() => {
    let live = true;
    void api
      .integrations()
      .then((r) => r.items.find((i) => i.provider === 'github' && i.connected))
      .then((github) => (github ? api.githubWork() : null))
      .then((w) => live && setWork(w))
      .catch(() => live && setWork(null));
    return () => {
      live = false;
    };
  }, []);

  if (!work?.connected && !work?.problem) return null;
  const problem = problemText('github', work.problem);
  const rows = [
    { label: 'Pull requests waiting for your review', count: work.reviewRequests.length },
    { label: 'Your open pull requests', count: work.pullRequests.length },
    { label: 'GitHub issues assigned to you', count: work.issues.length },
  ];

  return (
    <Card data-testid="apps-card">
      <CardHeader
        icon={<Icon name="board" className="h-4.5 w-4.5" />}
        title="From your apps"
        subtitle={work.accountName ? `GitHub · ${work.accountName}` : 'GitHub'}
        action={
          <Link href="/apps" className="text-xs font-medium text-brand-600 hover:text-brand-700">
            Open →
          </Link>
        }
      />
      {problem ? (
        <p className="text-sm text-amber-700 dark:text-amber-300">{problem}</p>
      ) : (
        <ul className="-my-2 divide-y divide-slate-100">
          {rows.map((r) => (
            <li key={r.label} className="flex items-center justify-between py-2 text-sm">
              <span className="text-slate-700">{r.label}</span>
              <span className="font-semibold text-slate-900">{r.count}</span>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}
