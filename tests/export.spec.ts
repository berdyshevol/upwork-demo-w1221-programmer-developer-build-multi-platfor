import { readFile } from 'node:fs/promises';
import { expect, test } from '@playwright/test';
import { CSV_HEADERS } from '../lib/pipeline';
import { enrichAll, funnel } from './helpers';

const HEADER_ROW = CSV_HEADERS.join(',');

async function downloadCsv(page: import('@playwright/test').Page): Promise<string[]> {
  const [download] = await Promise.all([
    page.waitForEvent('download'),
    page.getByTestId('export').click(),
  ]);
  expect(download.suggestedFilename()).toBe('scoutpipe-gmass-export.csv');
  const path = await download.path();
  const text = await readFile(path, 'utf8');
  return text.split('\r\n').filter((line) => line.length > 0);
}

test.describe('GMass export', () => {
  // AC: the exported CSV opens with the exact GMass header order and one clean row
  // per qualified creator, with no blanks in Email or ChannelName (FR10).
  test('exports the exact GMass header order and one clean row per qualified creator', async ({
    page,
  }) => {
    await page.goto('/?minAcv=150&minHours=60&minFollowers=10000&maxDays=45');
    const exportable = await funnel(page, 'exportable');
    expect(exportable).toBeGreaterThan(5);

    const lines = await downloadCsv(page);

    expect(lines[0]).toBe(
      'Email,FirstName,ChannelName,Platform,ProfileURL,ACV,HoursStreamed,Followers,LastLive,KickStatus,Score',
    );
    expect(lines[0]).toBe(HEADER_ROW);
    expect(lines).toHaveLength(exportable + 1);

    for (const line of lines.slice(1)) {
      const cells = line.split(',');
      expect(cells, `wrong cell count in: ${line}`).toHaveLength(CSV_HEADERS.length);
      expect(cells[0], `blank Email in: ${line}`).toContain('@');
      expect(cells[2], `blank ChannelName in: ${line}`).not.toBe('');
      for (const cell of cells) expect(cell.trim()).not.toBe('');
    }

    // Nobody the board dropped is in the file.
    const body = lines.slice(1).join('\n');
    expect(body).not.toContain('loadedgg.agency'); // blocked agency domain
    expect(body).not.toContain('KettleAndCrown'); // duplicate from prior scouting
    expect(body).not.toContain('VoidPacer'); // active on Kick
    expect(body).not.toContain('HollowBeamGG'); // no contact could be enriched
    expect(body).toContain('AshVelocity');
  });

  // AC (FR10 + FR5): the file matches what the operator sees after enrichment.
  test('the CSV matches the board after enrichment, and honours the live blocklist', async ({
    page,
  }) => {
    await page.goto('/?minAcv=300&minHours=60&minFollowers=10000&maxDays=14');
    await enrichAll(page);

    const before = await downloadCsv(page);
    expect(before).toHaveLength((await funnel(page, 'exportable')) + 1);
    expect(before.join('\n')).toContain('priya@sableroute.co');
    expect(before.join('\n')).toContain('noor@risingtalent.gg');

    await page.goto('/blocklist');
    await page.getByLabel('Competitor domain').fill('risingtalent.gg');
    await page.getByRole('button', { name: 'Add domain' }).click();

    await page.goto('/?minAcv=300&minHours=60&minFollowers=10000&maxDays=14');
    const after = await downloadCsv(page);
    expect(after.join('\n')).not.toContain('noor@risingtalent.gg');
    expect(after).toHaveLength(before.length - 1);
  });
});
