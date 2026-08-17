'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { generateText } from 'ai';
import type { Creator } from '@/lib/creators';
import { extractContact } from '@/lib/extract';
import {
  MAX_TARGETS_PER_CALL,
  buildPrompt,
  mockEnrich,
  parseEnrichResponse,
  toTargets,
} from '@/lib/enrich-prompt';
import {
  type ByokConfig,
  NO_KEY_HINT,
  PROVIDER_LABELS,
  type ProviderId,
  modelFor,
  readByok,
} from '@/lib/llm';
import {
  DEFAULT_THRESHOLDS,
  type EnrichedContact,
  RECOMMENDED_THRESHOLDS,
  type Row,
  type RowStatus,
  type Thresholds,
  runPipeline,
  thresholdsToQuery,
} from '@/lib/pipeline';
import { Badge, type BadgeTone, Card, FunnelStage } from './ui';

const STATUS_TONE: Record<RowStatus, BadgeTone> = {
  Qualified: 'ok',
  'Active on Kick': 'warn',
  'Enrich failed': 'muted',
  'Blocked (agency)': 'bad',
  Duplicate: 'info',
};

const KICK_TONE = {
  'Active on Kick': 'warn',
  'No Kick presence': 'ok',
  Unverified: 'muted',
} as const;

const MODE_LABEL: Record<EnrichedContact['mode'], string> = {
  byok: 'byok',
  shared: 'shared',
  fallback: 'fallback',
  mock: 'mock',
};

