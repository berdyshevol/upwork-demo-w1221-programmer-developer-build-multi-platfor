'use server';

import { revalidatePath } from 'next/cache';
import { blocklistSeed } from '@/lib/creators';
import { normalizeDomain, readBlocklistDelta, writeBlocklistDelta } from '@/lib/blocklist';
import type { ActionResult } from '@/lib/action-result';

export async function addBlocklistDomain(
  _previous: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  const raw = String(formData.get('domain') ?? '');
  const domain = normalizeDomain(raw);
  if (!domain) {
    return {
      error: `“${raw.trim() || 'empty'}” does not look like a domain. Try something like risingtalent.gg`,
    };
  }

  const delta = await readBlocklistDelta();
  await writeBlocklistDelta({
    add: delta.add.includes(domain) ? delta.add : [...delta.add, domain],
    remove: delta.remove.filter((d) => d !== domain),
  });
  revalidatePath('/');
  revalidatePath('/blocklist');
  return { added: domain };
}

export async function removeBlocklistDomain(formData: FormData): Promise<void> {
  const domain = normalizeDomain(String(formData.get('domain') ?? ''));
  if (!domain) return;

  const delta = await readBlocklistDelta();
  await writeBlocklistDelta({
    add: delta.add.filter((d) => d !== domain),
    // A seeded domain cannot be deleted from code, so record the removal instead.
    remove:
      blocklistSeed.includes(domain) && !delta.remove.includes(domain)
        ? [...delta.remove, domain]
        : delta.remove,
  });
  revalidatePath('/');
  revalidatePath('/blocklist');
}
