import { expect, test, type BrowserContext, type Page, type Worker } from '@playwright/test';
import { launch, openFixture, setSettings } from './harness';

// The Prime Video ad veil is newer than 0.1.0: nothing to compare with.
test.skip(process.env['NSP_EXT'] === 'legacy', 'Prime Video ad veil is newer than 0.1.0');

let context: BrowserContext;
let sw: Worker;
let page: Page;

test.beforeEach(async () => {
  ({ context, sw } = await launch());
  page = await openFixture(context, 'primevideo', 'annuncio');
});

test.afterEach(async () => {
  await context.close();
});

const state = () =>
  page.evaluate(() => {
    const player = document.querySelector('#dv-web-player') as HTMLElement;
    const video = player.querySelector('video') as HTMLVideoElement;
    const preview = document.querySelector('#preview') as HTMLVideoElement;
    return {
      opacity: getComputedStyle(video).opacity,
      muted: video.muted,
      rate: video.playbackRate,
      remaining: player.dataset['nspRemaining'] ?? null,
      label: getComputedStyle(player, '::after').content,
      previewOpacity: getComputedStyle(preview).opacity,
      previewMuted: preview.muted,
    };
  });

test('veils the ad, plays it at 16x and writes the time left', async () => {
  await expect.poll(async () => (await state()).muted, { timeout: 1_000 }).toBe(true);
  const s = await state();
  expect(s.opacity).toBe('0');
  expect(s.rate).toBe(16);
  expect(s.remaining).toBe('0:07');
  expect(s.label).toContain('Annuncio · mancano');
  expect(s.previewOpacity).toBe('1');
  expect(s.previewMuted).toBe(false);
  await expect(page.getByText('Pubblicità', { exact: true })).toBeVisible();
  await expect(page.locator('.nsp-hit')).toHaveCount(0);
});

test('restores everything when the ad ends', async () => {
  await expect.poll(async () => (await state()).muted, { timeout: 1_000 }).toBe(true);
  await page.evaluate(() => document.querySelector('.ad-block')?.remove());
  await expect.poll(async () => (await state()).muted, { timeout: 1_000 }).toBe(false);
  const s = await state();
  expect(s.opacity).toBe('1');
  expect(s.rate).toBe(1);
  expect(s.remaining).toBeNull();
});

test('does nothing when Prime Video is disabled', async () => {
  await expect.poll(async () => (await state()).muted, { timeout: 1_000 }).toBe(true);
  await setSettings(sw, { disabledHosts: ['primevideo.com'] });
  await expect
    .poll(() => page.evaluate(() => document.documentElement.dataset['nspPv']), { timeout: 1_000 })
    .toBe('off');
  await page.waitForTimeout(600);
  const s = await state();
  expect(s.opacity).toBe('1');
  expect(s.muted).toBe(false);
  expect(s.rate).toBe(1);
});
