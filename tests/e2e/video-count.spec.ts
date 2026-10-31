import { expect, test, type BrowserContext, type Page, type Worker } from '@playwright/test';
import { badgeText, launch, openFixture } from './harness';
import { RESTORE_DELAY_MS } from '../../src/sites/ad-veil';

// Veiled video ads are newer than 0.1.0: nothing to compare with it.
test.skip(process.env['NSP_EXT'] === 'legacy', 'video ad count is newer than 0.1.0');

let context: BrowserContext;
let sw: Worker;
let page: Page;

test.afterEach(async () => {
  await context.close();
});

test('counts a veiled Prime Video break on the badge', async () => {
  ({ context, sw } = await launch());
  page = await openFixture(context, 'primevideo', 'annuncio');
  expect(await badgeText(page, sw)).toBe('1');
});

test('counts each YouTube break once', async () => {
  ({ context, sw } = await launch());
  page = await openFixture(context, 'youtube', 'annuncio');
  const setAd = (on: boolean) =>
    page.evaluate((v) => document.querySelector('#movie_player')?.classList.toggle('ad-showing', v), on);
  for (let i = 0; i < 2; i++) {
    await setAd(true);
    await page.waitForTimeout(RESTORE_DELAY_MS + 400);
    await setAd(false);
    await page.waitForTimeout(RESTORE_DELAY_MS + 400);
  }
  await expect.poll(() => badgeText(page, sw), { timeout: 3_000 }).toBe('2');
});
