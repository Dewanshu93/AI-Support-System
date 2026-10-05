import { redirect } from 'next/navigation';
import { LoginPicker } from '@/components/auth/LoginPicker';
import { homeFor } from '@/lib/roles';
import { getCurrentUser } from '@/lib/session';
import { site } from '@/lib/site';

export const metadata = { title: `Sign in · ${site.name}` };

export default async function LoginPage() {
  const user = await getCurrentUser();
  if (user) redirect(homeFor(user.role));

  return (
    <main className="mx-auto max-w-5xl space-y-6 px-4 py-12">
      <header className="space-y-2">
        <h1 className="text-3xl font-semibold tracking-tight">{site.name}</h1>
        <p className="text-slate-600">
          Choose a demo persona to sign in. Each one has a different country, employment type and
          role, which changes the answers and screens you see.
        </p>
      </header>
      <LoginPicker />
    </main>
  );
}
