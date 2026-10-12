// Shell layout (profile menu next to the bell, collapsible sidebar). Rendered to
// static HTML: opening the menu, collapsing and remembering the choice are
// covered by e2e/tests/auth.spec.ts.
import type { AuthUser } from '@sd/shared';
import { renderToStaticMarkup } from 'react-dom/server';
import { NAV_BY_ROLE } from '@/lib/roles';
import { NavLinks } from './NavLinks';
import { ProfileMenu } from './ProfileMenu';
import { Sidebar } from './Sidebar';

jest.mock('next/navigation', () => ({ usePathname: () => '/payroll' }));

const PRIYA: AuthUser = {
  id: '6a1f00000000000000000001',
  name: 'Priya Shah',
  email: 'priya.shah@example.com',
  role: 'employee',
  country: 'US',
  employmentType: 'full_time',
  department: 'Engineering',
  jobTitle: 'Software Engineer',
  accessLevel: 'standard',
  queues: [],
  proModels: false,
} as AuthUser;

describe('ProfileMenu', () => {
  it('shows the avatar and name as a closed menu button; details open on click', () => {
    const html = renderToStaticMarkup(<ProfileMenu user={PRIYA} />);
    expect(html).toContain('data-testid="profile-menu"');
    expect(html).toContain('aria-label="Profile: Priya Shah"');
    expect(html).toContain('aria-expanded="false"');
    expect(html).toContain('>PS<');
    // The details panel (and Sign out) render only when opened.
    expect(html).not.toContain('data-testid="user-badge"');
    expect(html).not.toContain('Sign out');
  });
});

describe('Sidebar', () => {
  it('renders expanded first, with a collapse button and no profile card', () => {
    const html = renderToStaticMarkup(<Sidebar user={PRIYA} items={NAV_BY_ROLE.employee} />);
    expect(html).toContain('data-collapsed="false"');
    expect(html).toContain('aria-label="Collapse sidebar"');
    expect(html).not.toContain('data-testid="user-badge"');
  });
});

describe('NavLinks', () => {
  it('compact: icon rail with labels kept for screen readers and as tooltips', () => {
    const html = renderToStaticMarkup(<NavLinks items={NAV_BY_ROLE.employee} compact />);
    expect(html).toContain('title="Payroll"');
    expect(html).toContain('<span class="sr-only">Payroll</span>');
    expect(html).toMatch(/aria-current="page"[^>]*>|href="\/payroll"[^>]*aria-current="page"/);
  });

  it('expanded: visible labels, no tooltips', () => {
    const html = renderToStaticMarkup(<NavLinks items={NAV_BY_ROLE.employee} />);
    expect(html).not.toContain('title="Payroll"');
    expect(html).not.toContain('sr-only');
    expect(html).toContain('Payroll');
  });
});
