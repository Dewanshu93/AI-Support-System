import type { ReactNode } from 'react';
import { AppShell } from '@/components/shell/AppShell';
import { AREA_ROLES } from '@/lib/roles';
import { requireArea } from '@/lib/session';

export default async function AdminLayout({ children }: { children: ReactNode }) {
  const user = await requireArea(AREA_ROLES.admin);
  return <AppShell user={user}>{children}</AppShell>;
}
