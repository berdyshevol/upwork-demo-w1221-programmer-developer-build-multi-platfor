import { expect, test } from '@playwright/test';
import { funnel, statusOf } from './helpers';

test.describe('Blocklist manager', () => {
  // AC: adding a domain on /blocklist immediately blocks the matching prospect on
  // / and survives a page reload (FR6, FR7, FR9, FR11).
  test('an added domain blocks the matching prospect immediately and survives a reload', async ({
    page,
  }) => {
    await page.goto('/');
    const exportableBefore = await funnel(page, 'exportable');
    expect(await statusOf(page, 'c014')).toBe('Qualified');

    await page.goto('/blocklist');
    await expect(page.getByTestId('domain-loadedgg.agency')).toBeVisible();
    await expect(page.getByTestId('domain-apexcreators.co')).toBeVisible();

    await page.getByLabel('Competitor domain').fill('risingtalent.gg');
    await page.getByRole('button', { name: 'Add domain' }).click();
    await expect(page.getByTestId('domain-risingtalent.gg')).toBeVisible();

    await page.goto('/');
    expect(await statusOf(page, 'c014')).toBe('Blocked (agency)');
    await expect(page.getByTestId('trail-c014')).toContainText(
      'risingtalent.gg is a competing agency',
    );
    expect(await funnel(page, 'exportable')).toBe(exportableBefore - 1);

    // Persistence: the operator's edit is not server memory, it rides with them.
    await page.reload();
    expect(await statusOf(page, 'c014')).toBe('Blocked (agency)');
    expect(await funnel(page, 'exportable')).toBe(exportableBefore - 1);

    await page.goto('/blocklist');
    await expect(page.getByTestId('domain-risingtalent.gg')).toBeVisible();
    await page.reload();
    await expect(page.getByTestId('domain-risingtalent.gg')).toBeVisible();
  });

  // AC (FR6, FR7, FR11): removing a domain releases the prospect it was blocking,
  // and the manager reports how many prospects the list currently costs.
  test('removing a seeded domain releases its prospect and updates the blocked count', async ({
    page,
  }) => {
    await page.goto('/');
    const exportableBefore = await funnel(page, 'exportable');
    expect(await statusOf(page, 'c025')).toBe('Blocked (agency)');

    await page.goto('/blocklist');
    await expect(page.getByTestId('blocked-count')).toHaveText('3');
    await page.getByRole('button', { name: 'Remove talentnest.io' }).click();
    await expect(page.getByTestId('domain-talentnest.io')).toHaveCount(0);
    await expect(page.getByTestId('blocked-count')).toHaveText('2');

    await page.goto('/');
    expect(await statusOf(page, 'c025')).toBe('Qualified');
    expect(await funnel(page, 'exportable')).toBe(exportableBefore + 1);
  });

  // Edge case (FR7): a non-technical operator typing rubbish gets told, not a 500.
  test('rejects input that is not a domain and keeps the list intact', async ({ page }) => {
    await page.goto('/blocklist');

    await page.getByLabel('Competitor domain').fill('not a domain');
    await page.getByRole('button', { name: 'Add domain' }).click();
    await expect(page.getByTestId('domain-error')).toContainText('does not look like a domain');
    await expect(page.getByTestId('domain-loadedgg.agency')).toBeVisible();

    // A pasted URL or address is tidied into a domain rather than rejected.
    await page.getByLabel('Competitor domain').fill('https://Scout-Rivals.COM/roster?x=1');
    await page.getByRole('button', { name: 'Add domain' }).click();
    await expect(page.getByTestId('domain-scout-rivals.com')).toBeVisible();
  });
});
