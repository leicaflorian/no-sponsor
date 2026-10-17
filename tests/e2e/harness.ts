import { chromium, type BrowserContext, type Page, type Worker } from '@playwright/test';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
export const FIXTURES_DIR = join(ROOT, 'tests/fixtures');
export const LEGACY_DIR = join(ROOT, 'node_modules/.cache/nsp-legacy-0.1.0');

// Wait after load: the 4 s fullScan plus the 250 ms of report(), with margin.
const SETTLE_MS = 4_600;

// The few chrome.* APIs used inside the service worker (the code passed to sw.evaluate runs there).
declare const chrome: {
  tabs: { query(q: { active: boolean; lastFocusedWindow: boolean }): Promise<{ id?: number }[]> };
  action: { getBadgeText(d: { tabId: number }): Promise<string> };
  storage: { sync: { set(items: object): Promise<void> } };
};

export type Hit = { path: string; reason: string; inset: boolean; rel: boolean };
export type Recording = { hits: Hit[]; badge: string; mode: string };
export type Settings = { mode: string; generic: boolean; disabledHosts: string[] };
export type Fixture = { site: string; name: string };

export function extensionPath(): string {
  return process.env['NSP_EXT'] === 'legacy' ? LEGACY_DIR : join(ROOT, '.output/chrome-mv3');
}

// All saved pages: each tests/fixtures/<site>/<page>.html with its .meta.json.
export function listFixtures(): Fixture[] {
  const out: Fixture[] = [];
  for (const site of readdirSync(FIXTURES_DIR, { withFileTypes: true })) {
    if (!site.isDirectory()) continue;
    for (const file of readdirSync(join(FIXTURES_DIR, site.name)).sort()) {
      if (!file.endsWith('.html')) continue;
      const name = file.slice(0, -'.html'.length);
      if (existsSync(join(FIXTURES_DIR, site.name, `${name}.meta.json`))) out.push({ site: site.name, name });
    }
  }
  return out.sort((a, b) => `${a.site}/${a.name}`.localeCompare(`${b.site}/${b.name}`));
}

export function expectedPath(site: string, name: string): string {
  return join(FIXTURES_DIR, site, `${name}.expected.json`);
}

export async function launch(): Promise<{ context: BrowserContext; sw: Worker }> {
  const path = extensionPath();
  if (!existsSync(join(path, 'manifest.json'))) throw new Error(`Extension not found in ${path}`);
  const context = await chromium.launchPersistentContext('', {
    channel: 'chromium',
    viewport: { width: 1280, height: 900 },
    args: [`--disable-extensions-except=${path}`, `--load-extension=${path}`],
  });
  const sw = context.serviceWorkers()[0] ?? (await context.waitForEvent('serviceworker'));
  return { context, sw };
}

export async function openFixture(context: BrowserContext, site: string, name: string): Promise<Page> {
  const meta = JSON.parse(readFileSync(join(FIXTURES_DIR, site, `${name}.meta.json`), 'utf8')) as { url: string };
  const html = readFileSync(join(FIXTURES_DIR, site, `${name}.html`));
  // One handler at a time, even if several pages are opened in the same context.
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
    else await route.abort();
  });
  const page = context.pages().find((p) => p.url() === 'about:blank') ?? (await context.newPage());
  await page.goto(meta.url);
  await page.waitForTimeout(SETTLE_MS);
  return page;
}

// Badge text of `page`'s tab, read in the service worker.
export async function badgeText(page: Page, sw: Worker): Promise<string> {
  await page.bringToFront();
  return sw.evaluate(async () => {
    const [tab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
    if (tab?.id === undefined) throw new Error('no active tab');
    return chrome.action.getBadgeText({ tabId: tab.id });
  });
}

export async function record(page: Page, sw: Worker): Promise<Recording> {
  // No named functions inside evaluate: tsx (esbuild, keepNames) would add __name, which doesn't exist in the page.
  const { hits, mode } = await page.evaluate(() => ({
    hits: [...document.querySelectorAll<HTMLElement>('.nsp-hit')].map((el) => {
      const parts: string[] = [];
      for (let n: Element | null = el; n; n = n.parentElement) {
        let k = 1;
        for (let s = n.previousElementSibling; s; s = s.previousElementSibling) if (s.tagName === n.tagName) k++;
        parts.unshift(`${n.tagName.toLowerCase()}:nth-of-type(${k})`);
      }
      return {
        path: parts.join(' > '),
        reason: el.dataset['nspReason'] ?? '',
        inset: el.classList.contains('nsp-inset'),
        rel: el.classList.contains('nsp-rel'),
      };
    }),
    mode: document.documentElement.dataset['nspMode'] ?? '',
  }));
  return { hits, badge: await badgeText(page, sw), mode };
}

export async function setSettings(sw: Worker, patch: Partial<Settings>): Promise<void> {
  await sw.evaluate((p) => chrome.storage.sync.set(p), patch);
}
