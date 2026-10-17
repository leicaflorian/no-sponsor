// Renders the Chrome Web Store images into .output/store-assets/: five screenshots (1280 × 800) of the
// extension at work on the saved pages, and the two promotional tiles (440 × 280, 1400 × 560).
// Usage: npm run store-assets   (builds the extension first)
// The screenshots are in English: the browser runs in English, so the extension's texts are too.
// Unlike the e2e tests, the saved pages may load their images and fonts from the network: a fresh
// profile with no cookies, as when the pages were saved.
// The store wants 24-bit images without alpha: every PNG is re-encoded without it (sips, macOS).
import { execFileSync } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { BrowserContext, Page, Worker } from '@playwright/test';
import { CHROMIUM_DEFAULTS_DOMAIN, FIXTURES_DIR, ROOT, launch, popupUrl, setSettings } from '../tests/e2e/harness';

// The few chrome.* APIs used here, in the service worker and in the popup.
declare const chrome: {
  tabs: { query(q: { active: boolean; lastFocusedWindow: boolean }): Promise<{ id?: number }[]> };
};

const OUT = join(ROOT, '.output/store-assets');
const SOURCES = join(ROOT, '.github/assets/store');

// The page area inside the frame of screenshot.html: 1160 px wide, 610 px under the window bar.
const VIEW = { width: 1160, height: 610 };

type Shot = {
  file: string;
  title: string; // <b> marks the words in amber
  text: string;
  site: string;
  page: string;
  host: string;
  mode: 'highlight' | 'collapse' | 'hide';
  popup?: boolean;
  scrollTo?: string; // the element to bring near the top; the first sponsored item by default
  remove?: string[]; // page elements in the way (cookie banners, overlapping texts)
  prepare?: (page: Page) => Promise<void>;
};

const SHOTS: Shot[] = [
  {
    file: '1-highlight-subito.png',
    title: 'Spot <b>sponsored</b> listings at a glance',
    text: 'Highlight: an amber border and a SPONSOR badge on every paid result.',
    site: 'subito',
    page: 'ricerca',
    host: 'subito.it',
    mode: 'highlight',
    remove: ['[class*="snackbar-wrapper"]'],
  },
  {
    file: '2-collapse-amazon.png',
    title: '<b>Collapse</b> sponsored products',
    text: 'Each one becomes a thin bar that opens again with a click.',
    site: 'amazon',
    page: 'ricerca',
    host: 'amazon.it',
    mode: 'collapse',
    scrollTo: 'body',
  },
  {
    file: '3-hide-popup-amazon.png',
    title: 'Highlight, collapse or <b>hide</b>: you choose',
    text: 'The count, the mode, a switch for each site and a link to report a problem.',
    site: 'amazon',
    page: 'ricerca',
    host: 'amazon.it',
    mode: 'hide',
    popup: true,
    scrollTo: 'body',
  },
  {
    file: '4-youtube-ads.png',
    title: 'YouTube video ads at <b>16x</b>',
    text: 'Picture veiled, sound muted and the time left on screen, until the video is back.',
    site: 'youtube',
    page: 'annuncio',
    host: 'youtube.com',
    mode: 'highlight',
    remove: ['.ytp-time-display'],
    prepare: async (page) => {
      await page.waitForFunction(() => (document.querySelector('video') as HTMLVideoElement).readyState >= 1);
      await page.evaluate(() => document.querySelector('#movie_player')?.classList.add('ad-showing'));
      await page.waitForFunction(
        () => (document.querySelector('#movie_player') as HTMLElement).dataset['nspRemaining'],
      );
    },
  },
  {
    file: '5-highlight-ebay.png',
    title: 'Found even when the label is <b>hidden</b>',
    text: 'eBay scrambles its "Sponsored" labels: NoSponsor still reads them.',
    site: 'ebay',
    page: 'ricerca',
    host: 'ebay.it',
    mode: 'highlight',
    scrollTo: 'li.nsp-hit',
    remove: ['#gdpr-banner'],
  },
];

const TILES = [
  { file: 'small-tile-440x280.png', source: 'small-tile.html', width: 440, height: 280 },
  { file: 'marquee-1400x560.png', source: 'marquee.html', width: 1400, height: 560 },
];

const dataUrl = (png: Buffer) => `data:image/png;base64,${png.toString('base64')}`;

// Wait after load: the 4 s fullScan plus the 250 ms of report(), with margin (as in the e2e harness).
const SETTLE_MS = 4_600;

// openFixture() of the e2e harness, letting images and fonts through.
async function openShot(context: BrowserContext, site: string, name: string): Promise<Page> {
  const meta = JSON.parse(readFileSync(join(FIXTURES_DIR, site, `${name}.meta.json`), 'utf8')) as { url: string };
  const html = readFileSync(join(FIXTURES_DIR, site, `${name}.html`));
  await context.unrouteAll({ behavior: 'ignoreErrors' });
  await context.route('**/*', async (route) => {
    const req = route.request();
    let mainFrame = false;
    try {
      mainFrame = req.isNavigationRequest() && req.frame().parentFrame() === null;
    } catch {
      // requests without a frame (service worker): blocked
    }
    if (mainFrame) await route.fulfill({ status: 200, contentType: 'text/html; charset=utf-8', body: html });
    else if (['image', 'font'].includes(req.resourceType())) await route.continue();
    else await route.abort();
  });
  const page = await context.newPage();
  await page.setViewportSize(VIEW);
  await page.goto(meta.url);
  await page.waitForTimeout(SETTLE_MS);
  return page;
}

