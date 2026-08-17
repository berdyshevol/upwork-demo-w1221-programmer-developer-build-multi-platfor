import { Page, expect } from '@playwright/test';

export const ROW_SELECTOR = '[data-testid^="row-c"]';

export async function funnel(page: Page, key: string): Promise<number> {
  const text = await page.getByTestId(`funnel-${key}`).innerText();
  return Number(text.trim());
}

export async function visibleRowIds(page: Page): Promise<string[]> {
  return page.locator(ROW_SELECTOR).evaluateAll((nodes) =>
    nodes.map((n) => (n.getAttribute('data-testid') ?? '').replace('row-', '')),
  );
}

export async function statusOf(page: Page, id: string): Promise<string> {
  return (await page.getByTestId(`status-${id}`).innerText()).trim();
}

export async function scoresInOrder(page: Page): Promise<number[]> {
  return page
    .locator('[data-testid^="score-c"]')
    .evaluateAll((nodes) => nodes.map((n) => Number((n.textContent ?? '').trim())));
}

/** Fill the threshold controls the way an operator would. */
export async function setThresholds(
  page: Page,
  values: { acv?: string; hours?: string; followers?: string; days?: string },
): Promise<void> {
  if (values.acv !== undefined) {
    await page.getByLabel('Min avg concurrent viewers (ACV)').fill(values.acv);
  }
  if (values.hours !== undefined) await page.getByLabel('Min hours streamed').fill(values.hours);
  if (values.followers !== undefined) await page.getByLabel('Min followers').fill(values.followers);
  if (values.days !== undefined) {
    await page.getByLabel('Max days since last live').fill(values.days);
  }
}

export async function enrichAll(page: Page): Promise<void> {
  await page.getByTestId('enrich').click();
  await expect(page.getByTestId('enrich')).toBeEnabled({ timeout: 45_000 });
  await expect(page.getByTestId('enrich-notice')).toBeVisible();
}

export const MOCK_BYOK = JSON.stringify({ provider: 'mock', apiKey: 'test', model: 'mock' });

/** Seed a sentinel key so the AI path runs deterministically, with no network. */
export async function seedMockKey(page: Page): Promise<void> {
  await page.addInitScript((value) => {
    window.localStorage.setItem('byok', value);
  }, MOCK_BYOK);
}