function chunk<T>(items: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

interface Props {
  creators: Creator[];
  blocklist: string[];
  scoutedHistory: string[];
  initialThresholds: Thresholds;
  snapshotDate: string;
}

export default function PipelineBoard({
  creators,
  blocklist,
  scoutedHistory,
  initialThresholds,
  snapshotDate,
}: Props) {
  const [thresholds, setThresholds] = useState<Thresholds>(initialThresholds);
  const [enrichment, setEnrichment] = useState<Record<string, EnrichedContact>>({});
  const [byok, setByok] = useState<ByokConfig | null>(null);
  const [enriching, setEnriching] = useState(false);
  const [progress, setProgress] = useState({ done: 0, total: 0 });
  const [notice, setNotice] = useState<string | null>(null);
  const [exporting, setExporting] = useState(false);

  useEffect(() => setByok(readByok()), []);

  // Thresholds are the shareable half of the state, so they live in the URL.
  // replaceState keeps the filter instant: no navigation, no server round trip.
  useEffect(() => {
    const query = thresholdsToQuery(thresholds);
    window.history.replaceState(null, '', `${window.location.pathname}?${query}`);
  }, [thresholds]);

  const { rows, funnel } = useMemo(
    () => runPipeline({ creators, thresholds, blocklist, scoutedHistory, enrichment }),
    [creators, thresholds, blocklist, scoutedHistory, enrichment],
  );

  const patch = (next: Partial<Thresholds>) => setThresholds((prev) => ({ ...prev, ...next }));

  async function runEnrichment() {
    const pending = rows.filter((row) => row.status !== 'Active on Kick').map((row) => row.creator);
    if (pending.length === 0) {
      setNotice('No creators are past the Kick check at these thresholds — nothing to enrich.');
      return;
    }

    setEnriching(true);
    setProgress({ done: 0, total: pending.length });
    const collected: Record<string, EnrichedContact> = {};
    let lastNotice = '';

    for (const group of chunk(pending, MAX_TARGETS_PER_CALL)) {
      const targets = toTargets(group);
      try {
        if (byok?.provider === 'mock') {
          for (const [id, value] of Object.entries(mockEnrich(targets))) {
            collected[id] = { ...value, mode: 'mock' };
          }
          lastNotice =
            'Enriched on your own key path using the mock test provider — deterministic output, no network call.';
        } else if (byok) {
          const { text } = await generateText({
            model: modelFor(byok),
            prompt: buildPrompt(targets),
          });
          const parsed = parseEnrichResponse(text, targets);
          for (const target of targets) {
            const hit = parsed[target.id];
            collected[target.id] = hit
              ? { ...hit, mode: 'byok' }
              : { ...extractContact(target.aboutText), mode: 'fallback' };
          }
          const label = PROVIDER_LABELS[byok.provider as Exclude<ProviderId, 'mock'>];
          lastNotice = `Enriched on your own key — ${label} ${byok.model}. The request went straight from your browser to the provider; it never touched this app's server.`;
        } else {
          const response = await fetch('/api/enrich', {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ ids: targets.map((t) => t.id) }),
          });
          const data = (await response.json()) as {
            results?: Record<string, EnrichedContact>;
            notice?: string;
          };
          for (const [id, value] of Object.entries(data.results ?? {})) collected[id] = value;
          if (data.notice) lastNotice = data.notice;
        }
      } catch {
        for (const target of targets) {
          collected[target.id] = { ...extractContact(target.aboutText), mode: 'fallback' };
        }
        lastNotice = `That AI call failed, so these rows were extracted by the built-in parser instead. ${NO_KEY_HINT}`;
      }

      setEnrichment({ ...collected });
      setProgress((prev) => ({ ...prev, done: prev.done + group.length }));
    }

    setNotice(lastNotice);
    setEnriching(false);
  }

  async function runExport() {
    setExporting(true);
    try {
      const query = Object.fromEntries(new URLSearchParams(thresholdsToQuery(thresholds)));
      const response = await fetch('/api/export', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ query, enrichment }),
      });
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = 'scoutpipe-gmass-export.csv';
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 5_000);
    } finally {
      setExporting(false);
    }
  }

  const enrichedCount = Object.keys(enrichment).length;

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-xl font-semibold tracking-tight text-white">
          ScoutPipe — creator scouting pipeline
        </h1>
        <p className="mt-1 max-w-4xl text-sm text-slate-400">
          One automated pass over the whole manual routine: discovery → size filtering → Kick
          cross-reference → contact enrichment → agency blocklist → dedupe → GMass-ready CSV. The
          roster is a frozen snapshot taken {snapshotDate}, so &ldquo;days since last live&rdquo; is
          measured from that date and rankings do not drift.
        </p>
      </div>

      <ByokBanner byok={byok} />

      <Card>
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="text-sm font-semibold text-white">Pipeline funnel</h2>
          <p className="text-xs text-slate-500">
            Each stage shows what survived it. Drops are explained per row below.
          </p>
        </div>
        <ol className="mt-3 flex flex-wrap gap-2">
          <FunnelStage
            testId="funnel-roster"
            label="1 · Roster"
            value={funnel.roster}
            caption="seeded creators"
          />
          <FunnelStage
            testId="funnel-thresholds"
            label="2 · Passed size"
            value={funnel.passedThresholds}
            caption="met all four thresholds"
            drop={funnel.roster - funnel.passedThresholds}
          />
          <FunnelStage
            testId="funnel-kick"
            label="3 · Kick-clear"
            value={funnel.kickClear}
            caption="not already on Kick"
            drop={funnel.passedThresholds - funnel.kickClear}
          />
          <FunnelStage
            testId="funnel-enriched"
            label="4 · Enriched"
            value={funnel.enriched}
            caption="business contact found"
            drop={funnel.kickClear - funnel.enriched}
          />
          <FunnelStage
            testId="funnel-blocklist"
            label="5 · Blocklist-clear"
            value={funnel.blocklistClear}
            caption="no competing agency"
            drop={funnel.enriched - funnel.blocklistClear}
          />
          <FunnelStage
            testId="funnel-exportable"
            label="6 · Exportable"
            value={funnel.exportable}
            caption="new, contactable, clean"
            drop={funnel.blocklistClear - funnel.exportable}
          />
        </ol>
      </Card>

      <Card>
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="text-sm font-semibold text-white">Size thresholds</h2>
          <p className="text-xs text-slate-500">
            Re-filters and re-ranks as you type — no page reload. The URL updates so you can share
            this exact view.
          </p>
        </div>

        <div className="mt-3 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <ThresholdField
            id="minAcv"
            label="Min avg concurrent viewers (ACV)"
            sliderLabel="ACV slider"
            value={thresholds.minAcv}
            max={2500}
            step={10}
            onChange={(minAcv) => patch({ minAcv })}
          />
          <ThresholdField
            id="minHours"
            label="Min hours streamed"
            sliderLabel="Hours slider"
            value={thresholds.minHours}
            max={300}
            step={5}
            onChange={(minHours) => patch({ minHours })}
          />
          <ThresholdField
            id="minFollowers"
            label="Min followers"
            sliderLabel="Followers slider"
            value={thresholds.minFollowers}
            max={500_000}
            step={1_000}
            onChange={(minFollowers) => patch({ minFollowers })}
          />
          <ThresholdField
            id="maxDays"
            label="Max days since last live"
            sliderLabel="Recency slider"
            value={thresholds.maxDaysSinceLive}
            max={365}
            step={1}
            onChange={(maxDaysSinceLive) => patch({ maxDaysSinceLive })}
          />
        </div>

        <div className="mt-4 flex flex-wrap items-center gap-x-5 gap-y-2 text-sm">
          <label className="flex items-center gap-2 text-slate-300">
            <input
              type="checkbox"
              className="h-4 w-4 accent-emerald-500"
              checked={thresholds.includeKick}
              onChange={(event) => patch({ includeKick: event.target.checked })}
            />
            Include creators active on Kick
          </label>
          <button
            type="button"
            onClick={() => setThresholds(RECOMMENDED_THRESHOLDS)}
            className="rounded border border-slate-700 px-2 py-1 text-xs text-slate-300 transition hover:border-slate-500 hover:text-white"
          >
            Apply recommended thresholds
          </button>
          <button
            type="button"
            onClick={() => setThresholds(DEFAULT_THRESHOLDS)}
            className="rounded border border-slate-700 px-2 py-1 text-xs text-slate-300 transition hover:border-slate-500 hover:text-white"
          >
            Reset to whole roster
          </button>
          <p className="text-xs text-slate-500">
            Score = audience 55 / airtime 25 / recency 20, each capped and normalised.
          </p>
        </div>
      </Card>

      <Card>
        <div className="flex flex-wrap items-center gap-3">
          <button
            type="button"
            data-testid="enrich"
            onClick={runEnrichment}
            disabled={enriching}
            className="rounded bg-emerald-500 px-3 py-1.5 text-sm font-semibold text-slate-950 transition hover:bg-emerald-400 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {enriching ? `Enriching ${progress.done}/${progress.total}…` : 'Enrich contacts'}
          </button>
          <button
            type="button"
            data-testid="export"
            onClick={runExport}
            disabled={exporting || funnel.exportable === 0}
            className="rounded border border-emerald-500/60 px-3 py-1.5 text-sm font-semibold text-emerald-300 transition hover:bg-emerald-500/10 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {exporting ? 'Building CSV…' : `Export for GMass (${funnel.exportable})`}
          </button>
          <Link
            href="/blocklist"
            className="text-xs text-slate-400 underline decoration-dotted hover:text-slate-200"
          >
            Manage agency blocklist ({blocklist.length} domains)
          </Link>
          {enrichedCount > 0 ? (
            <span className="text-xs text-slate-500">{enrichedCount} rows enriched</span>
          ) : null}
        </div>

        {enriching && !byok ? (
          <p className="mt-3 rounded border border-sky-500/30 bg-sky-500/10 px-3 py-2 text-xs text-sky-200">
            Answering on the author&apos;s shared key, this takes a while — it queues, and can take
            minutes. Add your own key in <Link href="/settings" className="underline">Settings</Link>{' '}
            for instant replies.
          </p>
        ) : null}

        {notice ? (
          <p
            data-testid="enrich-notice"
            className="mt-3 rounded border border-slate-700 bg-slate-800/50 px-3 py-2 text-xs text-slate-300"
          >
            {notice}
          </p>
        ) : null}

        <p className="mt-3 text-xs text-slate-500">
          The CSV is built server-side in the request that serves it, from these thresholds, your
          blocklist cookie and the enrichment you can see on screen — so the file and the board
          cannot disagree.
        </p>
      </Card>

      <Card className="overflow-x-auto p-0">
        <table className="w-full min-w-[1180px] border-collapse text-sm" data-testid="roster-table">
          <thead>
            <tr className="border-b border-slate-800 text-left text-[11px] uppercase tracking-wide text-slate-500">
              <th className="px-3 py-2 font-medium">#</th>
              <th className="px-3 py-2 font-medium">Creator</th>
              <th className="px-3 py-2 font-medium">Platform</th>
              <th className="px-3 py-2 text-right font-medium">ACV</th>
              <th className="px-3 py-2 text-right font-medium">Hours</th>
              <th className="px-3 py-2 text-right font-medium">Followers</th>
              <th className="px-3 py-2 font-medium">Last live</th>
              <th className="px-3 py-2 text-right font-medium">Score</th>
              <th className="px-3 py-2 font-medium">Kick</th>
              <th className="px-3 py-2 font-medium">Contact</th>
              <th className="px-3 py-2 font-medium">Source</th>
              <th className="px-3 py-2 font-medium">Status</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <RosterRow key={row.creator.id} row={row} />
            ))}
          </tbody>
        </table>
        {rows.length === 0 ? (
          <p className="px-3 py-6 text-sm text-slate-400">
            No creator in the seeded roster meets these thresholds. Loosen one and the table fills
            again.
          </p>
        ) : null}
      </Card>
    </div>
  );
}

