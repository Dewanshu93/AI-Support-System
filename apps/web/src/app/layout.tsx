import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import { site } from '@/lib/site';
import './globals.css';

export const metadata: Metadata = {
  title: site.name,
  description: site.tagline,
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-screen bg-slate-50 text-slate-900 antialiased">{children}</body>
    </html>
  );
}
