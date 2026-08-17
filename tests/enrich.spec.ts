import { expect, test } from '@playwright/test';
import { enrichAll, seedMockKey, statusOf } from './helpers';

const HINT = 'Choose a provider and paste your API key in Settings to enable live AI.';

test.describe('Contact enrichment (the AI step)', () => {
  // AC: clicking Enrich contacts returns a business email plus its source field
  // for each qualified creator; with no AI key configured the rows still fill and
  // are labelled `fallback` (FR5, FR12).
  test('with no key at all, Enrich contacts still fills every row and labels it fallback', async ({
    page,
  }) => {
    await page.goto('/?minAcv=300&minHours=60&minFollowers=10000&maxDays=14');

    await expect(page.getByTestId('source-c001')).toHaveText('not enriched');

    await enrichAll(page);

    // A real address plus the field it was read out of.
    await expect(page.getByTestId('email-c001')).toHaveText('ash@ashvelocity.tv');
    await expect(page.getByTestId('source-c001')).toHaveText('business_panel');
    await expect(page.getByTestId('mode-c001')).toHaveText('fallback');

    // Obfuscated `[at]`/`[dot]` text is still resolved.
    await expect(page.getByTestId('email-c003')).toHaveText('booking@pixelhermit.gg');
    await expect(page.getByTestId('source-c003')).toHaveText('booking_panel');

    // The fan-mail gmail in the bio is NOT the business address.
    await expect(page.getByTestId('email-c005')).toHaveText('priya@sableroute.co');
    await expect(page.getByTestId('source-c005')).toHaveText('booking_panel');

    // Keyless behaviour is explained rather than silently degraded.
    await expect(page.getByTestId('enrich-notice')).toContainText(HINT);
  });

  // AC (FR12): a creator with no published address fails enrichment loudly and is
  // dropped with a reason instead of erroring or exporting a blank cell.
  test('a creator with no published address is labelled Enrich failed, not exported', async ({
    page,
  }) => {
    await page.goto('/?minAcv=300&minHours=60&minFollowers=10000&maxDays=14');
    await enrichAll(page);

    await expect(page.getByTestId('email-c008')).toHaveText('—');
    expect(await statusOf(page, 'c008')).toBe('Enrich failed');
    await expect(page.getByTestId('trail-c008')).toContainText('no published business address');
  });

  // AC (BYOK gate): with no key saved, the board and Settings both say what to do.
  test('with no key the BYOK hint is visible on the board and in Settings', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByTestId('byok-banner')).toContainText(HINT);
    await expect(page.getByTestId('byok-banner')).toContainText(/shared/i);

    await page.goto('/settings');
    await expect(page.getByTestId('byok-status')).toContainText('No API key saved');
    await expect(page.getByTestId('byok-hint')).toHaveText(HINT);
  });

  // AC (BYOK happy path): with a key saved, enrichment runs through the visitor's
  // own provider — here a mock provider so the suite needs no real key.
  test('with a key saved, enrichment runs on the visitor key and is labelled accordingly', async ({
    page,
  }) => {
    await seedMockKey(page);
    await page.goto('/?minAcv=300&minHours=60&minFollowers=10000&maxDays=14');

    await expect(page.getByTestId('byok-banner')).toContainText('mock');
    await expect(page.getByTestId('byok-banner')).not.toContainText(HINT);

    await enrichAll(page);

    await expect(page.getByTestId('email-c013')).toHaveText('yuki@silentaperture.jp');
    await expect(page.getByTestId('source-c013')).toHaveText('business_panel');
    await expect(page.getByTestId('mode-c013')).toHaveText('mock');
    await expect(page.getByTestId('enrich-notice')).toContainText(/your own key/i);
  });

  // AC (Settings UI): three controls, provider-specific model list, save + clear.
  test('Settings saves one blob to localStorage.byok and can clear it', async ({ page }) => {
    await page.goto('/settings');

    await page.getByLabel('Provider').selectOption('openai');
    await expect(page.getByLabel('OpenAI API key')).toBeVisible();
    await expect(page.getByLabel('Model')).toHaveValue('gpt-4o-mini');
    await page.getByLabel('Model').selectOption('gpt-4o');
    await page.getByLabel('OpenAI API key').fill('sk-test-not-a-real-key');
    await page.getByRole('button', { name: 'Save settings' }).click();

    await expect(page.getByTestId('byok-status')).toContainText('OpenAI');
    const saved = await page.evaluate(() => window.localStorage.getItem('byok'));
    expect(JSON.parse(saved ?? '{}')).toEqual({
      provider: 'openai',
      apiKey: 'sk-test-not-a-real-key',
      model: 'gpt-4o',
    });

    await page.getByRole('button', { name: 'Clear key' }).click();
    await expect(page.getByTestId('byok-status')).toContainText('No API key saved');
    expect(await page.evaluate(() => window.localStorage.getItem('byok'))).toBeNull();
  });
});
