import type { Role } from '@sd/shared';
import type { IconName } from '@/components/ui/Icon';

export interface NavItem {
  href: string;
  label: string;
  icon: IconName;
}

/** Where each role lands after login (playbook section 10; employee: Build Contract v2.0 flow 1). */
export const HOME_BY_ROLE: Record<Role, string> = {
  employee: '/dashboard',
  agent: '/agent/queue',
  admin: '/admin',
};

export function homeFor(role: Role): string {
  return HOME_BY_ROLE[role];
}

/** Role-specific navigation shown in the AppShell sidebar. */
export const NAV_BY_ROLE: Record<Role, NavItem[]> = {
  employee: [
    { href: '/dashboard', label: 'Dashboard', icon: 'home' },
    { href: '/chat', label: 'Copilot', icon: 'sparkles' },
    { href: '/timesheets', label: 'Timesheets', icon: 'clock' },
    { href: '/leave', label: 'Leave', icon: 'calendar' },
    { href: '/tasks', label: 'My work', icon: 'checklist' },
    { href: '/payroll', label: 'Payroll', icon: 'wallet' },
    { href: '/tickets', label: 'Requests', icon: 'inbox' },
    { href: '/apps', label: 'Connected apps', icon: 'grid' },
  ],
  agent: [
    { href: '/agent/queue', label: 'Queue', icon: 'inbox' },
    { href: '/agent/leave', label: 'Leave approvals', icon: 'calendar' },
  ],
  admin: [
    { href: '/admin', label: 'Overview', icon: 'grid' },
    { href: '/admin/gaps', label: 'Knowledge gaps', icon: 'search' },
    { href: '/admin/traces', label: 'Traces', icon: 'list' },
    { href: '/admin/documents', label: 'Documents', icon: 'file' },
    { href: '/admin/evals', label: 'Evaluation', icon: 'checkCircle' },
    { href: '/agent/queue', label: 'Agent queue', icon: 'inbox' },
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
