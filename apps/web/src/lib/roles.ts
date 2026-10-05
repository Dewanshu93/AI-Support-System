import type { Role } from '@sd/shared';

export interface NavItem {
  href: string;
  label: string;
}

/** Where each role lands after login (playbook section 10). */
export const HOME_BY_ROLE: Record<Role, string> = {
  employee: '/chat',
  agent: '/agent/queue',
  admin: '/admin',
};

export function homeFor(role: Role): string {
  return HOME_BY_ROLE[role];
}

/** Role-specific navigation shown in the AppShell. */
export const NAV_BY_ROLE: Record<Role, NavItem[]> = {
  employee: [
    { href: '/chat', label: 'Chat' },
    { href: '/tickets', label: 'My tickets' },
  ],
  agent: [{ href: '/agent/queue', label: 'Queue' }],
  admin: [
    { href: '/admin', label: 'Overview' },
    { href: '/admin/gaps', label: 'Knowledge gaps' },
    { href: '/admin/traces', label: 'Traces' },
    { href: '/admin/documents', label: 'Documents' },
    { href: '/admin/evals', label: 'Evaluation' },
    { href: '/agent/queue', label: 'Agent queue' },
  ],
};

/** Which roles may open each route group. UX only: the API enforces access. */
export const AREA_ROLES = {
  employee: ['employee'],
  agent: ['agent', 'admin'],
  admin: ['admin'],
} as const satisfies Record<string, readonly Role[]>;

export const ROLE_LABEL: Record<Role, string> = {
  employee: 'Employee',
  agent: 'Agent',
  admin: 'Admin',
};

export const EMPLOYMENT_LABEL = { full_time: 'Full-time', contractor: 'Contractor' } as const;