// Gets the page ready for the picture: removes what is in the way, hides the images that did not
// load (broken-image icons), and scrolls `selector` near the top, with some context above it.
async function frameShot(page: Page, selector: string, remove: string[]): Promise<void> {
  await page.evaluate(
    ([sel, rm]) => {
      for (const el of document.querySelectorAll(rm.join(',') || ':not(*)')) el.remove();
      for (const img of document.images) if (img.complete && !img.naturalWidth) img.style.visibility = 'hidden';
      const target = document.querySelector(sel);
      if (target) window.scrollTo(0, Math.max(0, target.getBoundingClientRect().top + window.scrollY - 140));
    },
    [selector, remove] as const,
  );
  await page.waitForTimeout(300);
}

// The popup of `page`'s tab. Opened in a tab of its own, the popup would take itself for the active
// tab: tabs.query is replaced, before the popup starts, with one that returns `page`'s tab.
async function popupImage(context: BrowserContext, sw: Worker, page: Page): Promise<Buffer> {
  await page.bringToFront();
  const tabId = await sw.evaluate(
    async () => (await chrome.tabs.query({ active: true, lastFocusedWindow: true }))[0]?.id,
  );
  if (tabId === undefined) throw new Error('No active tab');
  const popup = await context.newPage();
  // wxt/browser uses the `browser` namespace when Chromium has it, `chrome` otherwise. A string, not a
  // function: tsx (esbuild, keepNames) would add __name, which doesn't exist in the page.
  await popup.addInitScript({
    content: `for (const ns of [globalThis.browser, globalThis.chrome])
      if (ns && ns.tabs) ns.tabs.query = async () => [{ id: ${tabId} }];`,
  });
  // openShot() aborts most requests of the context: let the popup load its own files.
  await popup.route('**/*', (route) => route.continue());
  await popup.setViewportSize({ width: 300, height: 600 });
  await popup.goto(popupUrl(sw));
  await popup.waitForFunction(() => /^\d+$/.test(document.getElementById('count')?.textContent ?? ''));
  const png = await popup.locator('body').screenshot();
  await popup.close();
  return png;
}

async function render(context: BrowserContext, html: string, width: number, height: number, file: string) {
  const page = await context.newPage();
  await page.setViewportSize({ width, height });
  await page.setContent(html);
  await page.evaluate(() => Promise.all([...document.images].map((img) => img.decode())));
  const path = join(OUT, file);
  writeFileSync(path, await page.screenshot({ clip: { x: 0, y: 0, width, height } }));
  await page.close();
  // Re-encode without the alpha channel: PNG -> JPEG drops it, JPEG -> PNG gives a 24-bit PNG.
  const jpg = `${path}.jpg`;
  execFileSync('sips', ['-s', 'format', 'jpeg', '-s', 'formatOptions', 'best', path, '--out', jpg], {
    stdio: 'ignore',
  });
  execFileSync('sips', ['-s', 'format', 'png', jpg, '--out', path], { stdio: 'ignore' });
  execFileSync('rm', [jpg]);
  console.log(`.output/store-assets/${file}`);
}

mkdirSync(OUT, { recursive: true });
const frame = readFileSync(join(SOURCES, 'screenshot.html'), 'utf8');
const { context, sw } = await launch('en');
try {
  for (const shot of SHOTS) {
    await setSettings(sw, { mode: shot.mode, generic: true, disabledHosts: [] });
    const page = await openShot(context, shot.site, shot.page);
    await shot.prepare?.(page);
    await frameShot(page, shot.scrollTo ?? '.nsp-hit, .nsp-collapsed', shot.remove ?? []);
    const pagePng = await page.screenshot();
    const popup = shot.popup ? `<img src="${dataUrl(await popupImage(context, sw, page))}" alt="" />` : '';
    const html = frame
      .replace('{{TITLE}}', shot.title)
      .replace('{{TEXT}}', shot.text)
      .replace('{{HOST}}', shot.host)
      .replace('{{SHOT}}', dataUrl(pagePng))
      .replace('{{POPUP}}', popup);
    await page.close();
    await render(context, html, 1280, 800, shot.file);
  }
  for (const tile of TILES) {
    const html = readFileSync(join(SOURCES, tile.source), 'utf8');
    await render(context, html, tile.width, tile.height, tile.file);
  }
} finally {
  await context.close();
  // launch('en') wrote the language in the preferences of Playwright's Chromium (macOS).
  if (process.platform === 'darwin') {
    try {
      execFileSync('defaults', ['delete', CHROMIUM_DEFAULTS_DOMAIN, 'AppleLanguages'], { stdio: 'ignore' });
    } catch {
      // never set
    }
  }
}
