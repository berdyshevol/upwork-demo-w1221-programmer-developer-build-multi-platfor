import Link from 'next/link';
import BlocklistManager, { type DomainRow } from '@/components/BlocklistManager';
import { isSeeded, readBlocklist } from '@/lib/blocklist';
import { creators, scoutedHistorySeed } from '@/lib/creators';
import { emailDomain } from '@/lib/extract';
import { Card } from '@/components/ui';
import { DEFAULT_THRESHOLDS, runPipeline } from '@/lib/pipeline';

export const dynamic = 'force-dynamic';

export default async function BlocklistPage() {
  const blocklist = await readBlocklist();

  // What the list actually costs, measured against the whole roster.
  const { rows } = runPipeline({
    thresholds: DEFAULT_THRESHOLDS,
    blocklist,
    scoutedHistory: scoutedHistorySeed,
  });
  const blockedRows = rows.filter((row) => row.status === 'Blocked (agency)');

  const domains: DomainRow[] = blocklist.map((domain) => {
    const hits = creators.filter(
      (creator) =>
        creator.seededEmail &&
        (emailDomain(creator.seededEmail) === domain ||
          emailDomain(creator.seededEmail).endsWith(`.${domain}`)),
    );
    return {
      domain,
      seeded: isSeeded(domain),
      blocks: hits.length,
      examples: hits.slice(0, 3).map((c) => c.channelName),
    };
  });

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-xl font-semibold tracking-tight text-white">Agency blocklist</h1>
        <p className="mt-1 max-w-3xl text-sm text-slate-400">
          Any prospect whose business address sits on one of these domains is already represented by
          a competing agency, so outreach is wasted. Edits apply to the{' '}
          <Link href="/" className="text-emerald-300 underline decoration-dotted">
            pipeline board
          </Link>{' '}
          immediately and persist across reloads.
        </p>
      </div>

      <Card>
        <div className="flex flex-wrap items-baseline gap-x-6 gap-y-1">
          <p className="text-sm text-slate-300">
            <span className="text-2xl font-semibold text-white" data-testid="blocked-count">
              {blockedRows.length}
            </span>{' '}
            prospects currently screened out as agency-managed
          </p>
          <p className="text-xs text-slate-500">{blocklist.length} domains on the list</p>
        </div>
      </Card>

      <Card>
        <BlocklistManager domains={domains} />
      </Card>

      <p className="text-xs text-slate-500">
        Your edits are stored as a delta in an httpOnly cookie on your own browser — the seeded
        domains stay in code. That is deliberate: this demo runs on serverless instances that share
        no memory, so a list kept in server memory would appear to save and then silently vanish on
        the next request.
      </p>
    </div>
  );
}
