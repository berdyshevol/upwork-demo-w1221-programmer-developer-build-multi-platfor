import { expect, test } from '@playwright/test';
import { ROW_SELECTOR, funnel, statusOf, visibleRowIds } from './helpers';

const REASONS = ['Active on Kick', 'Blocked (agency)', 'Duplicate', 'Enrich failed'];

test.describe('Status trail — why every creator was dropped', () => {
  // AC: every creator dropped from export shows a reason badge — Active on Kick,
  // Blocked (agency), or Duplicate — with none silently missing
  // (FR4, FR6, FR8, FR9).
  test('every dropped creator carries a reason badge, none silently missing', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator(ROW_SELECTOR)).toHaveCount(40);

    const ids = await visibleRowIds(page);
    const counts: Record<string, number> = { Qualified: 0 };
    for (const reason of REASONS) counts[reason] = 0;

    for (const id of ids) {
      const status = await statusOf(page, id);
      expect(status, `row ${id} has no status badge`).not.toBe('');
      expect([...REASONS, 'Qualified'], `row ${id} has status "${status}"`).toContain(status);
      counts[status] += 1;
    }

    // Nothing is dropped without a reason: the four reason badges plus the
    // qualified rows account for the whole filtered roster.
    expect(counts.Qualified + REASONS.reduce((sum, r) => sum + counts[r], 0)).toBe(ids.length);
    expect(counts.Qualified).toBe(await funnel(page, 'exportable'));

    // And each drop reason matches the funnel stage that dropped it.
    expect(counts['Active on Kick']).toBe(
      (await funnel(page, 'thresholds')) - (await funnel(page, 'kick')),
    );
    expect(counts['Enrich failed']).toBe(
      (await funnel(page, 'kick')) - (await funnel(page, 'enriched')),
    );
    expect(counts['Blocked (agency)']).toBe(
      (await funnel(page, 'enriched')) - (await funnel(page, 'blocklist')),
    );
    expect(counts.Duplicate).toBe(
      (await funnel(page, 'blocklist')) - (await funnel(page, 'exportable')),
    );

    // Every reason is actually exercised by the seeded dataset.
    for (const reason of REASONS) expect(counts[reason], `no row is "${reason}"`).toBeGreaterThan(0);
  });

  // AC (FR4): Kick cross-reference is labelled for every creator with one of the
  // three honest values, and Active-on-Kick creators are excluded by default.
  test('labels Kick cross-reference status and excludes Active on Kick by default', async ({
    page,
  }) => {
    await page.goto('/');

    await expect(page.getByTestId('kick-c002')).toHaveText('Active on Kick');
    await expect(page.getByTestId('kick-c001')).toHaveText('No Kick presence');
    await expect(page.getByTestId('kick-c005')).toHaveText('Unverified');

    // Excluded from export by default…
    expect(await statusOf(page, 'c002')).toBe('Active on Kick');
    // …but an Unverified creator is not punished for an unknown.
    expect(await statusOf(page, 'c005')).toBe('Qualified');

    const kickClearBefore = await funnel(page, 'kick');
    const exportableBefore = await funnel(page, 'exportable');

    // …and the default is a default, not a hard rule.
    await page.getByLabel('Include creators active on Kick').check();
    expect(await statusOf(page, 'c002')).toBe('Qualified');
    expect(await funnel(page, 'kick')).toBeGreaterThan(kickClearBefore);
    expect(await funnel(page, 'exportable')).toBeGreaterThan(exportableBefore);
  });

  // AC (FR8, FR9): duplicates from the previous scouting round are marked and the
  // trail says which stage dropped each row.
  test('marks previously scouted creators as Duplicate and shows a per-stage trail', async ({
    page,
  }) => {
    await page.goto('/');

    expect(await statusOf(page, 'c006')).toBe('Duplicate');
    expect(await statusOf(page, 'c012')).toBe('Duplicate');
    await expect(page.getByTestId('trail-c006')).toContainText('contacted in a previous round');

    expect(await statusOf(page, 'c004')).toBe('Blocked (agency)');
    await expect(page.getByTestId('trail-c004')).toContainText(
      'loadedgg.agency is a competing agency',
    );

    expect(await statusOf(page, 'c008')).toBe('Enrich failed');
    await expect(page.getByTestId('trail-c008')).toContainText('no published business address');

    expect(await statusOf(page, 'c001')).toBe('Qualified');
    await expect(page.getByTestId('trail-c001')).toContainText('not previously scouted');
  });
});
