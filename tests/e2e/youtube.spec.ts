import { expect, test, type BrowserContext, type Page, type Worker } from '@playwright/test';
import { launch, openFixture, setSettings } from './harness';

// The ad veil arrived in 1.0.4: nothing to compare with 0.1.0.
test.skip(process.env['NSP_EXT'] === 'legacy', 'YouTube ad veil is newer than 0.1.0');

let context: BrowserContext;
let sw: Worker;
let page: Page;

test.beforeEach(async () => {
  ({ context, sw } = await launch());
  page = await openFixture(context, 'youtube', 'annuncio');
});

test.afterEach(async () => {
  await context.close();
});

const setAd = (on: boolean) =>
  page.evaluate((v) => document.querySelector('#movie_player')?.classList.toggle('ad-showing', v), on);

const state = () =>
  page.evaluate(() => {
    const player = document.querySelector('#movie_player') as HTMLElement;
    const video = player.querySelector('video') as HTMLVideoElement;
    const card = player.querySelector('.ytp-ad-player-overlay-layout__player-card-container') as HTMLElement;
    return {
      opacity: getComputedStyle(video).opacity,
      muted: video.muted,
      rate: video.playbackRate,
      card: getComputedStyle(card).display,
      remaining: player.dataset['nspRemaining'] ?? null,
      label: getComputedStyle(player, '::after').content,
    };
  });

test('veils the ad, plays it at 16x and keeps Skip visible', async () => {
  // The video must have loaded its metadata, otherwise the duration is unknown.
  await page.waitForFunction(() => (document.querySelector('video') as HTMLVideoElement).readyState >= 1);
  await setAd(true);
  await expect.poll(async () => (await state()).muted, { timeout: 1_000 }).toBe(true);
  const s = await state();
  expect(s.opacity).toBe('0');
  expect(s.rate).toBe(16);
  expect(s.card).toBe('none');
  expect(s.remaining).toMatch(/^0:\d\d$/);
  expect(s.label).toContain('Annuncio · mancano');
  await expect(page.locator('.ytp-skip-ad-button')).toBeVisible();
});

test('mutes again when the page turns the audio back on during the ad', async () => {
  await setAd(true);
  await expect.poll(async () => (await state()).muted, { timeout: 1_000 }).toBe(true);
  // What YouTube's player does when it loads the ad: no click or key press involved.
  await page.evaluate(() => {
    (document.querySelector('#movie_player video') as HTMLVideoElement).muted = false;
  });
  await expect.poll(async () => (await state()).muted, { timeout: 1_000 }).toBe(true);
});

test('restores everything when the ad ends', async () => {
  await setAd(true);
  await expect.poll(async () => (await state()).muted, { timeout: 1_000 }).toBe(true);
  await setAd(false);
  await expect.poll(async () => (await state()).muted, { timeout: 1_000 }).toBe(false);
  const s = await state();
  expect(s.opacity).toBe('1');
  expect(s.rate).toBe(1);
  expect(s.remaining).toBeNull();
});

test('does nothing when YouTube is disabled', async () => {
  await setSettings(sw, { disabledHosts: ['youtube.com'] });
  await expect
    .poll(() => page.evaluate(() => document.documentElement.dataset['nspYt']), { timeout: 1_000 })
    .toBe('off');
  await setAd(true);
  await page.waitForTimeout(600);
  const s = await state();
  expect(s.opacity).toBe('1');
  expect(s.muted).toBe(false);
  expect(s.rate).toBe(1);
});
