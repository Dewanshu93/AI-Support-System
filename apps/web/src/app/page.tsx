import { site } from '@/lib/site';

// Placeholder home page. The login persona picker, role layouts and
// PrototypeBanner arrive in W1-06.
export default function HomePage() {
  return (
    <main className="mx-auto flex max-w-2xl flex-col gap-3 px-6 py-24">
      <h1 className="text-3xl font-semibold tracking-tight">{site.name}</h1>
      <p className="text-slate-600">{site.tagline}</p>
    </main>
  );
}
