import type { Metadata } from 'next';
import Link from 'next/link';
import './globals.css';

export const metadata: Metadata = {
  title: 'ScoutPipe — creator scouting pipeline',
  description:
    'Discovery to GMass-ready export in one pass: size filters, Kick cross-reference, AI contact enrichment, agency blocklist and dedupe.',
};

const NAV = [
  { href: '/', label: 'Pipeline board' },
  { href: '/blocklist', label: 'Blocklist' },
  { href: '/settings', label: 'Settings' },
];

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <header className="border-b border-slate-800 bg-slate-900/60">
          <div className="mx-auto flex max-w-[1600px] flex-wrap items-center gap-x-6 gap-y-2 px-4 py-3">
            <Link href="/" className="text-sm font-semibold tracking-tight text-white">
              Scout<span className="text-emerald-400">Pipe</span>
            </Link>
            <nav className="flex gap-4 text-sm">
              {NAV.map((item) => (
                <Link
                  key={item.href}
                  href={item.href}
                  className="text-slate-400 transition hover:text-slate-100"
                >
                  {item.label}
                </Link>
              ))}
            </nav>
            <p className="ml-auto text-xs text-slate-500">
              Seeded 40-creator snapshot · no live Twitch/YouTube/Kick calls
            </p>
          </div>
        </header>
        <main className="mx-auto max-w-[1600px] px-4 py-6">{children}</main>
        <footer className="mx-auto max-w-[1600px] px-4 pb-10 pt-4 text-xs text-slate-600">
          Demo prototype. Threshold settings live in the URL and your blocklist edits live in your
          own browser cookie, so nothing you change here affects anyone else&apos;s view.
        </footer>
      </body>
    </html>
  );
}
