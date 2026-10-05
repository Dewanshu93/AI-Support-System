import type { ReactNode } from 'react';
import { AppShell } from '@/components/shell/AppShell';
import { AREA_ROLES } from '@/lib/roles';
import { requireArea } from '@/lib/session';

/** Agents, plus admins (who may work any queue). */
export default async function AgentLayout({ children }: { children: ReactNode }) {
  const user = await requireArea(AREA_ROLES.agent);
  return <AppShell user={user}>{children}</AppShell>;
}
