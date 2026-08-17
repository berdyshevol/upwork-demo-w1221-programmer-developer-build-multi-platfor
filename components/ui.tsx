import type { ReactNode } from 'react';

export function Card({ children, className = '' }: { children: ReactNode; className?: string }) {
  return (
    <section className={`rounded-lg border border-slate-800 bg-slate-900/40 p-4 ${className}`}>
      {children}
    </section>
  );
}

const BADGE_TONES = {
  ok: 'border-emerald-500/40 bg-emerald-500/10 text-emerald-300',
  warn: 'border-amber-500/40 bg-amber-500/10 text-amber-300',
  bad: 'border-rose-500/40 bg-rose-500/10 text-rose-300',
  muted: 'border-slate-700 bg-slate-800/60 text-slate-300',
  info: 'border-sky-500/40 bg-sky-500/10 text-sky-300',
} as const;

export type BadgeTone = keyof typeof BADGE_TONES;

export function Badge({
  children,
  tone = 'muted',
  testId,
}: {
  children: ReactNode;
  tone?: BadgeTone;
  testId?: string;
}) {
  return (
    <span
      data-testid={testId}
      className={`inline-block whitespace-nowrap rounded border px-1.5 py-0.5 text-[11px] font-medium ${BADGE_TONES[tone]}`}
    >
      {children}
    </span>
  );
}

export function FunnelStage({
  testId,
  label,
  value,
  caption,
  drop,
}: {
  testId: string;
  label: string;
  value: number;
  caption: string;
  drop?: number;
}) {
  return (
    <li className="min-w-[120px] flex-1 rounded-md border border-slate-800 bg-slate-900/60 px-3 py-2">
      <p className="text-[11px] uppercase tracking-wide text-slate-500">{label}</p>
      <p className="tabnum text-2xl font-semibold text-white" data-testid={testId}>
        {value}
      </p>
      <p className="text-[11px] leading-tight text-slate-500">
        {caption}
        {drop !== undefined && drop > 0 ? (
          <span className="ml-1 text-rose-400">−{drop}</span>
        ) : null}
      </p>
    </li>
  );
}
