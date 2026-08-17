import { NextResponse } from 'next/server';
import { creators } from '@/lib/creators';
import { extractContact } from '@/lib/extract';
import { buildPrompt, parseEnrichResponse, toTargets } from '@/lib/enrich-prompt';
import { NO_KEY_HINT } from '@/lib/llm';

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

interface Contact {
  email: string | null;
  sourceField: string | null;
  mode: 'shared' | 'fallback';
}

const POLL_INTERVAL_MS = 2_000;
const POLL_BUDGET_MS = 180_000;

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export async function POST(request: Request) {
  let ids: string[] = [];
  try {
    const body = (await request.json()) as { ids?: unknown };
    if (Array.isArray(body.ids)) ids = body.ids.filter((v): v is string => typeof v === 'string');
  } catch {
    return NextResponse.json({ error: 'Expected JSON body { ids: string[] }' }, { status: 400 });
  }
  if (ids.length === 0) {
    return NextResponse.json({ error: 'No creators to enrich.' }, { status: 400 });
  }

  const selected = creators.filter((c) => ids.includes(c.id));
  const targets = toTargets(selected);

  // The deterministic extraction is the floor: whatever happens above, every
  // requested row comes back with an answer rather than an error.
  const results: Record<string, Contact> = {};
  for (const target of targets) {
    const { email, sourceField } = extractContact(target.aboutText);
    results[target.id] = { email, sourceField, mode: 'fallback' };
  }

  const base = process.env.DEMO_LLM_URL;
  if (!base) {
    return NextResponse.json({
      mode: 'fallback',
      notice: `No AI key and no shared endpoint configured, so contacts were extracted by the built-in parser. ${NO_KEY_HINT}`,
      results,
    });
  }

  try {
    const created = await fetch(base, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ prompt: buildPrompt(targets), profile: 'simple' }),
    });

    if (created.status === 429) {
      return NextResponse.json({
        mode: 'fallback',
        notice:
          'The author’s shared AI key is rate-limited right now — these rows came from the built-in parser. Try Enrich again in a minute, or add your own key in Settings for instant results.',
        results,
      });
    }
    if (!created.ok) throw new Error(`shared endpoint returned ${created.status}`);

    const { id: jobId } = (await created.json()) as { id?: number | string };
    if (jobId === undefined) throw new Error('shared endpoint returned no job id');

    const deadline = Date.now() + POLL_BUDGET_MS;
    let answer: string | null = null;
    while (Date.now() < deadline) {
      await sleep(POLL_INTERVAL_MS);
      const poll = await fetch(`${base}/${jobId}`);
      if (!poll.ok) throw new Error(`poll returned ${poll.status}`);
      const job = (await poll.json()) as { status?: string; response?: string; error?: string };
      if (job.status === 'running') continue;
      if (job.status === 'done' && typeof job.response === 'string') {
        answer = job.response;
        break;
      }
      throw new Error(job.error ?? `shared job ended as "${job.status}"`);
    }

    if (answer === null) {
      return NextResponse.json({
        mode: 'fallback',
        notice:
          'The shared AI queue did not answer within three minutes, so these rows came from the built-in parser. Add your own key in Settings for instant results.',
        results,
      });
    }

    const parsed = parseEnrichResponse(answer, targets);
    let live = 0;
    for (const [id, extraction] of Object.entries(parsed)) {
      results[id] = { ...extraction, mode: 'shared' };
      live += 1;
    }

    return NextResponse.json({
      mode: live > 0 ? 'shared' : 'fallback',
      notice:
        live > 0
          ? `Enriched ${live} of ${targets.length} rows on the author’s shared key. Add your own key in Settings for instant results.`
          : 'The shared AI reply could not be parsed, so these rows came from the built-in parser.',
      results,
    });
  } catch {
    return NextResponse.json({
      mode: 'fallback',
      notice:
        'The shared AI endpoint was unreachable, so contacts were extracted by the built-in parser. Add your own key in Settings for instant results.',
      results,
    });
  }
}
