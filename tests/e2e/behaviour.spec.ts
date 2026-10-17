import { expect, test, type BrowserContext, type Page, type Worker } from '@playwright/test';
import { badgeText, launch, openFixture, setSettings } from './harness';

let context: BrowserContext;
let sw: Worker;
let page: Page;

test.beforeEach(async () => {
  ({ context, sw } = await launch());
  page = await openFixture(context, 'ebay', 'ricerca');
});

test.afterEach(async () => {
  await context.close();
});

const hitCount = () => page.locator('.nsp-hit').count();
const mode = () => page.evaluate(() => document.documentElement.dataset['nspMode']);

// Beyond the report() window (250 ms debounce plus the message to the service worker): a recount
// caused by the settings change would have time to show up in the count and in the badge.
const REPORT_WINDOW_MS = 500;

// Computed style of the first .nsp-hit: proves the content script CSS is applied.
const hitStyle = () =>
  page.evaluate(() => {
    const hit = document.querySelector('.nsp-hit');
    if (!hit) throw new Error('no .nsp-hit');
    const cs = getComputedStyle(hit);
    return { display: cs.display, maxHeight: cs.maxHeight, outlineStyle: cs.outlineStyle };
  });

test('modes', async () => {
  const before = await hitCount();
  const badge = await badgeText(page, sw);
  expect(before).toBeGreaterThan(0);
  for (const m of ['collapse', 'hide', 'highlight']) {
    await setSettings(sw, { mode: m });
    await expect.poll(mode, { timeout: 500 }).toBe(m);
    await page.waitForTimeout(REPORT_WINDOW_MS);
    expect(await hitCount()).toBe(before);
    expect(await badgeText(page, sw)).toBe(badge);
    const style = await hitStyle();
    if (m === 'hide') expect(style.display).toBe('none');
    if (m === 'collapse') expect(style.maxHeight).toBe('36px');
    if (m === 'highlight') expect(style.outlineStyle).not.toBe('none');
  }
});

test('disabled on the site', async () => {
  const before = await hitCount();
  const badge = await badgeText(page, sw);
  expect(before).toBeGreaterThan(0);
  // The page is on www.ebay.it: the content script strips "www." from the host.
  await setSettings(sw, { disabledHosts: ['ebay.it'] });
  await expect.poll(mode, { timeout: 500 }).toBe('off');
  await page.waitForTimeout(REPORT_WINDOW_MS);
  expect(await hitCount()).toBe(before);
  expect(await badgeText(page, sw)).toBe(badge);
});

test('content added later', async () => {
  const before = await hitCount();
  const badge = Number(await badgeText(page, sw));
  expect(before).toBeGreaterThan(0);
  await page.evaluate(() => {
    const hit = document.querySelector('.nsp-hit');
    if (!hit?.parentElement) throw new Error('no .nsp-hit');
    const clone = hit.cloneNode(true) as HTMLElement;
    for (const el of [clone, ...clone.querySelectorAll<HTMLElement>('*')]) {
      for (const c of [...el.classList]) if (c.startsWith('nsp-')) el.classList.remove(c);
      el.removeAttribute('data-nsp-reason');
    }
    hit.parentElement.appendChild(clone);
  });
  await expect.poll(hitCount, { timeout: 1_000 }).toBe(before + 1);
  await expect.poll(() => badgeText(page, sw), { timeout: 1_000 }).toBe(String(badge + 1));
});

test('collapse opens on click', async () => {
  await setSettings(sw, { mode: 'collapse' });
  await expect.poll(mode, { timeout: 500 }).toBe('collapse');
  const first = page.locator('.nsp-hit').first();
  await first.click();
  await expect(first).toHaveClass(/(^|\s)nsp-open(\s|$)/);
});
