import { Creator, SNAPSHOT_DATE, creators as roster } from './creators';
import { emailDomain, extractContact } from './extract';

export interface Thresholds {
  minAcv: number;
  minHours: number;
  minFollowers: number;
  maxDaysSinceLive: number;
  /** FR4: `Active on Kick` creators are excluded from export by default. */
  includeKick: boolean;
}

/** Wide open, so `/` opens on the whole seeded roster (FR1). */
export const DEFAULT_THRESHOLDS: Thresholds = {
  minAcv: 0,
  minHours: 0,
  minFollowers: 0,
  maxDaysSinceLive: 365,
  includeKick: false,
};

/** What the team actually runs the pass at — offered as a one-click preset. */
export const RECOMMENDED_THRESHOLDS: Thresholds = {
  minAcv: 150,
  minHours: 60,
  minFollowers: 10_000,
  maxDaysSinceLive: 45,
  includeKick: false,
};

type Query = Record<string, string | string[] | undefined>;

function num(value: string | string[] | undefined, fallback: number): number {
  const raw = Array.isArray(value) ? value[0] : value;
  if (raw === undefined || raw === '') return fallback;
  const parsed = Number(raw);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : fallback;
}

/** Thresholds live in the URL so a filtered view is shareable (and stateless). */
export function parseThresholds(query: Query): Thresholds {
  const kick = Array.isArray(query.includeKick) ? query.includeKick[0] : query.includeKick;
  return {
    minAcv: num(query.minAcv, DEFAULT_THRESHOLDS.minAcv),
    minHours: num(query.minHours, DEFAULT_THRESHOLDS.minHours),
    minFollowers: num(query.minFollowers, DEFAULT_THRESHOLDS.minFollowers),
    maxDaysSinceLive: num(query.maxDays, DEFAULT_THRESHOLDS.maxDaysSinceLive),
    includeKick: kick === '1' || kick === 'true',
  };
}

export function thresholdsToQuery(t: Thresholds): string {
  const params = new URLSearchParams({
    minAcv: String(t.minAcv),
    minHours: String(t.minHours),
    minFollowers: String(t.minFollowers),
    maxDays: String(t.maxDaysSinceLive),
  });
  if (t.includeKick) params.set('includeKick', '1');
  return params.toString();
}

const DAY = 86_400_000;

/** Measured from the dataset snapshot, never from the wall clock. */
export function daysSinceLive(lastLive: string): number {
  const then = Date.parse(`${lastLive}T00:00:00Z`);
  const now = Date.parse(`${SNAPSHOT_DATE}T00:00:00Z`);
  return Math.max(0, Math.round((now - then) / DAY));
}

/**
 * FR3 — composite score, weighted audience 55 / airtime 25 / recency 20.
 * Deliberately simple arithmetic so an operator can argue with a ranking.
 */
export function scoreOf(creator: Creator): number {
  const audience = Math.min(1, creator.acv / 2500);
  const airtime = Math.min(1, creator.hoursStreamed / 300);
  const recency = Math.max(0, 1 - daysSinceLive(creator.lastLive) / 60);
  return Math.round((audience * 55 + airtime * 25 + recency * 20) * 10) / 10;
}

export type RowStatus =
  | 'Qualified'
  | 'Active on Kick'
  | 'Enrich failed'
  | 'Blocked (agency)'
  | 'Duplicate';

export interface TrailStep {
  stage: string;
  ok: boolean;
  note: string;
}

/** One enrichment result, as returned by the AI call or the fallback. */
export interface EnrichedContact {
  email: string | null;
  sourceField: string | null;
  mode: 'byok' | 'shared' | 'fallback' | 'mock';
}

export interface Row {
  creator: Creator;
  rank: number;
  score: number;
  days: number;
  email: string | null;
  sourceField: string | null;
  /** null until the operator runs enrichment. */
  mode: EnrichedContact['mode'] | null;
  status: RowStatus;
  exportable: boolean;
  trail: TrailStep[];
}

export interface Funnel {
  roster: number;
  passedThresholds: number;
  kickClear: number;
  enriched: number;
  blocklistClear: number;
  exportable: number;
}

export interface PipelineResult {
  rows: Row[];
  funnel: Funnel;
}

export interface PipelineInput {
  creators?: Creator[];
  thresholds: Thresholds;
  blocklist: string[];
  scoutedHistory: string[];
  /** creator id -> enrichment result. Empty before the operator enriches. */
  enrichment?: Record<string, EnrichedContact>;
}

function passesThresholds(creator: Creator, t: Thresholds, days: number): boolean {
  return (
    creator.acv >= t.minAcv &&
    creator.hoursStreamed >= t.minHours &&
    creator.followers >= t.minFollowers &&
    days <= t.maxDaysSinceLive
  );
}

function isBlocked(email: string | null, blocklist: string[]): string | null {
  if (!email) return null;
  const domain = emailDomain(email);
  const hit = blocklist.find((d) => domain === d || domain.endsWith(`.${d}`));
  return hit ?? null;
}

