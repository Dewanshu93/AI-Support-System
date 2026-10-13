import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import { PrototypeBanner } from '@/components/PrototypeBanner';
import { site } from '@/lib/site';
import { THEME_INIT_SCRIPT } from '@/lib/theme';
import './globals.css';

export const metadata: Metadata = {
  title: site.name,
  description: site.tagline,
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        {/* Sets the theme class before first paint (no light flash in dark mode). */}
        <script dangerouslySetInnerHTML={{ __html: THEME_INIT_SCRIPT }} />
      </head>
      <body className="min-h-screen bg-slate-50 text-slate-900 antialiased">
        <PrototypeBanner />
        {children}
      </body>
    </html>
  );
}