function RosterRow({ row }: { row: Row }) {
  const { creator, status } = row;
  return (
    <>
      <tr
        data-testid={`row-${creator.id}`}
        className="border-b border-slate-800/60 align-top hover:bg-slate-900/60"
      >
        <td className="tabnum px-3 py-2 text-slate-500" data-testid={`rank-${creator.id}`}>
          {row.rank}
        </td>
        <td className="px-3 py-2">
          <a
            href={creator.profileUrl}
            target="_blank"
            rel="noreferrer"
            className="font-medium text-slate-100 hover:text-emerald-300"
          >
            {creator.channelName}
          </a>
          <span className="ml-2 text-xs text-slate-500">{creator.firstName}</span>
        </td>
        <td className="px-3 py-2 text-slate-300" data-testid={`platform-${creator.id}`}>
          {creator.platform}
        </td>
        <td className="tabnum px-3 py-2 text-right text-slate-200" data-testid={`acv-${creator.id}`}>
          {creator.acv}
        </td>
        <td
          className="tabnum px-3 py-2 text-right text-slate-300"
          data-testid={`hours-${creator.id}`}
        >
          {creator.hoursStreamed}
        </td>
        <td
          className="tabnum px-3 py-2 text-right text-slate-300"
          data-testid={`followers-${creator.id}`}
        >
          {creator.followers.toLocaleString('en-US')}
        </td>
        <td className="px-3 py-2 text-slate-400" data-testid={`lastlive-${creator.id}`}>
          {creator.lastLive}
          <span className="ml-1 text-xs text-slate-600">({row.days}d)</span>
        </td>
        <td
          className="tabnum px-3 py-2 text-right font-semibold text-white"
          data-testid={`score-${creator.id}`}
        >
          {row.score}
        </td>
        <td className="px-3 py-2">
          <Badge tone={KICK_TONE[creator.kickStatus]} testId={`kick-${creator.id}`}>
            {creator.kickStatus}
          </Badge>
        </td>
        <td className="px-3 py-2 font-mono text-xs text-slate-300" data-testid={`email-${creator.id}`}>
          {row.email ?? '—'}
        </td>
        <td className="px-3 py-2 text-xs">
          <span className="text-slate-400" data-testid={`source-${creator.id}`}>
            {row.mode ? (row.sourceField ?? '—') : 'not enriched'}
          </span>
          {row.mode ? (
            <span className="ml-1">
              <Badge
                tone={row.mode === 'byok' || row.mode === 'mock' ? 'ok' : 'muted'}
                testId={`mode-${creator.id}`}
              >
                {MODE_LABEL[row.mode]}
              </Badge>
            </span>
          ) : null}
        </td>
        <td className="px-3 py-2">
          <Badge tone={STATUS_TONE[status]} testId={`status-${creator.id}`}>
            {status}
          </Badge>
        </td>
      </tr>
      <tr className="border-b border-slate-800/60">
        <td />
        <td colSpan={11} className="px-3 pb-2">
          <div
            className="flex flex-wrap gap-x-3 gap-y-1 text-[11px] text-slate-500"
            data-testid={`trail-${creator.id}`}
          >
            {row.trail.map((step) => (
              <span key={step.stage} className={step.ok ? 'text-slate-500' : 'text-rose-400'}>
                <span className="font-semibold">
                  {step.ok ? '✓' : '✗'} {step.stage}
                </span>{' '}
                {step.note}
              </span>
            ))}
          </div>
        </td>
      </tr>
    </>
  );
}

