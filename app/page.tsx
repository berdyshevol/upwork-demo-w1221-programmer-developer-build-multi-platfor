import PipelineBoard from '@/components/PipelineBoard';
import { readBlocklist } from '@/lib/blocklist';
import { SNAPSHOT_DATE, creators, scoutedHistorySeed } from '@/lib/creators';
import { parseThresholds } from '@/lib/pipeline';

// Reads the operator's blocklist cookie, so it must never be prerendered with an
// empty one baked in (`.claude/adr/0001`).
export const dynamic = 'force-dynamic';

export default async function BoardPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const query = await searchParams;
  const blocklist = await readBlocklist();

  return (
    <PipelineBoard
      creators={creators}
      blocklist={blocklist}
      scoutedHistory={scoutedHistorySeed}
      initialThresholds={parseThresholds(query)}
      snapshotDate={SNAPSHOT_DATE}
    />
  );
}
