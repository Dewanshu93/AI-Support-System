import { redirect } from 'next/navigation';
import { LoginPicker } from '@/components/auth/LoginPicker';
import { BrandMark } from '@/components/shell/Sidebar';
import { Icon, type IconName } from '@/components/ui/Icon';
import { homeFor } from '@/lib/roles';
import { getCurrentUser } from '@/lib/session';
import { site } from '@/lib/site';

export const metadata = { title: `Sign in · ${site.name}` };

const FEATURES: { icon: IconName; title: string; text: string }[] = [
  { icon: 'clock', title: 'Timesheets', text: 'See missing days and log hours by asking Copilot.' },
  {
    icon: 'wallet',
    title: 'Pay explained',
    text: 'Understand deductions from your records and policy.',
  },
  { icon: 'inbox', title: 'Requests', text: 'Escalate with a reviewed draft and track progress.' },
];

export default async function LoginPage() {
  const user = await getCurrentUser();
  if (user) redirect(homeFor(user.role));

  return (
    <div className="grid min-h-[calc(100vh-1.75rem)] lg:grid-cols-[minmax(0,26rem)_1fr]">
      <aside className="hidden flex-col justify-between border-r border-slate-200 bg-white px-10 py-10 lg:flex">
        <BrandMark />
        <div>
          <p className="text-2xl leading-snug font-semibold tracking-tight text-slate-900">
            One place for your work, time, pay and requests.
          </p>
          <p className="mt-3 text-sm leading-relaxed text-slate-600">{site.tagline}</p>
          <ul className="mt-8 space-y-5">
            {FEATURES.map((f) => (
              <li key={f.title} className="flex gap-3">
                <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-brand-50 text-brand-600">
                  <Icon name={f.icon} className="h-4.5 w-4.5" />
                </span>
                <span>
                  <span className="block text-sm font-semibold text-slate-900">{f.title}</span>
                  <span className="block text-sm text-slate-600">{f.text}</span>
                </span>
              </li>
            ))}
          </ul>
        </div>
        <p className="flex items-center gap-2 text-xs text-slate-500">
          <Icon name="shield" className="h-4 w-4" />
          Demo environment. All people and records are synthetic.
        </p>
      </aside>

      <main className="mx-auto w-full max-w-4xl px-4 py-10 sm:px-8 lg:py-14">
        <div className="mb-8 lg:hidden">
          <BrandMark />
        </div>
        <header className="mb-8">
          <h1 className="text-2xl font-semibold tracking-tight text-slate-900 sm:text-[28px]">
            {site.name}
          </h1>
          <p className="mt-1.5 max-w-2xl text-sm text-slate-600">
            Sign in as a demo persona. Each has a different country, employment type and role, which
            changes the data, answers and screens you see.
          </p>
        </header>
        <LoginPicker />
      </main>
    </div>
  );
}
