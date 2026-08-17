import { readBlocklist } from '@/lib/blocklist';
import { scoutedHistorySeed } from '@/lib/creators';
import {
  EnrichedContact,
  Thresholds,
  parseThresholds,
  runPipeline,
  toCsv,
} from '@/lib/pipeline';

export const dynamic = 'force-dynamic';

const FILENAME = 'scoutpipe-gmass-export.csv';

function csvResponse(body: string) {
  return new Response(body, {
    headers: {
      'content-type': 'text/csv; charset=utf-8',
      'content-disposition': `attachment; filename="${FILENAME}"`,
      'cache-control': 'no-store',
    },
  });
}

async function build(thresholds: Thresholds, enrichment: Record<string, EnrichedContact>) {
  const blocklist = await readBlocklist();
  const { rows } = runPipeline({
    thresholds,
    blocklist,
    scoutedHistory: scoutedHistorySeed,
    enrichment,
  });
  return toCsv(rows);
}

/**
 * Shareable form: thresholds come from the query string, the blocklist from the
 * operator's cookie. Uses the contact addresses already on file.
 */
export async function GET(request: Request) {
  const query = Object.fromEntries(new URL(request.url).searchParams.entries());
  return csvResponse(await build(parseThresholds(query), {}));
}

/**
 * What the Export button uses: the same route, plus the enrichment results the
 * operator can see on screen, so the CSV and the board can never disagree.
 * Nothing is stored — the file is built in the request that serves it.
 */
export async function POST(request: Request) {
  let payload: { query?: Record<string, string>; enrichment?: Record<string, EnrichedContact> } = {};
  try {
    payload = (await request.json()) as typeof payload;
  } catch {
    // fall through to defaults
  }
  const thresholds = parseThresholds(payload.query ?? {});
  const enrichment: Record<string, EnrichedContact> = {};
  for (const [id, value] of Object.entries(payload.enrichment ?? {})) {
    if (!value || typeof value !== 'object') continue;
    enrichment[id] = {
      email: typeof value.email === 'string' ? value.email : null,
      sourceField: typeof value.sourceField === 'string' ? value.sourceField : null,
      mode: value.mode,
    };
  }
  return csvResponse(await build(thresholds, enrichment));
}
