'use client';

import { useActionState } from 'react';
import { addBlocklistDomain, removeBlocklistDomain } from '@/app/actions';
import { EMPTY_RESULT } from '@/lib/action-result';
import { Badge } from './ui';

export interface DomainRow {
  domain: string;
  seeded: boolean;
  /** How many roster prospects this one domain currently costs. */
  blocks: number;
  examples: string[];
}

export default function BlocklistManager({ domains }: { domains: DomainRow[] }) {
  const [state, formAction, pending] = useActionState(addBlocklistDomain, EMPTY_RESULT);

  return (
    <div className="space-y-4">
      <form action={formAction} className="flex flex-wrap items-end gap-3">
        <div className="grow sm:grow-0">
          <label htmlFor="domain" className="block text-xs font-medium text-slate-300">
            Competitor domain
          </label>
          <input
            id="domain"
            name="domain"
            type="text"
            autoComplete="off"
            placeholder="risingtalent.gg"
            className="mt-1 w-full rounded border border-slate-700 bg-slate-950 px-2 py-1.5 text-sm text-slate-100 focus:border-emerald-500 focus:outline-none sm:w-80"
          />
        </div>
        <button
          type="submit"
          disabled={pending}
          className="rounded bg-emerald-500 px-3 py-1.5 text-sm font-semibold text-slate-950 transition hover:bg-emerald-400 disabled:opacity-60"
        >
          Add domain
        </button>
      </form>

      {state.error ? (
        <p
          data-testid="domain-error"
          className="rounded border border-rose-500/40 bg-rose-500/10 px-3 py-2 text-xs text-rose-200"
        >
          {state.error}
        </p>
      ) : null}
      {state.added ? (
        <p className="rounded border border-emerald-500/40 bg-emerald-500/10 px-3 py-2 text-xs text-emerald-200">
          <span className="font-mono">{state.added}</span> is now screened out of every pass. The
          pipeline board reflects it immediately.
        </p>
      ) : null}

      <ul className="divide-y divide-slate-800 rounded-md border border-slate-800">
        {domains.map((row) => (
          <li
            key={row.domain}
            data-testid={`domain-${row.domain}`}
            className="flex flex-wrap items-center gap-3 px-3 py-2"
          >
            <span className="font-mono text-sm text-slate-100">{row.domain}</span>
            <Badge tone={row.seeded ? 'muted' : 'ok'}>{row.seeded ? 'seeded' : 'added by you'}</Badge>
            <span className="text-xs text-slate-500">
              {row.blocks === 0
                ? 'blocks nobody in the current roster'
                : `blocks ${row.blocks} prospect${row.blocks === 1 ? '' : 's'}: ${row.examples.join(', ')}`}
            </span>
            <form action={removeBlocklistDomain} className="ml-auto">
              <input type="hidden" name="domain" value={row.domain} />
              <button
                type="submit"
                aria-label={`Remove ${row.domain}`}
                className="rounded border border-slate-700 px-2 py-1 text-xs text-slate-400 transition hover:border-rose-500/60 hover:text-rose-300"
              >
                Remove
              </button>
            </form>
          </li>
        ))}
      </ul>

      {domains.length === 0 ? (
        <p className="text-sm text-slate-400">
          The blocklist is empty, so no prospect is screened out as agency-managed.
        </p>
      ) : null}
    </div>
  );
}