function ThresholdField({
  id,
  label,
  sliderLabel,
  value,
  max,
  step,
  onChange,
}: {
  id: string;
  label: string;
  sliderLabel: string;
  value: number;
  max: number;
  step: number;
  onChange: (value: number) => void;
}) {
  return (
    <div>
      <label htmlFor={id} className="block text-xs font-medium text-slate-300">
        {label}
      </label>
      <input
        id={id}
        type="number"
        min={0}
        max={max}
        step={step}
        value={value}
        onChange={(event) => onChange(Math.max(0, Number(event.target.value) || 0))}
        className="tabnum mt-1 w-full rounded border border-slate-700 bg-slate-950 px-2 py-1 text-sm text-slate-100 focus:border-emerald-500 focus:outline-none"
      />
      <input
        type="range"
        aria-label={sliderLabel}
        min={0}
        max={max}
        step={step}
        value={Math.min(value, max)}
        onChange={(event) => onChange(Number(event.target.value))}
        className="mt-2 w-full accent-emerald-500"
      />
    </div>
  );
}

function ByokBanner({ byok }: { byok: ByokConfig | null }) {
  if (!byok) {
    return (
      <p
        data-testid="byok-banner"
        className="rounded border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-200"
      >
        <strong className="font-semibold">No AI key saved.</strong> Contact enrichment will run on
        the author&apos;s shared endpoint — deliberately slow, because it queues and the author pays
        for it — and falls back to the built-in parser if that is unavailable. {NO_KEY_HINT} Your key
        stays in your browser and bills you directly, which is also the fast path.
      </p>
    );
  }

  if (byok.provider === 'mock') {
    return (
      <p
        data-testid="byok-banner"
        className="rounded border border-sky-500/30 bg-sky-500/10 px-3 py-2 text-xs text-sky-200"
      >
        Using the <strong className="font-semibold">mock</strong> test provider — deterministic
        output, no network call. This is the path the behavioural test suite exercises.
      </p>
    );
  }

  return (
    <p
      data-testid="byok-banner"
      className="rounded border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-xs text-emerald-200"
    >
      Using your own {PROVIDER_LABELS[byok.provider as Exclude<ProviderId, 'mock'>]} key ·{' '}
      <span className="font-mono">{byok.model}</span>. Requests go straight from your browser to the
      provider, bypassing this app&apos;s server entirely.
    </p>
  );
}
