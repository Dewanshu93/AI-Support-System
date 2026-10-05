import { redirect } from 'next/navigation';
import { homeFor } from '@/lib/roles';
import { getCurrentUser } from '@/lib/session';

/** `/` sends signed-in users to their role home and everyone else to login. */
export default async function HomePage() {
  const user = await getCurrentUser();
  redirect(user ? homeFor(user.role) : '/login');
}
