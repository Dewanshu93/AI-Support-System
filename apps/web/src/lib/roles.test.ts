import { ROLES } from '@sd/shared';
import { AREA_ROLES, homeFor, NAV_BY_ROLE } from './roles';

describe('role routing', () => {
  it('sends each role to its home', () => {
    expect(homeFor('employee')).toBe('/chat');
    expect(homeFor('agent')).toBe('/agent/queue');
    expect(homeFor('admin')).toBe('/admin');
  });

  it("puts each role's home first in its navigation", () => {
    for (const role of ROLES) expect(NAV_BY_ROLE[role][0]!.href).toBe(homeFor(role));
  });

  it('lets each role into its own area', () => {
    expect(AREA_ROLES.employee).toContain('employee');
    expect(AREA_ROLES.agent).toEqual(['agent', 'admin']);
    expect(AREA_ROLES.admin).toEqual(['admin']);
  });

  it('only links to areas the role may open', () => {
    const areaOf = (href: string) =>
      href.startsWith('/admin') ? 'admin' : href.startsWith('/agent') ? 'agent' : 'employee';
    for (const role of ROLES) {
      for (const item of NAV_BY_ROLE[role]) {
        expect({
          role,
          href: item.href,
          allowed: (AREA_ROLES[areaOf(item.href)] as readonly string[]).includes(role),
        }).toEqual({
          role,
          href: item.href,
          allowed: true,
        });
      }
    }
  });
});