/**
 * The whole pass, as one pure function. The board, the funnel and the CSV route
 * all call this, so the screen and the download can never disagree.
 */
export function runPipeline(input: PipelineInput): PipelineResult {
  const all = input.creators ?? roster;
  const enrichment = input.enrichment ?? {};
  const blocklist = input.blocklist.map((d) => d.trim().toLowerCase()).filter(Boolean);
  const history = new Set(input.scoutedHistory);

  const qualifiedBySize = all
    .map((creator) => ({ creator, days: daysSinceLive(creator.lastLive) }))
    .filter(({ creator, days }) => passesThresholds(creator, input.thresholds, days));

  const ranked = [...qualifiedBySize].sort((a, b) => {
    const diff = scoreOf(b.creator) - scoreOf(a.creator);
    return diff !== 0 ? diff : a.creator.id.localeCompare(b.creator.id);
  });

  const rows: Row[] = ranked.map(({ creator, days }, index) => {
    const enriched = enrichment[creator.id];
    // Before enrichment the roster still carries whatever discovery scraped, so
    // domain screening can run on day one. Enrichment replaces it and adds the
    // source field it came from.
    const onFile = creator.seededEmail;
    const email = enriched ? enriched.email : onFile;
    const sourceField = enriched ? enriched.sourceField : null;
    const mode = enriched ? enriched.mode : null;

    const kickBlocked = creator.kickStatus === 'Active on Kick' && !input.thresholds.includeKick;
    const blockedBy = kickBlocked ? null : isBlocked(email, blocklist);
    const duplicate = history.has(creator.id);

    let status: RowStatus = 'Qualified';
    if (kickBlocked) status = 'Active on Kick';
    else if (!email) status = 'Enrich failed';
    else if (blockedBy) status = 'Blocked (agency)';
    else if (duplicate) status = 'Duplicate';

    const trail: TrailStep[] = [
      {
        stage: 'Size',
        ok: true,
        note: `${creator.acv} ACV · ${creator.hoursStreamed}h · ${creator.followers.toLocaleString('en-US')} followers · live ${days}d ago`,
      },
      {
        stage: 'Kick',
        ok: !kickBlocked,
        note: kickBlocked ? 'already streaming on Kick — excluded' : creator.kickStatus,
      },
      {
        stage: 'Contact',
        ok: !!email,
        note: email
          ? `${email}${sourceField ? ` (from ${sourceField})` : ' (on file, not yet enriched)'}`
          : 'no published business address',
      },
      {
        stage: 'Blocklist',
        ok: !blockedBy,
        note: blockedBy ? `${blockedBy} is a competing agency` : 'domain clear',
      },
      {
        stage: 'Dedupe',
        ok: !duplicate,
        note: duplicate ? 'contacted in a previous round' : 'not previously scouted',
      },
    ];

    return {
      creator,
      rank: index + 1,
      score: scoreOf(creator),
      days,
      email,
      sourceField,
      mode,
      status,
      exportable: status === 'Qualified',
      trail,
    };
  });

  const kickClear = rows.filter((r) => r.status !== 'Active on Kick');
  const enrichedRows = kickClear.filter((r) => r.status !== 'Enrich failed');
  const blocklistClear = enrichedRows.filter((r) => r.status !== 'Blocked (agency)');

  return {
    rows,
    funnel: {
      roster: all.length,
      passedThresholds: rows.length,
      kickClear: kickClear.length,
      enriched: enrichedRows.length,
      blocklistClear: blocklistClear.length,
      exportable: blocklistClear.filter((r) => r.exportable).length,
    },
  };
}

/** FR10 — fixed, GMass-consumable column order. Do not reorder. */
export const CSV_HEADERS = [
  'Email',
  'FirstName',
  'ChannelName',
  'Platform',
  'ProfileURL',
  'ACV',
  'HoursStreamed',
  'Followers',
  'LastLive',
  'KickStatus',
  'Score',
] as const;

function csvCell(value: string | number): string {
  const text = String(value);
  return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

export function toCsv(rows: Row[]): string {
  const lines = [CSV_HEADERS.join(',')];
  for (const row of rows) {
    if (!row.exportable || !row.email) continue;
    lines.push(
      [
        row.email,
        row.creator.firstName,
        row.creator.channelName,
        row.creator.platform,
        row.creator.profileUrl,
        row.creator.acv,
        row.creator.hoursStreamed,
        row.creator.followers,
        row.creator.lastLive,
        row.creator.kickStatus,
        row.score,
      ]
        .map(csvCell)
        .join(','),
    );
  }
  return `${lines.join('\r\n')}\r\n`;
}

/** Used by the fallback path and by the `mock` test provider. */
export function fallbackEnrichment(ids: string[], all: Creator[] = roster): Record<string, EnrichedContact> {
  const out: Record<string, EnrichedContact> = {};
  for (const id of ids) {
    const creator = all.find((c) => c.id === id);
    if (!creator) continue;
    const { email, sourceField } = extractContact(creator.aboutText);
    out[id] = { email, sourceField, mode: 'fallback' };
  }
  return out;
}
