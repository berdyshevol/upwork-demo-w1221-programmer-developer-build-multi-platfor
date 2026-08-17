import { expect, test } from '@playwright/test';
import { ROW_SELECTOR, funnel, scoresInOrder, setThresholds, visibleRowIds } from './helpers';

test.describe('Pipeline board — roster, thresholds, ranking, funnel', () => {
  // AC: the board opens on the seeded 40-creator roster with metrics and the
  // funnel summary (FR1, FR11).
  test('opens on all 40 seeded creators with metrics and a funnel summary', async ({ page }) => {
    await page.goto('/');

    await expect(page.getByRole('heading', { name: /ScoutPipe/i })).toBeVisible();
    await expect(page.locator(ROW_SELECTOR)).toHaveCount(40);
    expect(await funnel(page, 'roster')).toBe(40);
    expect(await funnel(page, 'thresholds')).toBe(40);

    // Metrics for a specific creator: ACV, hours, followers, last live.
    await expect(page.getByTestId('acv-c001')).toHaveText('1840');
    await expect(page.getByTestId('hours-c001')).toHaveText('214');
    await expect(page.getByTestId('followers-c001')).toContainText('412,000');
    await expect(page.getByTestId('lastlive-c001')).toContainText('2026-08-16');
    await expect(page.getByTestId('platform-c001')).toHaveText('Twitch');
    await expect(page.getByTestId('platform-c003')).toHaveText('YouTube');

    // All six funnel stages are present.
    for (const key of ['roster', 'thresholds', 'kick', 'enriched', 'blocklist', 'exportable']) {
      await expect(page.getByTestId(`funnel-${key}`)).toBeVisible();
    }
  });

  // AC: raising min ACV and tightening recency visibly narrows and re-ranks the
  // table without a reload, and the funnel counters agree with the visible rows
  // (FR2, FR3, FR11).
  test('tightening ACV and recency narrows and re-ranks without a reload, and the funnel agrees', async ({
    page,
  }) => {
    await page.goto('/');
    await expect(page.locator(ROW_SELECTOR)).toHaveCount(40);

    // A marker that only survives if the page is never reloaded.
    await page.evaluate(() => {
      (window as unknown as Record<string, string>).__noReload = 'kept';
    });

    const rankBefore = Number(await page.getByTestId('rank-c034').innerText());
    const beforeIds = await visibleRowIds(page);
    expect(beforeIds).toContain('c039'); // PorchlightVODs: 75 ACV, live 81 days ago

    await setThresholds(page, { acv: '300', days: '14' });

    await expect(page.locator(ROW_SELECTOR)).toHaveCount(20);
    const afterIds = await visibleRowIds(page);
    expect(afterIds).not.toContain('c039');
    expect(afterIds.length).toBeLessThan(beforeIds.length);

    // Re-ranked: fewer rows above it, so this creator moves up.
    const rankAfter = Number(await page.getByTestId('rank-c034').innerText());
    expect(rankAfter).toBeLessThan(rankBefore);

    // Funnel counters agree with what is on screen.
    expect(await funnel(page, 'thresholds')).toBe(afterIds.length);
    expect(await funnel(page, 'roster')).toBe(40);

    // Still the same document — no navigation happened.
    expect(
      await page.evaluate(() => (window as unknown as Record<string, string>).__noReload),
    ).toBe('kept');
  });

  // AC (FR3): the composite score is visible per creator and drives the order.
  test('shows a composite score per creator and ranks by it, descending', async ({ page }) => {
    await page.goto('/');

    await expect(page.getByTestId('score-c001')).toBeVisible();
    await expect(page.getByTestId('score-c007')).toBeVisible();
    await expect(page.getByText(/audience 55/i)).toBeVisible();

    const scores = await scoresInOrder(page);
    expect(scores).toHaveLength(40);
    for (const value of scores) expect(Number.isNaN(value)).toBe(false);
    const sorted = [...scores].sort((a, b) => b - a);
    expect(scores).toEqual(sorted);
    await expect(page.getByTestId('rank-c007')).toHaveText('1');
  });

  // Edge case (FR2): thresholds live in the URL, so a filtered view is shareable.
  test('a filtered view is shareable — thresholds are restored from the URL', async ({ page }) => {
    await page.goto('/?minAcv=300&minHours=0&minFollowers=0&maxDays=14');

    await expect(page.getByLabel('Min avg concurrent viewers (ACV)')).toHaveValue('300');
    await expect(page.getByLabel('Max days since last live')).toHaveValue('14');
    await expect(page.locator(ROW_SELECTOR)).toHaveCount(20);
  });
});
